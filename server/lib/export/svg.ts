// SVG export is primarily client-side using ReactFlow's toSvg() method.
// This file provides a server endpoint to store/retrieve exported SVGs.

import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../nanoid";

export async function saveExport(
  chartId: string,
  format: "mermaid" | "markdown" | "svg" | "png",
  content: string
): Promise<string> {
  const id = newId();
  await db.insert(schema.exports).values({
    id,
    chartId,
    format,
    content,
    createdAt: new Date().toISOString(),
  });
  return id;
}

export async function getExport(id: string) {
  const [row] = await db
    .select()
    .from(schema.exports)
    .where(eq(schema.exports.id, id));
  return row || null;
}
