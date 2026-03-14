import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../nanoid";
import { validateChart } from "../validation";
import { exportMermaid } from "../export/mermaid";
import { exportMarkdown } from "../export/markdown";
import {
  newBatchId,
  captureEntity,
  recordEvent,
  clearRedoStack,
  pruneHistory,
} from "../events";

const server = new Server(
  { name: "ai-charts", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_projects",
      description: "List all projects",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_project",
      description: "Create a new project",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_charts",
      description: "List all charts in a project",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string" },
        },
        required: ["project_id"],
      },
    },
    {
      name: "create_chart",
      description: "Create a new chart in a project",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          chart_type: { type: "string", enum: ["flowchart", "erd", "swimlane"], description: "Chart type (default: flowchart)" },
        },
        required: ["project_id", "title"],
      },
    },
    {
      name: "get_chart_status",
      description: "Get full chart status: nodes, edges, groups, validation issues",
      inputSchema: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
        },
        required: ["chart_id"],
      },
    },
    {
      name: "build_chart",
      description: "Build a chart with nodes and edges. Nodes use temp_ids that edges reference.",
      inputSchema: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                temp_id: { type: "string" },
                type: { type: "string", enum: ["start", "end", "process", "decision", "input_output", "data_store", "external_system", "note", "subflow_ref", "entity", "action"] },
                label: { type: "string" },
                description: { type: "string" },
                width: { type: "number", description: "Width in pixels (omit for auto)" },
                height: { type: "number", description: "Height in pixels (omit for auto)" },
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
                type: { type: "string", enum: ["default", "conditional", "error", "async", "fallback", "one_to_one", "one_to_many", "many_to_many"] },
                label: { type: "string" },
              },
              required: ["from_temp_id", "to_temp_id"],
            },
          },
        },
        required: ["chart_id", "nodes", "edges"],
      },
    },
    {
      name: "add_node",
      description: "Add a single node to a chart. Width/height optional — omit for auto-size.",
      inputSchema: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          type: { type: "string" },
          label: { type: "string" },
          description: { type: "string" },
          width: { type: "number", description: "Width in pixels (omit for auto)" },
          height: { type: "number", description: "Height in pixels (omit for auto)" },
        },
        required: ["chart_id", "label"],
      },
    },
    {
      name: "add_edge",
      description: "Add an edge between two nodes",
      inputSchema: {
        type: "object",
        properties: {
          chart_id: { type: "string" },
          from_node_id: { type: "string" },
          to_node_id: { type: "string" },
          type: { type: "string" },
          label: { type: "string" },
        },
        required: ["chart_id", "from_node_id", "to_node_id"],
      },
    },
    {
      name: "delete_node",
      description: "Delete a node",
      inputSchema: {
        type: "object",
        properties: { node_id: { type: "string" } },
        required: ["node_id"],
      },
    },
    {
      name: "delete_edge",
      description: "Delete an edge",
      inputSchema: {
        type: "object",
        properties: { edge_id: { type: "string" } },
        required: ["edge_id"],
      },
    },
    {
      name: "resize_nodes",
      description: "Resize one or more nodes. Pass null for width/height to reset to auto-size.",
      inputSchema: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                node_id: { type: "string" },
                width: { type: ["number", "null"] },
                height: { type: ["number", "null"] },
              },
              required: ["node_id"],
            },
          },
        },
        required: ["nodes"],
      },
    },
    {
      name: "get_nodes",
      description: "Get all nodes in a chart with their current properties including size",
      inputSchema: {
        type: "object",
        properties: { chart_id: { type: "string" } },
        required: ["chart_id"],
      },
    },
    {
      name: "validate_chart",
      description: "Run validation checks on a chart",
      inputSchema: {
        type: "object",
        properties: { chart_id: { type: "string" } },
        required: ["chart_id"],
      },
    },
    {
      name: "export_mermaid",
      description: "Export chart as Mermaid flowchart syntax",
      inputSchema: {
        type: "object",
        properties: { chart_id: { type: "string" } },
        required: ["chart_id"],
      },
    },
    {
      name: "export_markdown",
      description: "Export chart as a structured markdown summary",
      inputSchema: {
        type: "object",
        properties: { chart_id: { type: "string" } },
        required: ["chart_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const now = new Date().toISOString();

  switch (name) {
    case "list_projects": {
      const rows = await db.select().from(schema.projects);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    case "create_project": {
      const project = {
        id: newId(),
        name: (args as Record<string, string>).name || "Untitled",
        description: (args as Record<string, string>).description || "",
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.projects).values(project);
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    }

    case "list_charts": {
      const rows = await db.select().from(schema.charts)
        .where(eq(schema.charts.projectId, (args as Record<string, string>).project_id));
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    case "create_chart": {
      const a = args as Record<string, string>;
      const chart = {
        id: newId(),
        projectId: a.project_id,
        title: a.title || "Untitled",
        description: a.description || "",
        audience: "",
        chartType: a.chart_type || "flowchart",
        status: "draft" as const,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.charts).values(chart);
      return { content: [{ type: "text", text: JSON.stringify(chart, null, 2) }] };
    }

    case "get_chart_status": {
      const chartId = (args as Record<string, string>).chart_id;
      const [chart] = await db.select().from(schema.charts).where(eq(schema.charts.id, chartId));
      if (!chart) return { content: [{ type: "text", text: "Chart not found" }] };
      const nodeRows = await db.select().from(schema.nodes).where(eq(schema.nodes.chartId, chartId));
      const edgeRows = await db.select().from(schema.edges).where(eq(schema.edges.chartId, chartId));
      const issues = await validateChart(chartId);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            chart,
            nodes: nodeRows.map((n) => ({ id: n.id, type: n.type, label: n.label })),
            edges: edgeRows.map((e) => ({ id: e.id, from: e.fromNodeId, to: e.toNodeId, type: e.type, label: e.label })),
            validation: issues,
          }, null, 2),
        }],
      };
    }

    case "build_chart": {
      const a = args as Record<string, unknown>;
      const chartId = a.chart_id as string;
      const tempIdMap = new Map<string, string>();
      const nodeArray = (a.nodes as Array<Record<string, string>>) || [];
      const edgeArray = (a.edges as Array<Record<string, string>>) || [];

      for (const n of nodeArray) {
        const realId = newId();
        tempIdMap.set(n.temp_id, realId);
        const sObj: Record<string, unknown> = {};
        if (n.width != null) sObj.width = n.width;
        if (n.height != null) sObj.height = n.height;
        await db.insert(schema.nodes).values({
          id: realId, chartId, type: (n.type || "process") as "process", label: n.label || "Node",
          description: n.description || "", positionX: 0, positionY: 0,
          styleJson: Object.keys(sObj).length > 0 ? JSON.stringify(sObj) : "{}", sourceRefId: null, confidence: 1.0, createdAt: now, updatedAt: now,
        });
      }

      const createdEdgesMcp = [];
      for (const e of edgeArray) {
        const fromId = tempIdMap.get(e.from_temp_id) || e.from_temp_id;
        const toId = tempIdMap.get(e.to_temp_id) || e.to_temp_id;
        const edge = {
          id: newId(), chartId, fromNodeId: fromId, toNodeId: toId,
          type: (e.type || "default") as "default", label: e.label || "", condition: "",
          sourceRefId: null, confidence: 1.0, createdAt: now, updatedAt: now,
        };
        await db.insert(schema.edges).values(edge);
        createdEdgesMcp.push(edge);
      }

      // Record events
      const buildBid = newBatchId();
      let buildSeq = 0;
      for (const n of nodeArray) {
        const realId = tempIdMap.get(n.temp_id)!;
        const [nodeRow] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, realId));
        if (nodeRow) {
          await recordEvent({ chartId, batchId: buildBid, sequence: buildSeq++, entityType: "node", entityId: realId, action: "create", beforeJson: null, afterJson: nodeRow as unknown as Record<string, unknown>, source: "mcp", description: `MCP: Built chart` });
        }
      }
      for (const edge of createdEdgesMcp) {
        await recordEvent({ chartId, batchId: buildBid, sequence: buildSeq++, entityType: "edge", entityId: edge.id, action: "create", beforeJson: null, afterJson: edge as unknown as Record<string, unknown>, source: "mcp", description: `MCP: Built chart` });
      }
      await clearRedoStack(chartId);
      pruneHistory(chartId).catch(() => {});

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            nodes_created: nodeArray.length,
            edges_created: edgeArray.length,
            id_mapping: Object.fromEntries(tempIdMap),
          }, null, 2),
        }],
      };
    }

    case "add_node": {
      const a = args as Record<string, unknown>;
      const sObj: Record<string, unknown> = {};
      if (a.width != null) sObj.width = a.width;
      if (a.height != null) sObj.height = a.height;
      const node = {
        id: newId(), chartId: a.chart_id as string, type: ((a.type as string) || "process") as "process",
        label: (a.label as string) || "Node", description: (a.description as string) || "",
        positionX: 0, positionY: 0, styleJson: Object.keys(sObj).length > 0 ? JSON.stringify(sObj) : "{}",
        sourceRefId: null, confidence: 1.0, createdAt: now, updatedAt: now,
      };
      await db.insert(schema.nodes).values(node);
      const bid = newBatchId();
      await recordEvent({ chartId: a.chart_id as string, batchId: bid, sequence: 0, entityType: "node", entityId: node.id, action: "create", beforeJson: null, afterJson: node as unknown as Record<string, unknown>, source: "mcp", description: `MCP: Added node '${node.label}'` });
      await clearRedoStack(a.chart_id as string);
      pruneHistory(a.chart_id as string).catch(() => {});
      return { content: [{ type: "text", text: JSON.stringify(node, null, 2) }] };
    }

    case "add_edge": {
      const a = args as Record<string, string>;
      const edge = {
        id: newId(), chartId: a.chart_id, fromNodeId: a.from_node_id,
        toNodeId: a.to_node_id, type: (a.type || "default") as "default",
        label: a.label || "", condition: "",
        sourceRefId: null, confidence: 1.0, createdAt: now, updatedAt: now,
      };
      await db.insert(schema.edges).values(edge);
      const bid = newBatchId();
      await recordEvent({ chartId: a.chart_id, batchId: bid, sequence: 0, entityType: "edge", entityId: edge.id, action: "create", beforeJson: null, afterJson: edge as unknown as Record<string, unknown>, source: "mcp", description: `MCP: Added edge${edge.label ? ` '${edge.label}'` : ""}` });
      await clearRedoStack(a.chart_id);
      pruneHistory(a.chart_id).catch(() => {});
      return { content: [{ type: "text", text: JSON.stringify(edge, null, 2) }] };
    }

    case "delete_node": {
      const dnId = (args as Record<string, string>).node_id;
      const beforeDn = await captureEntity("node", dnId);
      if (beforeDn) {
        const cid = beforeDn.chartId as string;
        const bid = newBatchId();
        const connEdges = await db.select().from(schema.edges).where(eq(schema.edges.fromNodeId, dnId));
        const connEdges2 = await db.select().from(schema.edges).where(eq(schema.edges.toNodeId, dnId));
        const allEdges = [...connEdges, ...connEdges2.filter(e => !connEdges.find(c => c.id === e.id))];
        let seq = 0;
        for (const edge of allEdges) {
          await recordEvent({ chartId: cid, batchId: bid, sequence: seq++, entityType: "edge", entityId: edge.id, action: "delete", beforeJson: edge as unknown as Record<string, unknown>, afterJson: null, source: "mcp", description: `MCP: Deleted node '${beforeDn.label}'` });
        }
        await recordEvent({ chartId: cid, batchId: bid, sequence: seq, entityType: "node", entityId: dnId, action: "delete", beforeJson: beforeDn, afterJson: null, source: "mcp", description: `MCP: Deleted node '${beforeDn.label}'` });
        await db.delete(schema.nodes).where(eq(schema.nodes.id, dnId));
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      } else {
        await db.delete(schema.nodes).where(eq(schema.nodes.id, dnId));
      }
      return { content: [{ type: "text", text: "Deleted" }] };
    }

    case "delete_edge": {
      const deId = (args as Record<string, string>).edge_id;
      const beforeDe = await captureEntity("edge", deId);
      if (beforeDe) {
        const cid = beforeDe.chartId as string;
        const bid = newBatchId();
        await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "edge", entityId: deId, action: "delete", beforeJson: beforeDe, afterJson: null, source: "mcp", description: `MCP: Deleted edge` });
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      }
      await db.delete(schema.edges).where(eq(schema.edges.id, deId));
      return { content: [{ type: "text", text: "Deleted" }] };
    }

    case "validate_chart": {
      const issues = await validateChart((args as Record<string, string>).chart_id);
      return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
    }

    case "export_mermaid": {
      const mermaid = await exportMermaid((args as Record<string, string>).chart_id);
      return { content: [{ type: "text", text: mermaid }] };
    }

    case "export_markdown": {
      const md = await exportMarkdown((args as Record<string, string>).chart_id);
      return { content: [{ type: "text", text: md }] };
    }

    case "resize_nodes": {
      const a = args as Record<string, unknown>;
      const nodeList = (a.nodes as Array<Record<string, unknown>>) || [];
      if (nodeList.length === 0) return { content: [{ type: "text", text: "No nodes specified" }], isError: true };
      const batchId = newBatchId();
      let seq = 0;
      const results = [];
      for (const item of nodeList) {
        const nid = item.node_id as string;
        const beforeN = await captureEntity("node", nid);
        if (!beforeN) { results.push({ node_id: nid, error: "Not found" }); continue; }
        const existing = (() => { try { return JSON.parse((beforeN.styleJson as string) || "{}"); } catch { return {}; } })();
        if (item.width !== undefined) { if (item.width === null) delete existing.width; else existing.width = item.width; }
        if (item.height !== undefined) { if (item.height === null) delete existing.height; else existing.height = item.height; }
        const newStyleJson = JSON.stringify(existing);
        await db.update(schema.nodes).set({ styleJson: newStyleJson, updatedAt: now }).where(eq(schema.nodes.id, nid));
        const [updated] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nid));
        if (updated) {
          const cid = beforeN.chartId as string;
          await recordEvent({ chartId: cid, batchId, sequence: seq++, entityType: "node", entityId: nid, action: "update", beforeJson: beforeN, afterJson: updated as unknown as Record<string, unknown>, source: "mcp", description: `MCP: Resized node '${updated.label}'` });
          if (seq === nodeList.length) { await clearRedoStack(cid); pruneHistory(cid).catch(() => {}); }
        }
        results.push({ node_id: nid, width: existing.width ?? null, height: existing.height ?? null });
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    case "get_nodes": {
      const a = args as Record<string, string>;
      const rows = await db.select().from(schema.nodes).where(eq(schema.nodes.chartId, a.chart_id));
      const result = rows.map((n) => {
        const s = (() => { try { return JSON.parse(n.styleJson || "{}"); } catch { return {}; } })();
        return { id: n.id, type: n.type, label: n.label, description: n.description, positionX: n.positionX, positionY: n.positionY, width: s.width ?? null, height: s.height ?? null };
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] AI Charts MCP server running on stdio");
}

main().catch(console.error);
