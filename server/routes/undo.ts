import { Hono } from "hono";
import { db, schema, sqlite } from "../db/client";
import { eq, and, desc, asc } from "drizzle-orm";
import { getUndoState } from "../lib/events";

const app = new Hono();

// Get undo/redo state
app.get("/charts/:chartId/undo-state", async (c) => {
  const state = await getUndoState(c.req.param("chartId"));
  return c.json(state);
});

// Undo
app.post("/charts/:chartId/undo", async (c) => {
  const chartId = c.req.param("chartId");

  // Find most recent active batch
  const [lastActive] = await db
    .select()
    .from(schema.events)
    .where(
      and(eq(schema.events.chartId, chartId), eq(schema.events.undone, false))
    )
    .orderBy(desc(schema.events.createdAt))
    .limit(1);

  if (!lastActive) {
    const state = await getUndoState(chartId);
    return c.json({ batchId: null, ...state });
  }

  const batchId = lastActive.batchId;

  // Get all events in this batch, reverse order for undo
  const batchEvents = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.chartId, chartId),
        eq(schema.events.batchId, batchId)
      )
    )
    .orderBy(desc(schema.events.sequence));

  // Apply inverse operations in a transaction
  sqlite.exec("BEGIN");
  try {
    for (const event of batchEvents) {
      await applyInverse(event);
    }

    // Mark batch as undone
    await db
      .update(schema.events)
      .set({ undone: true })
      .where(
        and(
          eq(schema.events.chartId, chartId),
          eq(schema.events.batchId, batchId)
        )
      );

    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }

  const state = await getUndoState(chartId);
  return c.json({ batchId, ...state });
});

// Redo
app.post("/charts/:chartId/redo", async (c) => {
  const chartId = c.req.param("chartId");

  // Find oldest undone batch
  const [firstUndone] = await db
    .select()
    .from(schema.events)
    .where(
      and(eq(schema.events.chartId, chartId), eq(schema.events.undone, true))
    )
    .orderBy(asc(schema.events.createdAt))
    .limit(1);

  if (!firstUndone) {
    const state = await getUndoState(chartId);
    return c.json({ batchId: null, ...state });
  }

  const batchId = firstUndone.batchId;

  // Get all events in this batch, forward order for redo
  const batchEvents = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.chartId, chartId),
        eq(schema.events.batchId, batchId)
      )
    )
    .orderBy(asc(schema.events.sequence));

  sqlite.exec("BEGIN");
  try {
    for (const event of batchEvents) {
      await applyForward(event);
    }

    // Mark batch as not undone
    await db
      .update(schema.events)
      .set({ undone: false })
      .where(
        and(
          eq(schema.events.chartId, chartId),
          eq(schema.events.batchId, batchId)
        )
      );

    sqlite.exec("COMMIT");
  } catch (err) {
    sqlite.exec("ROLLBACK");
    throw err;
  }

  const state = await getUndoState(chartId);
  return c.json({ batchId, ...state });
});

type EventRow = typeof schema.events.$inferSelect;

async function applyInverse(event: EventRow) {
  const before = event.beforeJson ? JSON.parse(event.beforeJson) : null;

  switch (event.action) {
    case "create":
      // Undo a create = delete
      await deleteEntity(event.entityType, event.entityId);
      break;
    case "delete":
      // Undo a delete = re-insert
      if (before) {
        await insertEntity(event.entityType, before);
      }
      break;
    case "update":
      // Undo an update = restore before state
      if (before) {
        await updateEntity(event.entityType, event.entityId, before);
      }
      break;
  }
}

async function applyForward(event: EventRow) {
  const after = event.afterJson ? JSON.parse(event.afterJson) : null;

  switch (event.action) {
    case "create":
      // Redo a create = re-insert
      if (after) {
        await insertEntity(event.entityType, after);
      }
      break;
    case "delete":
      // Redo a delete = delete again
      await deleteEntity(event.entityType, event.entityId);
      break;
    case "update":
      // Redo an update = apply after state
      if (after) {
        await updateEntity(event.entityType, event.entityId, after);
      }
      break;
  }
}

async function deleteEntity(
  entityType: string,
  entityId: string
) {
  switch (entityType) {
    case "node":
      await db.delete(schema.nodes).where(eq(schema.nodes.id, entityId));
      break;
    case "edge":
      await db.delete(schema.edges).where(eq(schema.edges.id, entityId));
      break;
    case "group":
      await db.delete(schema.groups).where(eq(schema.groups.id, entityId));
      break;
    case "node_group": {
      const [nodeId, groupId] = entityId.split(":");
      await db
        .delete(schema.nodeGroups)
        .where(
          and(
            eq(schema.nodeGroups.nodeId, nodeId),
            eq(schema.nodeGroups.groupId, groupId)
          )
        );
      break;
    }
  }
}

async function insertEntity(
  entityType: string,
  data: Record<string, unknown>
) {
  try {
    switch (entityType) {
      case "node":
        await db.insert(schema.nodes).values(data as typeof schema.nodes.$inferInsert).onConflictDoNothing();
        break;
      case "edge":
        await db.insert(schema.edges).values(data as typeof schema.edges.$inferInsert).onConflictDoNothing();
        break;
      case "group":
        await db.insert(schema.groups).values(data as typeof schema.groups.$inferInsert).onConflictDoNothing();
        break;
      case "node_group":
        await db
          .insert(schema.nodeGroups)
          .values(data as typeof schema.nodeGroups.$inferInsert)
          .onConflictDoNothing();
        break;
    }
  } catch {
    // Entity might already exist or FK constraint; skip
  }
}

async function updateEntity(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>
) {
  try {
    switch (entityType) {
      case "node":
        await db
          .update(schema.nodes)
          .set(data as Partial<typeof schema.nodes.$inferInsert>)
          .where(eq(schema.nodes.id, entityId));
        break;
      case "edge":
        await db
          .update(schema.edges)
          .set(data as Partial<typeof schema.edges.$inferInsert>)
          .where(eq(schema.edges.id, entityId));
        break;
      case "group":
        await db
          .update(schema.groups)
          .set(data as Partial<typeof schema.groups.$inferInsert>)
          .where(eq(schema.groups.id, entityId));
        break;
    }
  } catch {
    // Entity might not exist; skip
  }
}

export default app;
