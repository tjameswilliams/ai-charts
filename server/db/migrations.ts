import type { Database } from "bun:sqlite";

/**
 * Sequential migrations. Each entry runs once, tracked by schema_version.
 *
 * To add a new migration:
 *   1. Append a new string to the `migrations` array
 *   2. Use ALTER TABLE for column additions, CREATE TABLE IF NOT EXISTS for new tables
 *   3. The migration index+1 becomes the schema version
 */
const migrations: string[] = [
  // ── Migration 1: Initial schema (all tables as of March 2026) ──
  `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS charts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  audience TEXT DEFAULT '',
  chart_type TEXT DEFAULT 'flowchart',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_references (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  file_path TEXT DEFAULT '',
  line_start INTEGER,
  line_end INTEGER,
  document_section TEXT DEFAULT '',
  content_snippet TEXT DEFAULT '',
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'process',
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  style_json TEXT DEFAULT '{}',
  source_ref_id TEXT REFERENCES source_references(id) ON DELETE SET NULL,
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  from_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'default',
  label TEXT DEFAULT '',
  condition TEXT DEFAULT '',
  source_ref_id TEXT REFERENCES source_references(id) ON DELETE SET NULL,
  confidence REAL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "groups" (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  color TEXT DEFAULT '#3b82f6',
  style_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS node_groups (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES "groups"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  edge_id TEXT REFERENCES edges(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  snapshot_json TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  chart_id TEXT REFERENCES charts(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  thinking TEXT,
  tool_calls TEXT,
  segments TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  chart_id TEXT NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  source TEXT NOT NULL DEFAULT 'ui',
  description TEXT DEFAULT '',
  undone INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT DEFAULT '[]',
  env TEXT DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_materials (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'paste',
  created_at TEXT NOT NULL
);
  `,

  // ── Migration 2: Example for future use ──
  // `ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`,
];

/**
 * Run all pending migrations. Safe to call on every startup.
 */
export function runMigrations(sqlite: Database): void {
  // Ensure the meta table exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Get current version
  const row = sqlite.query("SELECT value FROM _schema_meta WHERE key = 'version'").get() as
    | { value: string }
    | null;
  let currentVersion = row ? parseInt(row.value, 10) : 0;

  // Detect pre-migration databases (tables exist but no version tracked)
  if (currentVersion === 0) {
    const tableCheck = sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
      .get();
    if (tableCheck) {
      // Existing database — mark migration 1 as already applied since tables exist
      currentVersion = 1;
      sqlite.exec(
        `INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('version', '1')`
      );
      console.log("[db] Existing database detected, marked as schema version 1");
    }
  }

  if (currentVersion >= migrations.length) return;

  console.log(
    `[db] Running migrations ${currentVersion + 1}..${migrations.length}`
  );

  for (let i = currentVersion; i < migrations.length; i++) {
    const version = i + 1;
    try {
      sqlite.exec("BEGIN");
      sqlite.exec(migrations[i]);
      sqlite.exec(
        `INSERT OR REPLACE INTO _schema_meta (key, value) VALUES ('version', '${version}')`
      );
      sqlite.exec("COMMIT");
      console.log(`[db] Migration ${version} applied`);
    } catch (err) {
      sqlite.exec("ROLLBACK");
      console.error(`[db] Migration ${version} failed:`, err);
      throw err;
    }
  }
}
