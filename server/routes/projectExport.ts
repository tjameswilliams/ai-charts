import { Hono } from "hono";
import { exportProject, exportChart, importProject, importChart } from "../lib/projectArchive";

const app = new Hono();

// Export project as ZIP
app.get("/projects/:id/export", async (c) => {
  try {
    const buf = await exportProject(c.req.param("id"));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="project-${c.req.param("id")}.zip"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return c.json({ error: msg }, 400);
  }
});

// Import project from ZIP
app.post("/projects/import", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await importProject(buffer);
    return c.json(result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    return c.json({ error: msg }, 400);
  }
});

// Export chart as ZIP
app.get("/charts/:id/export", async (c) => {
  try {
    const buf = await exportChart(c.req.param("id"));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="chart-${c.req.param("id")}.zip"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return c.json({ error: msg }, 400);
  }
});

// Import chart into project from ZIP
app.post("/projects/:projectId/charts/import", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body["file"];
    if (!file || !(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const result = await importChart(buffer, c.req.param("projectId"));
    return c.json(result, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    return c.json({ error: msg }, 400);
  }
});

export default app;
