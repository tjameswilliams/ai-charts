import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import {
  newBatchId,
  captureEntity,
  recordEvent,
  clearRedoStack,
  pruneHistory,
} from "../lib/events";

const app = new Hono();

// List edges for chart
app.get("/charts/:chartId/edges", async (c) => {
  const rows = await db
    .select()
    .from(schema.edges)
    .where(eq(schema.edges.chartId, c.req.param("chartId")));
  return c.json(rows);
});

// Create edge
app.post("/charts/:chartId/edges", async (c) => {
  const body = await c.req.json();
  const chartId = c.req.param("chartId");
  const now = new Date().toISOString();
  const edge = {
    id: newId(),
    chartId,
    fromNodeId: body.fromNodeId,
    toNodeId: body.toNodeId,
    type: body.type || "default",
    label: body.label || "",
    condition: body.condition || "",
    sourceRefId: body.sourceRefId || null,
    confidence: body.confidence ?? 1.0,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.edges).values(edge);

  const batchId = c.req.header("X-Batch-Id") || newBatchId();
  await recordEvent({
    chartId,
    batchId,
    sequence: 0,
    entityType: "edge",
    entityId: edge.id,
    action: "create",
    beforeJson: null,
    afterJson: edge as unknown as Record<string, unknown>,
    description: `Created edge${edge.label ? ` '${edge.label}'` : ""}`,
  });
  await clearRedoStack(chartId);
  pruneHistory(chartId).catch(() => {});

  return c.json(edge, 201);
});

// Batch create edges
app.post("/charts/:chartId/edges/batch", async (c) => {
  const body = await c.req.json();
  const chartId = c.req.param("chartId");
  const now = new Date().toISOString();
  const batchId = c.req.header("X-Batch-Id") || newBatchId();
  const created = [];
  let seq = 0;
  for (const e of body.edges || []) {
    const edge = {
      id: newId(),
      chartId,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      type: e.type || "default",
      label: e.label || "",
      condition: e.condition || "",
      sourceRefId: e.sourceRefId || null,
      confidence: e.confidence ?? 1.0,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.edges).values(edge);
    await recordEvent({
      chartId,
      batchId,
      sequence: seq++,
      entityType: "edge",
      entityId: edge.id,
      action: "create",
      beforeJson: null,
      afterJson: edge as unknown as Record<string, unknown>,
      description: "Batch created edges",
    });
    created.push(edge);
  }
  await clearRedoStack(chartId);
  pruneHistory(chartId).catch(() => {});

  return c.json(created, 201);
});

// Update edge
app.patch("/edges/:id", async (c) => {
  const body = await c.req.json();
  const id = c.req.param("id");

  const before = await captureEntity("edge", id);

  await db
    .update(schema.edges)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.edges.id, id));
  const [updated] = await db
    .select()
    .from(schema.edges)
    .where(eq(schema.edges.id, id));

  if (before && updated) {
    const batchId = c.req.header("X-Batch-Id") || newBatchId();
    const chartId = before.chartId as string;
    await recordEvent({
      chartId,
      batchId,
      sequence: 0,
      entityType: "edge",
      entityId: id,
      action: "update",
      beforeJson: before,
      afterJson: updated as unknown as Record<string, unknown>,
      description: `Updated edge${updated.label ? ` '${updated.label}'` : ""}`,
    });
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  }

  return c.json(updated);
});

// Batch delete edges
app.post("/edges/batch-delete", async (c) => {
  const body = await c.req.json();
  const edgeIds: string[] = body.edgeIds || [];
  const batchId = body.batchId || newBatchId();
  if (edgeIds.length === 0) return c.json({ ok: true });

  let chartId: string | null = null;
  let seq = 0;

  for (const id of edgeIds) {
    const before = await captureEntity("edge", id);
    if (!before) continue;
    if (!chartId) chartId = before.chartId as string;

    await recordEvent({
      chartId: chartId!,
      batchId,
      sequence: seq++,
      entityType: "edge",
      entityId: id,
      action: "delete",
      beforeJson: before,
      afterJson: null,
      description: `Deleted ${edgeIds.length} edges`,
    });

    await db.delete(schema.edges).where(eq(schema.edges.id, id));
  }

  if (chartId) {
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  }

  return c.json({ ok: true });
});

// Delete edge
app.delete("/edges/:id", async (c) => {
  const id = c.req.param("id");
  const before = await captureEntity("edge", id);

  if (before) {
    const chartId = before.chartId as string;
    const batchId = c.req.header("X-Batch-Id") || newBatchId();
    await recordEvent({
      chartId,
      batchId,
      sequence: 0,
      entityType: "edge",
      entityId: id,
      action: "delete",
      beforeJson: before,
      afterJson: null,
      description: `Deleted edge`,
    });
    await clearRedoStack(chartId);
    pruneHistory(chartId).catch(() => {});
  }

  await db.delete(schema.edges).where(eq(schema.edges.id, id));
  return c.json({ ok: true });
});

export default app;
