import { describe, it, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const TEMPLATES_DIR = join(import.meta.dir, "../../templates");

describe("templates", () => {
  it("template files exist and are valid JSON", async () => {
    const files = await readdir(TEMPLATES_DIR);
    const jsonFiles = files.filter(f => f.endsWith(".json"));
    expect(jsonFiles.length).toBeGreaterThan(0);

    for (const file of jsonFiles) {
      const content = await readFile(join(TEMPLATES_DIR, file), "utf-8");
      const data = JSON.parse(content);
      expect(data.name).toBeDefined();
      expect(data.chartType).toBeDefined();
      expect(data.nodes).toBeInstanceOf(Array);
      expect(data.edges).toBeInstanceOf(Array);
    }
  });

  it("each template has valid node references in edges", async () => {
    const files = await readdir(TEMPLATES_DIR);
    for (const file of files.filter(f => f.endsWith(".json"))) {
      const content = await readFile(join(TEMPLATES_DIR, file), "utf-8");
      const data = JSON.parse(content);
      const nodeIds = new Set(data.nodes.map((n: any) => n.temp_id));
      for (const edge of data.edges) {
        expect(nodeIds.has(edge.from_temp_id)).toBe(true);
        expect(nodeIds.has(edge.to_temp_id)).toBe(true);
      }
    }
  });

  it("templates cover all chart types", async () => {
    const files = await readdir(TEMPLATES_DIR);
    const chartTypes = new Set<string>();
    for (const file of files.filter(f => f.endsWith(".json"))) {
      const content = await readFile(join(TEMPLATES_DIR, file), "utf-8");
      const data = JSON.parse(content);
      chartTypes.add(data.chartType);
    }
    expect(chartTypes.has("flowchart")).toBe(true);
    expect(chartTypes.has("erd")).toBe(true);
    expect(chartTypes.has("swimlane")).toBe(true);
  });
});
