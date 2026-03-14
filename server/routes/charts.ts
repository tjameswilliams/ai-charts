import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

// List charts for project
app.get("/projects/:projectId/charts", async (c) => {
  const rows = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.projectId, c.req.param("projectId")));
  return c.json(rows);
});

// Get chart
app.get("/charts/:id", async (c) => {
  const [row] = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

// Create chart
app.post("/projects/:projectId/charts", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const chart = {
    id: newId(),
    projectId: c.req.param("projectId"),
    title: body.title || "Untitled Chart",
    description: body.description || "",
    audience: body.audience || "",
    chartType: body.chartType || "flowchart",
    status: body.status || "draft",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.charts).values(chart);
  return c.json(chart, 201);
});

// Update chart
app.patch("/charts/:id", async (c) => {
  const body = await c.req.json();
  const id = c.req.param("id");
  await db
    .update(schema.charts)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.charts.id, id));
  const [updated] = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.id, id));
  return c.json(updated);
});

// Delete chart
app.delete("/charts/:id", async (c) => {
  await db
    .delete(schema.charts)
    .where(eq(schema.charts.id, c.req.param("id")));
  return c.json({ ok: true });
});

// Duplicate chart
app.post("/charts/:id/duplicate", async (c) => {
  const id = c.req.param("id");
  const [original] = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.id, id));
  if (!original) return c.json({ error: "Not found" }, 404);

  const now = new Date().toISOString();
  const newChartId = newId();
  const chart = {
    ...original,
    id: newChartId,
    title: `${original.title} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.charts).values(chart);

  // Copy nodes
  const originalNodes = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.chartId, id));
  const nodeIdMap = new Map<string, string>();
  for (const node of originalNodes) {
    const newNodeId = newId();
    nodeIdMap.set(node.id, newNodeId);
    await db.insert(schema.nodes).values({
      ...node,
      id: newNodeId,
      chartId: newChartId,
      sourceRefId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Copy edges
  const originalEdges = await db
    .select()
    .from(schema.edges)
    .where(eq(schema.edges.chartId, id));
  for (const edge of originalEdges) {
    const newFromId = nodeIdMap.get(edge.fromNodeId);
    const newToId = nodeIdMap.get(edge.toNodeId);
    if (newFromId && newToId) {
      await db.insert(schema.edges).values({
        ...edge,
        id: newId(),
        chartId: newChartId,
        fromNodeId: newFromId,
        toNodeId: newToId,
        sourceRefId: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return c.json(chart, 201);
});

export default app;
