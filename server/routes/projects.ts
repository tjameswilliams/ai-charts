import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

// List projects
app.get("/", async (c) => {
  const rows = await db.select().from(schema.projects);
  return c.json(rows);
});

// Get project
app.get("/:id", async (c) => {
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

// Create project
app.post("/", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const project = {
    id: newId(),
    name: body.name || "Untitled Project",
    description: body.description || "",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.projects).values(project);
  return c.json(project, 201);
});

// Update project
app.patch("/:id", async (c) => {
  const body = await c.req.json();
  const id = c.req.param("id");
  await db
    .update(schema.projects)
    .set({ ...body, updatedAt: new Date().toISOString() })
    .where(eq(schema.projects.id, id));
  const [updated] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id));
  return c.json(updated);
});

// Duplicate project
app.post("/:id/duplicate", async (c) => {
  const id = c.req.param("id");
  const [original] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id));
  if (!original) return c.json({ error: "Not found" }, 404);

  const now = new Date().toISOString();
  const newProjectId = newId();
  const project = {
    ...original,
    id: newProjectId,
    name: `${original.name} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.projects).values(project);

  // Copy all charts (and their nodes/edges)
  const originalCharts = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.projectId, id));

  for (const chart of originalCharts) {
    const newChartId = newId();
    await db.insert(schema.charts).values({
      ...chart,
      id: newChartId,
      projectId: newProjectId,
      createdAt: now,
      updatedAt: now,
    });

    // Copy nodes
    const originalNodes = await db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.chartId, chart.id));
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
      .where(eq(schema.edges.chartId, chart.id));
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

    // Copy groups and node_groups
    const originalGroups = await db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.chartId, chart.id));
    for (const group of originalGroups) {
      const newGroupId = newId();
      await db.insert(schema.groups).values({
        ...group,
        id: newGroupId,
        chartId: newChartId,
        createdAt: now,
        updatedAt: now,
      });

      const originalNodeGroups = await db
        .select()
        .from(schema.nodeGroups)
        .where(eq(schema.nodeGroups.groupId, group.id));
      for (const ng of originalNodeGroups) {
        const newNodeId = nodeIdMap.get(ng.nodeId);
        if (newNodeId) {
          await db.insert(schema.nodeGroups).values({
            nodeId: newNodeId,
            groupId: newGroupId,
          });
        }
      }
    }
  }

  return c.json(project, 201);
});

// Delete project
app.delete("/:id", async (c) => {
  await db
    .delete(schema.projects)
    .where(eq(schema.projects.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default app;
