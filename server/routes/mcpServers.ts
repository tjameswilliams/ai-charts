import { Hono } from "hono";
import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import { mcpClientManager } from "../lib/mcp/clientManager";

const app = new Hono();

// List all configured MCP servers
app.get("/mcp-servers", async (c) => {
  const rows = await db.select().from(schema.mcpServers);
  const connectedIds = mcpClientManager.getConnectedServerIds();
  const result = rows.map((r) => ({
    ...r,
    args: JSON.parse(r.args || "[]"),
    env: JSON.parse(r.env || "{}"),
    connected: connectedIds.includes(r.id),
    tools: mcpClientManager.getServerTools(r.id),
  }));
  return c.json(result);
});

// Add a new MCP server config
app.post("/mcp-servers", async (c) => {
  const body = await c.req.json();
  const now = new Date().toISOString();
  const id = newId();

  const row = {
    id,
    name: body.name,
    command: body.command,
    args: JSON.stringify(body.args || []),
    env: JSON.stringify(body.env || {}),
    enabled: body.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.mcpServers).values(row);

  // Auto-connect if enabled
  if (row.enabled) {
    try {
      await mcpClientManager.connectServer(row);
    } catch (err) {
      // Return success but note connection failed
      return c.json({
        ...row,
        args: body.args || [],
        env: body.env || {},
        connected: false,
        connectionError: (err as Error).message,
      });
    }
  }

  return c.json({
    ...row,
    args: body.args || [],
    env: body.env || {},
    connected: mcpClientManager.getConnectedServerIds().includes(id),
    tools: mcpClientManager.getServerTools(id),
  });
});

// Update an MCP server config
app.patch("/mcp-servers/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = { updatedAt: now };
  if (body.name !== undefined) updates.name = body.name;
  if (body.command !== undefined) updates.command = body.command;
  if (body.args !== undefined) updates.args = JSON.stringify(body.args);
  if (body.env !== undefined) updates.env = JSON.stringify(body.env);
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  await db
    .update(schema.mcpServers)
    .set(updates)
    .where(eq(schema.mcpServers.id, id));

  // Refresh connection
  await mcpClientManager.refreshServer(id);

  const [row] = await db
    .select()
    .from(schema.mcpServers)
    .where(eq(schema.mcpServers.id, id));

  return c.json({
    ...row,
    args: JSON.parse(row.args || "[]"),
    env: JSON.parse(row.env || "{}"),
    connected: mcpClientManager.getConnectedServerIds().includes(id),
    tools: mcpClientManager.getServerTools(id),
  });
});

// Delete an MCP server config
app.delete("/mcp-servers/:id", async (c) => {
  const { id } = c.req.param();
  await mcpClientManager.disconnectServer(id);
  await db.delete(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  return c.json({ ok: true });
});

// Test connection to an MCP server
app.post("/mcp-servers/:id/test", async (c) => {
  const { id } = c.req.param();
  const [config] = await db
    .select()
    .from(schema.mcpServers)
    .where(eq(schema.mcpServers.id, id));

  if (!config) {
    return c.json({ success: false, error: "Server config not found" }, 404);
  }

  try {
    // Temporarily connect, list tools, then leave connected if enabled
    await mcpClientManager.connectServer(config);
    const tools = mcpClientManager.getServerTools(id);

    if (!config.enabled) {
      await mcpClientManager.disconnectServer(id);
    }

    return c.json({
      success: true,
      tools: tools?.map((t) => t.name) || [],
      toolCount: tools?.length || 0,
    });
  } catch (err) {
    return c.json({
      success: false,
      error: (err as Error).message,
    });
  }
});

// Reconnect an MCP server
app.post("/mcp-servers/:id/reconnect", async (c) => {
  const { id } = c.req.param();
  try {
    await mcpClientManager.refreshServer(id);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ success: false, error: (err as Error).message });
  }
});

export default app;
