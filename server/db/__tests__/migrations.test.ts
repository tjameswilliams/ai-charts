import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../migrations";

describe("migrations", () => {
  it("Migration 2 adds settings_json column to charts", () => {
    const sqlite = new Database(":memory:");
    runMigrations(sqlite);

    // Verify the settings_json column exists
    const columns = sqlite.query("PRAGMA table_info(charts)").all() as Array<{ name: string }>;
    const columnNames = columns.map(c => c.name);
    expect(columnNames).toContain("settings_json");

    sqlite.close();
  });

  it("settings_json defaults to empty object", () => {
    const sqlite = new Database(":memory:");
    runMigrations(sqlite);

    // Insert a chart and verify default
    sqlite.exec(`INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Test', datetime('now'), datetime('now'))`);
    sqlite.exec(`INSERT INTO charts (id, project_id, title, status, created_at, updated_at) VALUES ('c1', 'p1', 'Test Chart', 'draft', datetime('now'), datetime('now'))`);

    const row = sqlite.query("SELECT settings_json FROM charts WHERE id = 'c1'").get() as { settings_json: string };
    expect(row.settings_json).toBe("{}");

    sqlite.close();
  });
});
