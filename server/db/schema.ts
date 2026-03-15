import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const charts = sqliteTable("charts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  audience: text("audience").default(""),
  chartType: text("chart_type").default("flowchart"),
  status: text("status", {
    enum: ["draft", "review", "final"],
  })
    .notNull()
    .default("draft"),
  settingsJson: text("settings_json").default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: [
      "start",
      "end",
      "process",
      "decision",
      "input_output",
      "data_store",
      "external_system",
      "note",
      "subflow_ref",
      "image",
      "entity",
      "action",
      "central_topic",
      "main_branch",
      "sub_branch",
      "leaf",
      "actor",
      "participant",
      "lifeline_activation",
      "sticky_note",
    ],
  })
    .notNull()
    .default("process"),
  label: text("label").notNull(),
  description: text("description").default(""),
  positionX: real("position_x").default(0),
  positionY: real("position_y").default(0),
  styleJson: text("style_json").default("{}"),
  sourceRefId: text("source_ref_id").references(() => sourceReferences.id, {
    onDelete: "set null",
  }),
  confidence: real("confidence").default(1.0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const edges = sqliteTable("edges", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  fromNodeId: text("from_node_id")
    .notNull()
    .references(() => nodes.id, { onDelete: "cascade" }),
  toNodeId: text("to_node_id")
    .notNull()
    .references(() => nodes.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["default", "conditional", "error", "async", "fallback", "one_to_one", "one_to_many", "many_to_many", "branch", "sync_message", "async_message", "return_message", "self_message"],
  })
    .notNull()
    .default("default"),
  label: text("label").default(""),
  condition: text("condition").default(""),
  sourceRefId: text("source_ref_id").references(() => sourceReferences.id, {
    onDelete: "set null",
  }),
  confidence: real("confidence").default(1.0),
  orderIndex: integer("order_index"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  description: text("description").default(""),
  color: text("color").default("#3b82f6"),
  styleJson: text("style_json").default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const nodeGroups = sqliteTable("node_groups", {
  nodeId: text("node_id")
    .notNull()
    .references(() => nodes.id, { onDelete: "cascade" }),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
});

export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  nodeId: text("node_id").references(() => nodes.id, { onDelete: "cascade" }),
  edgeId: text("edge_id").references(() => edges.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sourceReferences = sqliteTable("source_references", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  type: text("type", {
    enum: ["file", "document", "user_instruction", "inferred"],
  }).notNull(),
  filePath: text("file_path").default(""),
  lineStart: integer("line_start"),
  lineEnd: integer("line_end"),
  documentSection: text("document_section").default(""),
  contentSnippet: text("content_snippet").default(""),
  confidence: real("confidence").default(1.0),
  createdAt: text("created_at").notNull(),
});

export const revisions = sqliteTable("revisions", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  snapshotJson: text("snapshot_json").notNull(),
  description: text("description").default(""),
  createdAt: text("created_at").notNull(),
});

export const exports = sqliteTable("exports", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  format: text("format", {
    enum: ["mermaid", "markdown", "svg", "png"],
  }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  chartId: text("chart_id").references(() => charts.id, {
    onDelete: "cascade",
  }),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  thinking: text("thinking"),
  toolCalls: text("tool_calls"),
  segments: text("segments"),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  chartId: text("chart_id")
    .notNull()
    .references(() => charts.id, { onDelete: "cascade" }),
  batchId: text("batch_id").notNull(),
  sequence: integer("sequence").notNull(),
  entityType: text("entity_type", {
    enum: ["node", "edge", "group", "node_group"],
  }).notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action", {
    enum: ["create", "update", "delete"],
  }).notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  source: text("source", {
    enum: ["ui", "chat", "mcp"],
  })
    .notNull()
    .default("ui"),
  description: text("description").default(""),
  undone: integer("undone", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const mcpServers = sqliteTable("mcp_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  command: text("command").notNull(),
  args: text("args").default("[]"),
  env: text("env").default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sourceMaterials = sqliteTable("source_materials", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  content: text("content").notNull(),
  type: text("type", {
    enum: ["code", "document", "url", "paste"],
  })
    .notNull()
    .default("paste"),
  createdAt: text("created_at").notNull(),
});
