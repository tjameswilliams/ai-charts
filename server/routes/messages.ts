import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq, and, gt } from "drizzle-orm";
import { newId } from "../lib/nanoid";

const app = new Hono();

// List messages for project
app.get("/projects/:projectId/messages", async (c) => {
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.projectId, c.req.param("projectId")));

  return c.json(
    rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      thinking: r.thinking || undefined,
      toolCalls: r.toolCalls ? JSON.parse(r.toolCalls) : undefined,
      segments: r.segments ? JSON.parse(r.segments) : undefined,
      timestamp: r.createdAt,
    }))
  );
});

// Save message
app.post("/projects/:projectId/messages", async (c) => {
  const body = await c.req.json();
  const msg = {
    id: body.id || newId(),
    projectId: c.req.param("projectId"),
    chartId: body.chartId || null,
    role: body.role,
    content: body.content,
    thinking: body.thinking || null,
    toolCalls: body.toolCalls ? JSON.stringify(body.toolCalls) : null,
    segments: body.segments ? JSON.stringify(body.segments) : null,
    createdAt: body.createdAt || new Date().toISOString(),
  };
  await db.insert(schema.chatMessages).values(msg);
  return c.json({ ok: true });
});

// Clear messages for project
app.delete("/projects/:projectId/messages", async (c) => {
  await db
    .delete(schema.chatMessages)
    .where(eq(schema.chatMessages.projectId, c.req.param("projectId")));
  return c.json({ ok: true });
});

// Delete messages after a specific message
app.delete("/projects/:projectId/messages/:messageId/after", async (c) => {
  const projectId = c.req.param("projectId");
  const messageId = c.req.param("messageId");

  // Get the target message timestamp
  const [target] = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.id, messageId));
  if (!target) return c.json({ ok: true });

  // Delete messages created after it
  await db
    .delete(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.projectId, projectId),
        gt(schema.chatMessages.createdAt, target.createdAt)
      )
    );

  // Also delete the target message itself
  await db
    .delete(schema.chatMessages)
    .where(eq(schema.chatMessages.id, messageId));

  return c.json({ ok: true });
});

export default app;
