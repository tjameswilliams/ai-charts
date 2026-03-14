import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { resolve, dirname } from "path";
import { runMigrations } from "./migrations";

// Resolve DB path relative to project root (two levels up from server/db/)
const projectRoot = resolve(dirname(import.meta.dir), "..");
const dbPath = resolve(projectRoot, "data.db");

export const sqlite = new Database(dbPath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

// Create/migrate all tables automatically
runMigrations(sqlite);

export const db = drizzle(sqlite, { schema });
export { schema };
