import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq, and } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import {
  newBatchId,
  captureEntity,
  recordEvent,
  clearRedoStack,
  pruneHistory,
} from "../lib/events";

const app = new Hono();

// List groups for chart
app.get("/charts/:chartId/groups", async (c) => {
  const chartId = c.req.param("chartId");
  const groupRows = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.chartId, chartId));

  // Attach node IDs to each group
  const result = [];
  for (const group of groupRows) {
    const links = await db
      .select()
      .from(schema.nodeGroups)
      .where(eq(schema.nodeGroups.groupId, group.id));
    result.push({ ...group, nodeIds: links.map((l) => l.nodeId) });
  }
  return c.json(result);
});

// Create group
app.post("/charts/:chartId/groups", async (c) => {
  const body = await c.req.json();
  const chartId = c.req.param("chartId");
  const now = new Date().toISOString();
  const group = {
    id: newId(),
    chartId,
    label: body.label || "New Group",
    description: body.description || "",
    color: body.color || "#3b82f6",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.groups).values(group);

  const batchId = c.req.header("X-Batch-Id") || newBatchId();
  let seq = 0;

  await recordEvent({
    chartId,
    batchId,
    sequence: seq++,
    entityType: "group",
    entityId: group.id,
    action: "create",
    beforeJson: null,
    afterJson: group as unknown as Record<string, unknown>,
    description: `Created group '${group.label}'`,
  });

  // Add nodes if provided
  if (body.nodeIds?.length) {
    for (const nodeId of body.nodeIds) {
      await db.insert(schema.nodeGroups).values({ nodeId, groupId: group.id });
      await recordEvent({
        chartId,
        batchId,
        sequence: seq++,
        entityType: "node_group",
        entityId: `${nodeId}:${group.id}`,
        action: "create",
        beforeJson: null,
        afterJson: { nodeId, groupId: group.id },
        description: `Added node to group '${group.label}'`,
      });
    }
  }

  await clearRedoStack(chartId);
  pruneHistory(chartId).catch(() => {});

  return c.json({ ...group, nodeIds: body.nodeIds || [] }, 201);
});

// Update group
app.patch("/groups/:id", async (c) => {
  const body = await c.req.json();
  const id = c.req.param("id");

  const before = await captureEntity("group", id);

  await db
    .update(schema.groups)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.groups.id, id));
  const [updated] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, id));

  if (before && updated) {
    const batchId = c.req.header("X-Batch-Id") || newBatchId();
    const chartId = before.chartId as string;
    await recordEvent({
      chartId,
      batchId,
      sequence: 0,
      entityType: "group",
      entityId: id,
      action: "update",
      beforeJson: before,
      afterJson: updated as unknown as Record<string, unknown>,
      description: `Updated group '${updated.label}'`,
    });
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  }

  return c.json(updated);
});

// Delete group
app.delete("/groups/:id", async (c) => {
  const id = c.req.param("id");
  const before = await captureEntity("group", id);

  if (before) {
    const chartId = before.chartId as string;
    const batchId = c.req.header("X-Batch-Id") || newBatchId();

    // Capture node_group links before cascade delete
    const links = await db
      .select()
      .from(schema.nodeGroups)
      .where(eq(schema.nodeGroups.groupId, id));

    let seq = 0;
    for (const link of links) {
      await recordEvent({
        chartId,
        batchId,
        sequence: seq++,
        entityType: "node_group",
        entityId: `${link.nodeId}:${id}`,
        action: "delete",
        beforeJson: link as unknown as Record<string, unknown>,
        afterJson: null,
        description: `Deleted group '${before.label}'`,
      });
    }

    await recordEvent({
      chartId,
      batchId,
      sequence: seq,
      entityType: "group",
      entityId: id,
      action: "delete",
      beforeJson: before,
      afterJson: null,
      description: `Deleted group '${before.label}'`,
    });

    await db.delete(schema.groups).where(eq(schema.groups.id, id));
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  } else {
    await db.delete(schema.groups).where(eq(schema.groups.id, id));
  }

  return c.json({ ok: true });
});

// Add nodes to group
app.post("/groups/:id/nodes", async (c) => {
  const body = await c.req.json();
  const groupId = c.req.param("id");

  const [group] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId));

  const batchId = c.req.header("X-Batch-Id") || newBatchId();
  let seq = 0;

  for (const nodeId of body.nodeIds || []) {
    await db
      .insert(schema.nodeGroups)
      .values({ nodeId, groupId })
      .onConflictDoNothing();

    if (group) {
      await recordEvent({
        chartId: group.chartId,
        batchId,
        sequence: seq++,
        entityType: "node_group",
        entityId: `${nodeId}:${groupId}`,
        action: "create",
        beforeJson: null,
        afterJson: { nodeId, groupId },
        description: `Added nodes to group '${group.label}'`,
      });
    }
  }

  if (group) {
    await clearRedoStack(group.chartId);
    pruneHistory(group.chartId).catch(() => {});
  }

  return c.json({ ok: true });
});

// Remove node from group
app.delete("/groups/:groupId/nodes/:nodeId", async (c) => {
  const groupId = c.req.param("groupId");
  const nodeId = c.req.param("nodeId");

  const [group] = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.id, groupId));

  if (group) {
    const batchId = c.req.header("X-Batch-Id") || newBatchId();
    await recordEvent({
      chartId: group.chartId,
      batchId,
      sequence: 0,
      entityType: "node_group",
      entityId: `${nodeId}:${groupId}`,
      action: "delete",
      beforeJson: { nodeId, groupId },
      afterJson: null,
      description: `Removed node from group '${group.label}'`,
    });
    await clearRedoStack(group.chartId);
    pruneHistory(group.chartId).catch(() => {});
  }

  await db
    .delete(schema.nodeGroups)
    .where(
      and(
        eq(schema.nodeGroups.groupId, groupId),
        eq(schema.nodeGroups.nodeId, nodeId)
      )
    );
  return c.json({ ok: true });
});

export default app;
