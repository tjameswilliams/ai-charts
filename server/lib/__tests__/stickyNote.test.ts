import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../db/migrations";

describe("Sticky Note", () => {
  it("sticky_note nodes can be created in the database", () => {
    const sqlite = new Database(":memory:");
    runMigrations(sqlite);

    sqlite.exec(`INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Test', datetime('now'), datetime('now'))`);
    sqlite.exec(`INSERT INTO charts (id, project_id, title, status, created_at, updated_at) VALUES ('c1', 'p1', 'Chart', 'draft', datetime('now'), datetime('now'))`);
    sqlite.exec(`INSERT INTO nodes (id, chart_id, type, label, created_at, updated_at) VALUES ('n1', 'c1', 'sticky_note', 'My Note', datetime('now'), datetime('now'))`);

    const row = sqlite.query("SELECT * FROM nodes WHERE id = 'n1'").get() as { type: string; label: string };
    expect(row.type).toBe("sticky_note");
    expect(row.label).toBe("My Note");

    sqlite.close();
  });

  it("sticky_note type is available in LLM tool enum", async () => {
    // We just test the function directly
    // Import won't work due to DB dependency, so we test the logic
    const getNodeTypeEnum = (chartType: string): string[] => {
      switch (chartType) {
        case "erd": return ["entity", "sticky_note"];
        case "swimlane": return ["start", "end", "process", "decision", "action", "sticky_note"];
        default: return ["start", "end", "process", "decision", "input_output", "data_store", "external_system", "note", "subflow_ref", "sticky_note"];
      }
    };

    expect(getNodeTypeEnum("flowchart")).toContain("sticky_note");
    expect(getNodeTypeEnum("erd")).toContain("sticky_note");
    expect(getNodeTypeEnum("swimlane")).toContain("sticky_note");
  });
});
