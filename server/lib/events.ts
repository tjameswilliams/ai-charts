import { db, schema } from "../db/client";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { newId } from "./nanoid";

export function newBatchId(): string {
  return newId();
}

export async function captureEntity(
  entityType: "node" | "edge" | "group" | "node_group",
  entityId: string
): Promise<Record<string, unknown> | null> {
  switch (entityType) {
    case "node": {
      const [row] = await db
        .select()
        .from(schema.nodes)
        .where(eq(schema.nodes.id, entityId));
      return row ? (row as unknown as Record<string, unknown>) : null;
    }
    case "edge": {
      const [row] = await db
        .select()
        .from(schema.edges)
        .where(eq(schema.edges.id, entityId));
      return row ? (row as unknown as Record<string, unknown>) : null;
    }
    case "group": {
      const [row] = await db
        .select()
        .from(schema.groups)
        .where(eq(schema.groups.id, entityId));
      return row ? (row as unknown as Record<string, unknown>) : null;
    }
    case "node_group": {
      // entityId is "nodeId:groupId"
      const [nodeId, groupId] = entityId.split(":");
      const [row] = await db
        .select()
        .from(schema.nodeGroups)
        .where(
          and(
            eq(schema.nodeGroups.nodeId, nodeId),
            eq(schema.nodeGroups.groupId, groupId)
          )
        );
      return row ? (row as unknown as Record<string, unknown>) : null;
    }
    default:
      return null;
  }
}

interface RecordEventParams {
  chartId: string;
  batchId: string;
  sequence: number;
  entityType: "node" | "edge" | "group" | "node_group";
  entityId: string;
  action: "create" | "update" | "delete";
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  source?: "ui" | "chat" | "mcp";
  description?: string;
}

const COALESCE_WINDOW_MS = 2000;

export async function recordEvent(params: RecordEventParams): Promise<void> {
  const {
    chartId,
    batchId,
    sequence,
    entityType,
    entityId,
    action,
    beforeJson,
    afterJson,
    source = "ui",
    description = "",
  } = params;

  // Coalescing: merge rapid updates to the same entity
  if (action === "update") {
    const cutoff = new Date(Date.now() - COALESCE_WINDOW_MS).toISOString();
    const [recent] = await db
      .select()
      .from(schema.events)
      .where(
        and(
          eq(schema.events.entityId, entityId),
          eq(schema.events.entityType, entityType),
          eq(schema.events.action, "update"),
          eq(schema.events.undone, false),
          sql`${schema.events.createdAt} > ${cutoff}`
        )
      )
      .orderBy(desc(schema.events.createdAt))
      .limit(1);

    if (recent) {
      await db
        .update(schema.events)
        .set({
          afterJson: afterJson ? JSON.stringify(afterJson) : null,
          createdAt: new Date().toISOString(),
        })
        .where(eq(schema.events.id, recent.id));
      return;
    }
  }

  await db.insert(schema.events).values({
    id: newId(),
    chartId,
    batchId,
    sequence,
    entityType,
    entityId,
    action,
    beforeJson: beforeJson ? JSON.stringify(beforeJson) : null,
    afterJson: afterJson ? JSON.stringify(afterJson) : null,
    source,
    description,
    undone: false,
    createdAt: new Date().toISOString(),
  });
}

export async function clearRedoStack(chartId: string): Promise<void> {
  await db
    .delete(schema.events)
    .where(
      and(eq(schema.events.chartId, chartId), eq(schema.events.undone, true))
    );
}

export async function pruneHistory(
  chartId: string,
  maxBatches = 200
): Promise<void> {
  // Get distinct batch IDs ordered by most recent
  const batches = await db
    .selectDistinct({ batchId: schema.events.batchId })
    .from(schema.events)
    .where(eq(schema.events.chartId, chartId))
    .orderBy(desc(schema.events.createdAt));

  if (batches.length <= maxBatches) return;

  const batchesToRemove = batches.slice(maxBatches).map((b) => b.batchId);
  for (const bid of batchesToRemove) {
    await db
      .delete(schema.events)
      .where(
        and(eq(schema.events.chartId, chartId), eq(schema.events.batchId, bid))
      );
  }
}

export async function getUndoState(chartId: string) {
  // Most recent active batch (for undo)
  const [lastActive] = await db
    .select()
    .from(schema.events)
    .where(
      and(eq(schema.events.chartId, chartId), eq(schema.events.undone, false))
    )
    .orderBy(desc(schema.events.createdAt))
    .limit(1);

  // Oldest undone batch (for redo)
  const [firstUndone] = await db
    .select()
    .from(schema.events)
    .where(
      and(eq(schema.events.chartId, chartId), eq(schema.events.undone, true))
    )
    .orderBy(asc(schema.events.createdAt))
    .limit(1);

  return {
    canUndo: !!lastActive,
    canRedo: !!firstUndone,
    undoDesc: lastActive?.description || "",
    redoDesc: firstUndone?.description || "",
  };
}
