import { Hono } from "hono";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const app = new Hono();

const TEMPLATES_DIR = join(import.meta.dir, "../templates");

interface Template {
  id: string;
  name: string;
  description: string;
  chartType: string;
  nodes: Array<{ temp_id: string; type: string; label: string; description?: string; width?: number; height?: number }>;
  edges: Array<{ from_temp_id: string; to_temp_id: string; type: string; label?: string }>;
  groups?: Array<{ label: string; node_temp_ids: string[]; color?: string }>;
}

// GET /api/templates - list all templates
app.get("/templates", async (c) => {
  try {
    const files = await readdir(TEMPLATES_DIR);
    const templates = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const content = await readFile(join(TEMPLATES_DIR, file), "utf-8");
      const data = JSON.parse(content) as Template;
      const id = file.replace(".json", "");
      templates.push({
        id,
        name: data.name,
        description: data.description,
        chartType: data.chartType,
      });
    }

    return c.json(templates);
  } catch (err) {
    return c.json([]);
  }
});

// GET /api/templates/:id - get full template
app.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const content = await readFile(join(TEMPLATES_DIR, `${id}.json`), "utf-8");
    const data = JSON.parse(content);
    return c.json({ id, ...data });
  } catch {
    return c.json({ error: "Template not found" }, 404);
  }
});

export default app;
