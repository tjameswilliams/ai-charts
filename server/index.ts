import { Hono } from "hono";
import { cors } from "hono/cors";
import projects from "./routes/projects";
import charts from "./routes/charts";
import nodes from "./routes/nodes";
import edges from "./routes/edges";
import groups from "./routes/groups";
import sources from "./routes/sources";
import revisions from "./routes/revisions";
import messages from "./routes/messages";
import settingsRoutes from "./routes/settings";
import chat from "./routes/chat";
import exportRoutes from "./routes/export";
import undo from "./routes/undo";
import uploads from "./routes/uploads";
import mcpServerRoutes from "./routes/mcpServers";
import projectExport from "./routes/projectExport";
import { mcpClientManager } from "./lib/mcp/clientManager";

const app = new Hono();

app.use("/api/*", cors({ origin: "*" }));

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/info", (c) => c.json({ projectRoot: import.meta.dir.replace(/\/server$/, "") }));

app.route("/api/projects", projects);
app.route("/api", charts);
app.route("/api", nodes);
app.route("/api", edges);
app.route("/api", groups);
app.route("/api", sources);
app.route("/api", revisions);
app.route("/api", messages);
app.route("/api", settingsRoutes);
app.route("/api", chat);
app.route("/api", exportRoutes);
app.route("/api", undo);
app.route("/api", uploads);
app.route("/api", mcpServerRoutes);
app.route("/api", projectExport);

// Initialize external MCP client connections
mcpClientManager.initAll().catch((err) =>
  console.error("[mcp-client] Init failed:", err)
);

const port = 3002;

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 0,
};
