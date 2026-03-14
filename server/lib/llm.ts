import { db, schema } from "../db/client";
import { mcpClientManager } from "./mcp/clientManager";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

type MessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: MessageContent;
  tool_calls?: ToolCallRequest[];
}

interface ToolCallRequest {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export async function getLLMConfig(): Promise<LLMConfig> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return {
    apiBaseUrl: map.apiBaseUrl || "http://localhost:11434/v1",
    apiKey: map.apiKey || "ollama",
    model: map.model || "llama3.2",
    temperature: parseFloat(map.temperature || "0.7"),
    maxTokens: parseInt(map.maxTokens || "2048"),
  };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

let cachedContextWindow: { model: string; size: number } | null = null;

export async function getContextWindowSize(): Promise<number> {
  const config = await getLLMConfig();

  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  if (map.contextWindow) {
    const parsed = parseInt(map.contextWindow);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  if (cachedContextWindow && cachedContextWindow.model === config.model) {
    return cachedContextWindow.size;
  }

  console.log(`[llm] Detecting context window for model "${config.model}"...`);

  try {
    const ollamaBase = config.apiBaseUrl.replace(/\/v1\/?$/, "");
    const res = await fetch(`${ollamaBase}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: config.model }),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.model_info && typeof data.model_info === "object") {
        for (const key of Object.keys(data.model_info)) {
          if (key.endsWith("context_length")) {
            const val = data.model_info[key];
            if (typeof val === "number" && val > 0) {
              console.log(`[llm] Context window: ${val} (from ${key})`);
              cachedContextWindow = { model: config.model, size: val };
              return val;
            }
          }
        }
      }
      if (typeof data?.parameters === "string") {
        const match = data.parameters.match(/num_ctx\s+(\d+)/);
        if (match) {
          const numCtx = parseInt(match[1]);
          cachedContextWindow = { model: config.model, size: numCtx };
          return numCtx;
        }
      }
    }
  } catch {
    // Ollama not available
  }

  console.log("[llm] Context window: 8192 (fallback)");
  return 8192;
}

export async function summarizeConversation(
  messages: ChatMessage[]
): Promise<string> {
  const conversationText = messages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join("\n\n");

  const result = await chatCompletion([
    {
      role: "system",
      content: `You are a conversation summarizer. Produce a concise summary of the following conversation that captures:
- Key decisions made about the flowchart(s)
- Charts, nodes, edges, and groups created with their names and IDs if mentioned
- User preferences for structure and style
- Current workflow state and what was being worked on
- Any planned next steps

Format as a brief but complete summary that would let someone continue the conversation seamlessly. Keep it under 500 words.`,
    },
    {
      role: "user",
      content: conversationText,
    },
  ]);

  return (
    result?.choices?.[0]?.message?.content ||
    "Previous conversation was summarized but details could not be extracted."
  );
}

function getNodeTypeEnum(chartType: string): string[] {
  switch (chartType) {
    case "erd":
      return ["entity"];
    case "swimlane":
      return ["start", "end", "process", "decision", "action"];
    default:
      return ["start", "end", "process", "decision", "input_output", "data_store", "external_system", "note", "subflow_ref"];
  }
}

function getEdgeTypeEnum(chartType: string): string[] {
  switch (chartType) {
    case "erd":
      return ["one_to_one", "one_to_many", "many_to_many"];
    case "swimlane":
      return ["default", "conditional"];
    default:
      return ["default", "conditional", "error", "async", "fallback"];
  }
}

export function getToolDefinitions(chartType: string = "flowchart") {
  const nodeEnum = getNodeTypeEnum(chartType);
  const edgeEnum = getEdgeTypeEnum(chartType);
  return _buildToolDefinitions(nodeEnum, edgeEnum);
}

export function getAllToolDefinitions(chartType: string = "flowchart"): typeof TOOL_DEFINITIONS {
  const builtIn = getToolDefinitions(chartType);
  const external = mcpClientManager.getAllToolDefinitions() as typeof TOOL_DEFINITIONS;
  return [...builtIn, ...external];
}

// Keep TOOL_DEFINITIONS for backwards compat (uses flowchart defaults)
export const TOOL_DEFINITIONS = _buildToolDefinitions(
  ["start", "end", "process", "decision", "input_output", "data_store", "external_system", "note", "subflow_ref"],
  ["default", "conditional", "error", "async", "fallback"]
);

function _buildToolDefinitions(nodeEnum: string[], edgeEnum: string[]) { return [
  {
    type: "function" as const,
    function: {
      name: "get_chart_status",
      description:
        "Get the current chart status: all nodes, edges, groups, and validation issues. Call this FIRST to understand what exists before taking action.",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string", description: "Chart ID (optional — uses current chart if omitted)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_charts",
      description: "List all charts in the current project",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_chart",
      description: "Create a new chart in the current project",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          audience: { type: "string" },
          chart_type: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_chart",
      description: "Update a chart's metadata",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          audience: { type: "string" },
          status: { type: "string", enum: ["draft", "review", "final"] },
        },
        required: ["chart_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_chart",
      description: "Delete a chart and all its nodes/edges",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
        },
        required: ["chart_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_node",
      description: "Add a single node to the chart. Width/height are optional — omit to auto-size based on content.",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          type: {
            type: "string",
            enum: nodeEnum,
          },
          label: { type: "string" },
          description: { type: "string" },
          position_x: { type: "number" },
          position_y: { type: "number" },
          width: { type: "number", description: "Node width in pixels (omit for auto)" },
          height: { type: "number", description: "Node height in pixels (omit for auto)" },
        },
        required: ["chart_id", "label"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_node",
      description: "Update an existing node's properties, label, description, or size",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string" },
          type: {
            type: "string",
            enum: nodeEnum,
          },
          label: { type: "string" },
          description: { type: "string" },
          width: { type: "number", description: "Node width in pixels" },
          height: { type: "number", description: "Node height in pixels" },
        },
        required: ["node_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_node",
      description: "Delete a node and all connected edges",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string" },
        },
        required: ["node_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_edge",
      description: "Add an edge between two nodes. For ERD edges, use source_attr/target_attr to connect to specific entity attributes.",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          from_node_id: { type: "string" },
          to_node_id: { type: "string" },
          type: {
            type: "string",
            enum: edgeEnum,
          },
          label: { type: "string" },
          condition: { type: "string" },
          source_attr: { type: "string", description: "Source entity attribute name (ERD only — connects edge to that attribute row)" },
          target_attr: { type: "string", description: "Target entity attribute name (ERD only — connects edge to that attribute row)" },
        },
        required: ["chart_id", "from_node_id", "to_node_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_edge",
      description: "Update an existing edge",
      parameters: {
        type: "object",
        properties: {
          edge_id: { type: "string" },
          type: {
            type: "string",
            enum: edgeEnum,
          },
          label: { type: "string" },
          condition: { type: "string" },
        },
        required: ["edge_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_edge",
      description: "Delete an edge",
      parameters: {
        type: "object",
        properties: {
          edge_id: { type: "string" },
        },
        required: ["edge_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "build_chart",
      description:
        "Build a complete chart with multiple nodes and edges in one call. Nodes use temp_ids (e.g. 'tmp_1') that edges can reference. Real IDs are returned.",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                temp_id: { type: "string", description: "Temporary ID for edge references" },
                type: {
                  type: "string",
                  enum: nodeEnum,
                },
                label: { type: "string" },
                description: { type: "string" },
                width: { type: "number", description: "Node width in pixels (omit for auto)" },
                height: { type: "number", description: "Node height in pixels (omit for auto)" },
              },
              required: ["temp_id", "label"],
            },
          },
          edges: {
            type: "array",
            items: {
              type: "object",
              properties: {
                from_temp_id: { type: "string" },
                to_temp_id: { type: "string" },
                type: {
                  type: "string",
                  enum: edgeEnum,
                },
                label: { type: "string" },
                condition: { type: "string" },
                source_attr: { type: "string", description: "Source entity attribute name (ERD only)" },
                target_attr: { type: "string", description: "Target entity attribute name (ERD only)" },
              },
              required: ["from_temp_id", "to_temp_id"],
            },
          },
        },
        required: ["chart_id", "nodes", "edges"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_group",
      description: "Create a group to visually cluster related nodes",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          color: { type: "string" },
          node_ids: { type: "array", items: { type: "string" } },
        },
        required: ["chart_id", "label"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_group",
      description: "Update a group's metadata",
      parameters: {
        type: "object",
        properties: {
          group_id: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          color: { type: "string" },
        },
        required: ["group_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_group",
      description: "Delete a group (nodes are preserved)",
      parameters: {
        type: "object",
        properties: {
          group_id: { type: "string" },
        },
        required: ["group_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "group_nodes",
      description: "Add or remove nodes from a group",
      parameters: {
        type: "object",
        properties: {
          group_id: { type: "string" },
          add_node_ids: { type: "array", items: { type: "string" } },
          remove_node_ids: { type: "array", items: { type: "string" } },
        },
        required: ["group_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "validate_chart",
      description: "Run validation checks on the chart: disconnected nodes, missing start/end, unreachable nodes, dead ends, cycle detection, etc.",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
        },
        required: ["chart_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "auto_layout_chart",
      description: "Automatically arrange nodes using ELK layout algorithm",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          direction: { type: "string", enum: ["DOWN", "RIGHT", "UP", "LEFT"] },
        },
        required: ["chart_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "export_mermaid",
      description: "Export the chart as Mermaid flowchart syntax",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
        },
        required: ["chart_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "export_markdown_summary",
      description: "Export a structured markdown summary of the chart",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
        },
        required: ["chart_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "attach_source_reference",
      description: "Attach a source reference to a node or edge",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          node_id: { type: "string" },
          edge_id: { type: "string" },
          type: { type: "string", enum: ["file", "document", "user_instruction", "inferred"] },
          file_path: { type: "string" },
          line_start: { type: "number" },
          line_end: { type: "number" },
          content_snippet: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["chart_id", "type"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_database",
      description: `Run a SQL query against the project database. Use this for analytical questions or bulk operations.

Allowed: SELECT, INSERT, UPDATE, DELETE. Blocked: DROP, ALTER, CREATE.
SELECT limited to 100 rows.

Schema:
- projects(id, name, description, created_at, updated_at)
- charts(id, project_id, title, description, audience, chart_type, status, created_at, updated_at)
- nodes(id, chart_id, type, label, description, position_x, position_y, style_json JSON with {width?,height?,imageUrl?}, source_ref_id, confidence, created_at, updated_at)
- edges(id, chart_id, from_node_id, to_node_id, type, label, condition, source_ref_id, confidence, created_at, updated_at)
- groups(id, chart_id, label, description, color, created_at, updated_at)
- node_groups(node_id, group_id)
- source_references(id, chart_id, type, file_path, line_start, line_end, document_section, content_snippet, confidence, created_at)
- source_materials(id, project_id, name, content, type, created_at)`,
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "A SQL query (SELECT, INSERT, UPDATE, or DELETE)" },
        },
        required: ["sql"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "resize_nodes",
      description: "Resize one or more nodes. Pass an array of {node_id, width, height}. Use this to set explicit sizes on nodes or reset to auto-size by passing null for width/height.",
      parameters: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                node_id: { type: "string" },
                width: { type: ["number", "null"], description: "Width in pixels, or null to auto-size" },
                height: { type: ["number", "null"], description: "Height in pixels, or null to auto-size" },
              },
              required: ["node_id"],
            },
          },
        },
        required: ["nodes"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_nodes",
      description: "Get all nodes in a chart with their current properties including size. Returns id, type, label, description, positionX, positionY, width, height for each node.",
      parameters: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
        },
        required: ["chart_id"],
      },
    },
  },
]; }

export async function streamChat(
  messages: ChatMessage[],
  tools?: typeof TOOL_DEFINITIONS
): Promise<Response> {
  const config = await getLLMConfig();

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const payload = JSON.stringify(body);
  const url = new URL(`${config.apiBaseUrl}/chat/completions`);
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const req = requestFn(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.socket?.setTimeout(0);
        res.socket?.setKeepAlive(true, 5000);

        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          let errorBody = "";
          res.on("data", (chunk) => (errorBody += chunk));
          res.on("end", () =>
            reject(new Error(`LLM API error ${res.statusCode}: ${errorBody}`))
          );
          return;
        }

        const webStream = Readable.toWeb(res as unknown as Readable);
        resolve(
          new Response(webStream as ReadableStream, {
            status: res.statusCode || 200,
          })
        );
      }
    );

    req.on("error", reject);
    req.on("socket", (socket) => {
      socket.setTimeout(0);
      socket.setKeepAlive(true, 5000);
    });

    req.write(payload);
    req.end();
  });
}

export async function chatCompletion(
  messages: ChatMessage[],
  tools?: typeof TOOL_DEFINITIONS,
  configOverride?: LLMConfig
) {
  const config = configOverride || (await getLLMConfig());

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch(`${config.apiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errorText}`);
  }

  return res.json();
}
