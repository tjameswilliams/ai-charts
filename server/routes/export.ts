import { Hono } from "hono";
import { exportMermaid } from "../lib/export/mermaid";
import { exportMarkdown } from "../lib/export/markdown";
import { saveExport, getExport } from "../lib/export/svg";
import { validateChart } from "../lib/validation";

const app = new Hono();

// Export chart as Mermaid
app.get("/charts/:chartId/export/mermaid", async (c) => {
  const content = await exportMermaid(c.req.param("chartId"));
  return c.json({ format: "mermaid", content });
});

// Export chart as Markdown
app.get("/charts/:chartId/export/markdown", async (c) => {
  const content = await exportMarkdown(c.req.param("chartId"));
  return c.json({ format: "markdown", content });
});

// Validate chart
app.get("/charts/:chartId/validate", async (c) => {
  const issues = await validateChart(c.req.param("chartId"));
  return c.json({ issues, count: issues.length });
});

// Save an export (e.g., client-side SVG)
app.post("/charts/:chartId/export", async (c) => {
  const body = await c.req.json();
  const id = await saveExport(c.req.param("chartId"), body.format, body.content);
  return c.json({ id });
});

// Get a saved export
app.get("/exports/:id", async (c) => {
  const exp = await getExport(c.req.param("id"));
  if (!exp) return c.json({ error: "Not found" }, 404);
  return c.json(exp);
});

export default app;
