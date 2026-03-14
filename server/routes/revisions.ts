import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

// List revisions for chart
app.get("/charts/:chartId/revisions", async (c) => {
  const rows = await db
    .select()
    .from(schema.revisions)
    .where(eq(schema.revisions.chartId, c.req.param("chartId")));
  return c.json(rows);
});

// Create revision (snapshot current chart state)
app.post("/charts/:chartId/revisions", async (c) => {
  const chartId = c.req.param("chartId");
  const body = await c.req.json();

  // Gather current state
  const nodeRows = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.chartId, chartId));
  const edgeRows = await db
    .select()
    .from(schema.edges)
    .where(eq(schema.edges.chartId, chartId));
  const groupRows = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.chartId, chartId));

  const snapshot = JSON.stringify({ nodes: nodeRows, edges: edgeRows, groups: groupRows });
  const revision = {
    id: newId(),
    chartId,
    snapshotJson: snapshot,
    description: body.description || "",
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.revisions).values(revision);
  return c.json(revision, 201);
});

// Restore revision
app.post("/revisions/:id/restore", async (c) => {
  const [revision] = await db
    .select()
    .from(schema.revisions)
    .where(eq(schema.revisions.id, c.req.param("id")));
  if (!revision) return c.json({ error: "Not found" }, 404);

  const snapshot = JSON.parse(revision.snapshotJson);
  const chartId = revision.chartId;
  const now = new Date().toISOString();

  // Clear existing
  await db.delete(schema.edges).where(eq(schema.edges.chartId, chartId));
  await db.delete(schema.nodes).where(eq(schema.nodes.chartId, chartId));
  await db.delete(schema.groups).where(eq(schema.groups.chartId, chartId));

  // Restore nodes
  for (const node of snapshot.nodes || []) {
    await db.insert(schema.nodes).values({ ...node, updatedAt: now });
  }
  // Restore edges
  for (const edge of snapshot.edges || []) {
    await db.insert(schema.edges).values({ ...edge, updatedAt: now });
  }
  // Restore groups
  for (const group of snapshot.groups || []) {
    await db.insert(schema.groups).values({ ...group, updatedAt: now });
  }

  return c.json({ ok: true });
});

export default app;
