import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../db/schema";
import { runMigrations } from "../../db/migrations";

/**
 * Creates a fresh in-memory SQLite database with all migrations applied.
 * Each call returns an isolated DB — safe for parallel tests.
 */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  runMigrations(sqlite);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, schema };
}

const now = () => new Date().toISOString();

/** Insert a project and return its id */
export function insertProject(
  db: ReturnType<typeof createTestDb>["db"],
  overrides: Partial<typeof schema.projects.$inferInsert> = {}
) {
  const id = overrides.id ?? "proj-1";
  db.insert(schema.projects)
    .values({
      id,
      name: "Test Project",
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    })
    .run();
  return id;
}

/** Insert a chart and return its id */
export function insertChart(
  db: ReturnType<typeof createTestDb>["db"],
  overrides: Partial<typeof schema.charts.$inferInsert> = {}
) {
  const id = overrides.id ?? "chart-1";
  db.insert(schema.charts)
    .values({
      id,
      projectId: "proj-1",
      title: "Test Chart",
      status: "draft",
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    })
    .run();
  return id;
}

/** Insert a node and return its id */
export function insertNode(
  db: ReturnType<typeof createTestDb>["db"],
  overrides: Partial<typeof schema.nodes.$inferInsert> & { chartId?: string; label?: string }
) {
  const id = overrides.id ?? `node-${Math.random().toString(36).slice(2, 8)}`;
  db.insert(schema.nodes)
    .values({
      id,
      chartId: "chart-1",
      type: "process",
      label: "Node",
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    })
    .run();
  return id;
}

/** Insert an edge and return its id */
export function insertEdge(
  db: ReturnType<typeof createTestDb>["db"],
  overrides: Partial<typeof schema.edges.$inferInsert> & {
    fromNodeId: string;
    toNodeId: string;
  }
) {
  const id = overrides.id ?? `edge-${Math.random().toString(36).slice(2, 8)}`;
  db.insert(schema.edges)
    .values({
      id,
      chartId: "chart-1",
      type: "default",
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    })
    .run();
  return id;
}

/** Insert a group and return its id */
export function insertGroup(
  db: ReturnType<typeof createTestDb>["db"],
  overrides: Partial<typeof schema.groups.$inferInsert> = {}
) {
  const id = overrides.id ?? `group-${Math.random().toString(36).slice(2, 8)}`;
  db.insert(schema.groups)
    .values({
      id,
      chartId: "chart-1",
      label: "Group",
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    })
    .run();
  return id;
}

/** Assign a node to a group */
export function insertNodeGroup(
  db: ReturnType<typeof createTestDb>["db"],
  nodeId: string,
  groupId: string
) {
  db.insert(schema.nodeGroups).values({ nodeId, groupId }).run();
}

/**
 * Scaffold: project + chart with given chartType.
 * Returns the chart id.
 */
export function setupChart(
  db: ReturnType<typeof createTestDb>["db"],
  chartType: string = "flowchart"
) {
  insertProject(db);
  return insertChart(db, { chartType });
}
