import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

// --- Source Materials ---

// List source materials for project
app.get("/projects/:projectId/sources", async (c) => {
  const rows = await db
    .select()
    .from(schema.sourceMaterials)
    .where(eq(schema.sourceMaterials.projectId, c.req.param("projectId")));
  return c.json(rows);
});

// Create source material
app.post("/projects/:projectId/sources", async (c) => {
  const body = await c.req.json();
  const material = {
    id: newId(),
    projectId: c.req.param("projectId"),
    name: body.name || "Untitled",
    content: body.content || "",
    type: body.type || "paste",
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.sourceMaterials).values(material);
  return c.json(material, 201);
});

// Delete source material
app.delete("/sources/:id", async (c) => {
  await db
    .delete(schema.sourceMaterials)
    .where(eq(schema.sourceMaterials.id, c.req.param("id")));
  return c.json({ ok: true });
});

// --- Source References ---

// List source references for chart
app.get("/charts/:chartId/source-references", async (c) => {
  const rows = await db
    .select()
    .from(schema.sourceReferences)
    .where(eq(schema.sourceReferences.chartId, c.req.param("chartId")));
  return c.json(rows);
});

// Create source reference
app.post("/charts/:chartId/source-references", async (c) => {
  const body = await c.req.json();
  const ref = {
    id: newId(),
    chartId: c.req.param("chartId"),
    type: body.type || "user_instruction",
    filePath: body.filePath || "",
    lineStart: body.lineStart || null,
    lineEnd: body.lineEnd || null,
    documentSection: body.documentSection || "",
    contentSnippet: body.contentSnippet || "",
    confidence: body.confidence ?? 1.0,
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.sourceReferences).values(ref);
  return c.json(ref, 201);
});

// Delete source reference
app.delete("/source-references/:id", async (c) => {
  await db
    .delete(schema.sourceReferences)
    .where(eq(schema.sourceReferences.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default app;
