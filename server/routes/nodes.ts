import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq, or } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import {
  newBatchId,
  captureEntity,
  recordEvent,
  clearRedoStack,
  pruneHistory,
} from "../lib/events";

const app = new Hono();

// List nodes for chart
app.get("/charts/:chartId/nodes", async (c) => {
  const rows = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.chartId, c.req.param("chartId")));
  return c.json(rows);
});

// Get node
app.get("/nodes/:id", async (c) => {
  const [row] = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

// Create node
app.post("/charts/:chartId/nodes", async (c) => {
  const body = await c.req.json();
  const chartId = c.req.param("chartId");
  const now = new Date().toISOString();
  const node = {
    id: newId(),
    chartId,
    type: body.type || "process",
    label: body.label || "New Node",
    description: body.description || "",
    positionX: body.positionX ?? 0,
    positionY: body.positionY ?? 0,
    styleJson: body.styleJson || "{}",
    sourceRefId: body.sourceRefId || null,
    confidence: body.confidence ?? 1.0,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.nodes).values(node);

  const batchId = c.req.header("X-Batch-Id") || newBatchId();
  await recordEvent({
    chartId,
    batchId,
    sequence: 0,
    entityType: "node",
    entityId: node.id,
    action: "create",
    beforeJson: null,
    afterJson: node as unknown as Record<string, unknown>,
    description: `Created node '${node.label}'`,
  });
  await clearRedoStack(chartId);
  pruneHistory(chartId).catch(() => {});

  return c.json(node, 201);
});

// Batch create nodes
app.post("/charts/:chartId/nodes/batch", async (c) => {
  const body = await c.req.json();
  const chartId = c.req.param("chartId");
  const now = new Date().toISOString();
  const batchId = c.req.header("X-Batch-Id") || newBatchId();
  const created = [];
  let seq = 0;
  for (const n of body.nodes || []) {
    const node = {
      id: newId(),
      chartId,
      type: n.type || "process",
      label: n.label || "New Node",
      description: n.description || "",
      positionX: n.positionX ?? 0,
      positionY: n.positionY ?? 0,
      styleJson: n.styleJson || "{}",
      sourceRefId: n.sourceRefId || null,
      confidence: n.confidence ?? 1.0,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.nodes).values(node);
    await recordEvent({
      chartId,
      batchId,
      sequence: seq++,
      entityType: "node",
      entityId: node.id,
      action: "create",
      beforeJson: null,
      afterJson: node as unknown as Record<string, unknown>,
      description: `Batch created nodes`,
    });
    created.push(node);
  }
  await clearRedoStack(chartId);
  pruneHistory(chartId).catch(() => {});

  return c.json(created, 201);
});

// Batch update positions (must be before /nodes/:id to avoid conflict)
app.patch("/nodes/batch-position", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const positions = body.positions || [];
  if (positions.length === 0) return c.json({ ok: true });

  const batchId = c.req.header("X-Batch-Id") || newBatchId();
  let chartId: string | null = null;
  let seq = 0;

  for (const p of positions) {
    const before = await captureEntity("node", p.id);
    if (!before) continue;
    if (!chartId) chartId = before.chartId as string;

    await db
      .update(schema.nodes)
      .set({ positionX: p.positionX, positionY: p.positionY, updatedAt: now })
      .where(eq(schema.nodes.id, p.id));

    const after = { ...before, positionX: p.positionX, positionY: p.positionY, updatedAt: now };
    await recordEvent({
      chartId: chartId!,
      batchId,
      sequence: seq++,
      entityType: "node",
      entityId: p.id,
      action: "update",
      beforeJson: before,
      afterJson: after,
      description: "Moved nodes",
    });
  }

  if (chartId) {
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  }

  return c.json({ ok: true });
});

// Update node
app.patch("/nodes/:id", async (c) => {
  const body = await c.req.json();
  const id = c.req.param("id");

  const before = await captureEntity("node", id);

  await db
    .update(schema.nodes)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.nodes.id, id));
  const [updated] = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, id));

  if (before && updated) {
    const batchId = c.req.header("X-Batch-Id") || newBatchId();
    const chartId = before.chartId as string;
    await recordEvent({
      chartId,
      batchId,
      sequence: 0,
      entityType: "node",
      entityId: id,
      action: "update",
      beforeJson: before,
      afterJson: updated as unknown as Record<string, unknown>,
      description: `Updated node '${updated.label}'`,
    });
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  }

  return c.json(updated);
});

// Batch delete nodes (and their connected edges)
app.post("/nodes/batch-delete", async (c) => {
  const body = await c.req.json();
  const nodeIds: string[] = body.nodeIds || [];
  const batchId = body.batchId || newBatchId();
  if (nodeIds.length === 0) return c.json({ ok: true });

  let chartId: string | null = null;
  let seq = 0;

  for (const id of nodeIds) {
    const before = await captureEntity("node", id);
    if (!before) continue;
    if (!chartId) chartId = before.chartId as string;

    // Capture connected edges before cascade delete
    const connectedEdges = await db
      .select()
      .from(schema.edges)
      .where(
        or(eq(schema.edges.fromNodeId, id), eq(schema.edges.toNodeId, id))
      );

    for (const edge of connectedEdges) {
      await recordEvent({
        chartId: chartId!,
        batchId,
        sequence: seq++,
        entityType: "edge",
        entityId: edge.id,
        action: "delete",
        beforeJson: edge as unknown as Record<string, unknown>,
        afterJson: null,
        description: `Deleted ${nodeIds.length} nodes`,
      });
    }

    await recordEvent({
      chartId: chartId!,
      batchId,
      sequence: seq++,
      entityType: "node",
      entityId: id,
      action: "delete",
      beforeJson: before,
      afterJson: null,
      description: `Deleted ${nodeIds.length} nodes`,
    });

    await db.delete(schema.nodes).where(eq(schema.nodes.id, id));
  }

  if (chartId) {
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  }

  return c.json({ ok: true });
});

// Delete node
app.delete("/nodes/:id", async (c) => {
  const id = c.req.param("id");
  const before = await captureEntity("node", id);

  if (before) {
    const chartId = before.chartId as string;
    const batchId = c.req.header("X-Batch-Id") || newBatchId();

    // Capture connected edges before cascade delete
    const connectedEdges = await db
      .select()
      .from(schema.edges)
      .where(
        or(eq(schema.edges.fromNodeId, id), eq(schema.edges.toNodeId, id))
      );

    let seq = 0;
    for (const edge of connectedEdges) {
      await recordEvent({
        chartId,
        batchId,
        sequence: seq++,
        entityType: "edge",
        entityId: edge.id,
        action: "delete",
        beforeJson: edge as unknown as Record<string, unknown>,
        afterJson: null,
        description: `Deleted node '${before.label}'`,
      });
    }

    // Record node delete after edges (higher sequence)
    await recordEvent({
      chartId,
      batchId,
      sequence: seq,
      entityType: "node",
      entityId: id,
      action: "delete",
      beforeJson: before,
      afterJson: null,
      description: `Deleted node '${before.label}'`,
    });

    await db.delete(schema.nodes).where(eq(schema.nodes.id, id));
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  } else {
    await db.delete(schema.nodes).where(eq(schema.nodes.id, id));
  }

  return c.json({ ok: true });
});

export default app;
