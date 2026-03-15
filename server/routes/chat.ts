import { Hono } from "hono";
import {
  streamChat,
  getToolDefinitions,
  getAllToolDefinitions,
  getLLMConfig,
  estimateTokens,
  getContextWindowSize,
  summarizeConversation,
} from "../lib/llm";
import { mcpClientManager } from "../lib/mcp/clientManager";
import { db, schema, sqlite } from "../db/client";
import { eq } from "drizzle-orm";
import { newId } from "../lib/nanoid";
import { validateChart } from "../lib/validation";
import { exportMermaid } from "../lib/export/mermaid";
import { exportMarkdown } from "../lib/export/markdown";
import {
  newBatchId,
  captureEntity,
  recordEvent,
  clearRedoStack,
  pruneHistory,
} from "../lib/events";

const app = new Hono();

function getWizardSystemPrompt(): string {
  return `You are a flowchart builder assistant helping users create process diagrams, architecture flows, and workflow charts. You are in SETUP WIZARD mode.

Guide the user through creating their first chart:
1. **Project** — Ask what project this is for, create it.
2. **Chart** — Ask what flowchart they need, create it.
3. **Build** — Use build_chart to create the initial nodes and edges based on their description.

BEFORE YOUR FIRST RESPONSE: Call list_charts to check what exists. Pick up from the first incomplete step.

RULES:
- **CRITICAL: Use the provided tool functions to make changes. NEVER simulate tool calls in text.**
- Be proactive: after each step, suggest the next action.
- When building a chart, use build_chart with temp_ids for efficient creation.
- Use appropriate node types: start (green pill), end (red pill), process (blue rect), decision (amber diamond), input_output (purple parallelogram), data_store (teal cylinder), external_system (orange double-border), note (gray dashed), subflow_ref (indigo nested).
- Decision nodes MUST have 2+ outgoing edges with descriptive labels (e.g. "Yes"/"No").
- Every chart should have at least one start and one end node.
- Keep messages concise — 2-3 paragraphs max.`;
}

function getBuilderSystemPrompt(context: {
  chart?: Record<string, unknown>;
  nodeCount?: number;
  edgeCount?: number;
  chartType?: string;
}): string {
  const ct = context.chartType || "flowchart";
  let prompt = `You are a chart builder assistant. You are in CHART BUILDER mode.

Help the user modify, extend, and refine their chart. You can:
- Add/remove/update nodes and edges
- Build entire sub-flows with build_chart
- Create groups to organize related nodes
- Run validation to find issues
- Export to Mermaid or Markdown
- Auto-layout the chart

RULES:
- **CRITICAL: Use the provided tool functions. NEVER simulate tool calls in text.**
- When adding multiple nodes and edges, prefer build_chart for efficiency.
- Use appropriate node types for each concept.
- Proactively suggest improvements after modifications.
- After modifications, suggest running validate_chart to check for issues.
- Keep messages concise.`;

  if (ct === "erd") {
    prompt += `\n\nCHART TYPE: ERD (Entity Relationship Diagram)
- You are building an ERD. Use node type 'entity' for all entities.
- Store attributes in description (one per line: \`name : type [constraints]\`). Example constraints: PK, FK, NOT NULL, UNIQUE.
- Use edge types: one_to_one, one_to_many, many_to_many. Label edges with the relationship name.
- **IMPORTANT**: When adding edges, use source_attr and target_attr to connect to specific attribute rows. For example, if a Posts entity has a "user_id" FK that references Users "id", set source_attr="user_id" and target_attr="id". This makes edges visually connect to the correct attribute row on each entity.
- Do NOT use start/end/process/decision nodes — only 'entity' nodes.`;
  } else if (ct === "swimlane") {
    prompt += `\n\nCHART TYPE: Swimlane Diagram
- You are building a Swimlane diagram. Create groups as lanes first, then add activity nodes inside them.
- Use node types: start, end, decision, action, process.
- Groups represent lanes (actors/roles/departments). Create a group for each lane.
- Use group_nodes to assign nodes to their respective lanes.`;
  } else if (ct === "mindmap") {
    prompt += `\n\nCHART TYPE: Mind Map
- You are building a Mind Map. Use central_topic for the main idea, main_branch for primary categories, sub_branch for secondary topics, and leaf for details.
- Connect all nodes with branch edges radiating outward from the central topic.
- Every mind map MUST have exactly one central_topic node at the center.
- Do NOT use start/end/process/decision nodes — only central_topic, main_branch, sub_branch, leaf, and sticky_note.
- Structure: central_topic → main_branch → sub_branch → leaf.`;
  } else if (ct === "sequence") {
    prompt += `\n\nCHART TYPE: Sequence Diagram
- You are building a Sequence Diagram. Use actor for people/roles and participant for systems/services.
- Connect them with sync_message, async_message, return_message, or self_message edges.
- Include order_index on edges to control message ordering.
- Do NOT use start/end/process/decision nodes — only actor, participant, lifeline_activation, and sticky_note.
- Structure: actors/participants at the top, messages flow between them in order.`;
  } else {
    prompt += `\n\nCHART TYPE: Flowchart
- Use appropriate node types: start (green pill), end (red pill), process (blue rect), decision (amber diamond), input_output (purple parallelogram), data_store (teal cylinder), external_system (orange double-border), note (gray dashed), subflow_ref (indigo nested).
- Decision nodes MUST have 2+ outgoing edges with descriptive labels (e.g. "Yes"/"No").
- Every chart should have at least one start and one end node.`;
  }

  if (context.chart) {
    prompt += `\n\nCURRENT CHART:\nID: ${context.chart.id}\nTitle: ${context.chart.title}\nType: ${ct}\nStatus: ${context.chart.status}\nNodes: ${context.nodeCount ?? 0}\nEdges: ${context.edgeCount ?? 0}`;
  }

  return prompt;
}

async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  projectId: string | null,
  chartId: string | null
): Promise<{ success: boolean; result: unknown }> {
  const now = new Date().toISOString();

  switch (name) {
    case "get_chart_status": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) {
        return { success: true, result: { message: "No chart selected" } };
      }
      const [chart] = await db.select().from(schema.charts).where(eq(schema.charts.id, cid));
      if (!chart) return { success: false, result: "Chart not found" };

      const nodeRows = await db.select().from(schema.nodes).where(eq(schema.nodes.chartId, cid));
      const edgeRows = await db.select().from(schema.edges).where(eq(schema.edges.chartId, cid));
      const groupRows = await db.select().from(schema.groups).where(eq(schema.groups.chartId, cid));
      const issues = await validateChart(cid);

      return {
        success: true,
        result: {
          chart,
          nodes: nodeRows.map((n) => ({ id: n.id, type: n.type, label: n.label, description: n.description })),
          edges: edgeRows.map((e) => ({
            id: e.id,
            from: e.fromNodeId,
            to: e.toNodeId,
            type: e.type,
            label: e.label,
          })),
          groups: groupRows.map((g) => ({ id: g.id, label: g.label })),
          validation: issues,
        },
      };
    }

    case "list_charts": {
      if (!projectId) return { success: true, result: [] };
      const rows = await db.select().from(schema.charts).where(eq(schema.charts.projectId, projectId));
      return { success: true, result: rows };
    }

    case "create_chart": {
      if (!projectId) return { success: false, result: "No project selected" };
      const chart = {
        id: newId(),
        projectId,
        title: (args.title as string) || "Untitled Chart",
        description: (args.description as string) || "",
        audience: (args.audience as string) || "",
        chartType: (args.chart_type as string) || "flowchart",
        status: "draft" as const,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.charts).values(chart);
      return { success: true, result: chart };
    }

    case "update_chart": {
      const cid = args.chart_id as string;
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.title) updates.title = args.title;
      if (args.description) updates.description = args.description;
      if (args.audience) updates.audience = args.audience;
      if (args.status) updates.status = args.status;
      await db.update(schema.charts).set(updates).where(eq(schema.charts.id, cid));
      const [updated] = await db.select().from(schema.charts).where(eq(schema.charts.id, cid));
      return { success: true, result: updated };
    }

    case "delete_chart": {
      await db.delete(schema.charts).where(eq(schema.charts.id, args.chart_id as string));
      return { success: true, result: { deleted: args.chart_id } };
    }

    case "add_node": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      const styleObj: Record<string, unknown> = {};
      if (args.width != null) styleObj.width = args.width;
      if (args.height != null) styleObj.height = args.height;
      const node = {
        id: newId(),
        chartId: cid,
        type: ((args.type as string) || "process") as "process",
        label: (args.label as string) || "New Node",
        description: (args.description as string) || "",
        positionX: (args.position_x as number) ?? 0,
        positionY: (args.position_y as number) ?? 0,
        styleJson: Object.keys(styleObj).length > 0 ? JSON.stringify(styleObj) : "{}",
        sourceRefId: null,
        confidence: 1.0,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.nodes).values(node);
      const bid = newBatchId();
      await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "node", entityId: node.id, action: "create", beforeJson: null, afterJson: node as unknown as Record<string, unknown>, source: "chat", description: `AI: Added node '${node.label}'` });
      await clearRedoStack(cid);
      pruneHistory(cid).catch(() => {});
      return { success: true, result: node };
    }

    case "update_node": {
      const nid = args.node_id as string;
      const beforeNode = await captureEntity("node", nid);
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.type) updates.type = args.type;
      if (args.label) updates.label = args.label;
      if (args.description !== undefined) updates.description = args.description;
      if (args.width !== undefined || args.height !== undefined) {
        const [current] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nid));
        const existing = (() => { try { return JSON.parse(current?.styleJson || "{}"); } catch { return {}; } })();
        if (args.width !== undefined) { if (args.width === null) delete existing.width; else existing.width = args.width; }
        if (args.height !== undefined) { if (args.height === null) delete existing.height; else existing.height = args.height; }
        updates.styleJson = JSON.stringify(existing);
      }
      await db.update(schema.nodes).set(updates).where(eq(schema.nodes.id, nid));
      const [updated] = await db.select().from(schema.nodes).where(eq(schema.nodes.id, nid));
      if (beforeNode && updated) {
        const cid = beforeNode.chartId as string;
        const bid = newBatchId();
        await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "node", entityId: nid, action: "update", beforeJson: beforeNode, afterJson: updated as unknown as Record<string, unknown>, source: "chat", description: `AI: Updated node '${updated.label}'` });
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      }
      return { success: true, result: updated };
    }

    case "delete_node": {
      const nid = args.node_id as string;
      const beforeDelNode = await captureEntity("node", nid);
      if (beforeDelNode) {
        const cid = beforeDelNode.chartId as string;
        const bid = newBatchId();
        // Capture connected edges before cascade
        const connEdges = await db.select().from(schema.edges).where(eq(schema.edges.fromNodeId, nid));
        const connEdges2 = await db.select().from(schema.edges).where(eq(schema.edges.toNodeId, nid));
        const allConnEdges = [...connEdges, ...connEdges2.filter(e => !connEdges.find(c => c.id === e.id))];
        let seq = 0;
        for (const edge of allConnEdges) {
          await recordEvent({ chartId: cid, batchId: bid, sequence: seq++, entityType: "edge", entityId: edge.id, action: "delete", beforeJson: edge as unknown as Record<string, unknown>, afterJson: null, source: "chat", description: `AI: Deleted node '${beforeDelNode.label}'` });
        }
        await recordEvent({ chartId: cid, batchId: bid, sequence: seq, entityType: "node", entityId: nid, action: "delete", beforeJson: beforeDelNode, afterJson: null, source: "chat", description: `AI: Deleted node '${beforeDelNode.label}'` });
        await db.delete(schema.nodes).where(eq(schema.nodes.id, nid));
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      } else {
        await db.delete(schema.nodes).where(eq(schema.nodes.id, nid));
      }
      return { success: true, result: { deleted: nid } };
    }

    case "add_edge": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      // Build condition: if source_attr/target_attr provided, encode as JSON
      let edgeCondition = (args.condition as string) || "";
      if (args.source_attr || args.target_attr) {
        const handleInfo: Record<string, string> = {};
        if (args.source_attr) handleInfo.sourceAttr = args.source_attr as string;
        if (args.target_attr) handleInfo.targetAttr = args.target_attr as string;
        edgeCondition = JSON.stringify(handleInfo);
      }
      const edge = {
        id: newId(),
        chartId: cid,
        fromNodeId: args.from_node_id as string,
        toNodeId: args.to_node_id as string,
        type: ((args.type as string) || "default") as "default",
        label: (args.label as string) || "",
        condition: edgeCondition,
        sourceRefId: null,
        confidence: 1.0,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.edges).values(edge);
      const bid = newBatchId();
      await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "edge", entityId: edge.id, action: "create", beforeJson: null, afterJson: edge as unknown as Record<string, unknown>, source: "chat", description: `AI: Added edge${edge.label ? ` '${edge.label}'` : ""}` });
      await clearRedoStack(cid);
      pruneHistory(cid).catch(() => {});
      return { success: true, result: edge };
    }

    case "update_edge": {
      const eid = args.edge_id as string;
      const beforeEdge = await captureEntity("edge", eid);
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.type) updates.type = args.type;
      if (args.label !== undefined) updates.label = args.label;
      if (args.condition !== undefined) updates.condition = args.condition;
      await db.update(schema.edges).set(updates).where(eq(schema.edges.id, eid));
      const [updated] = await db.select().from(schema.edges).where(eq(schema.edges.id, eid));
      if (beforeEdge && updated) {
        const cid = beforeEdge.chartId as string;
        const bid = newBatchId();
        await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "edge", entityId: eid, action: "update", beforeJson: beforeEdge, afterJson: updated as unknown as Record<string, unknown>, source: "chat", description: `AI: Updated edge` });
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      }
      return { success: true, result: updated };
    }

    case "delete_edge": {
      const delEdgeId = args.edge_id as string;
      const beforeDelEdge = await captureEntity("edge", delEdgeId);
      if (beforeDelEdge) {
        const cid = beforeDelEdge.chartId as string;
        const bid = newBatchId();
        await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "edge", entityId: delEdgeId, action: "delete", beforeJson: beforeDelEdge, afterJson: null, source: "chat", description: `AI: Deleted edge` });
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      }
      await db.delete(schema.edges).where(eq(schema.edges.id, delEdgeId));
      return { success: true, result: { deleted: delEdgeId } };
    }

    case "build_chart": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };

      const tempIdMap = new Map<string, string>();
      const createdNodes = [];
      const nodeArray = (args.nodes as Array<Record<string, unknown>>) || [];
      const edgeArray = (args.edges as Array<Record<string, unknown>>) || [];

      // Create nodes
      for (const n of nodeArray) {
        const realId = newId();
        tempIdMap.set(n.temp_id as string, realId);
        const sObj: Record<string, unknown> = {};
        if (n.width != null) sObj.width = n.width;
        if (n.height != null) sObj.height = n.height;
        const node = {
          id: realId,
          chartId: cid,
          type: ((n.type as string) || "process") as "process",
          label: (n.label as string) || "Node",
          description: (n.description as string) || "",
          positionX: 0,
          positionY: 0,
          styleJson: Object.keys(sObj).length > 0 ? JSON.stringify(sObj) : "{}",
          sourceRefId: null,
          confidence: 1.0,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(schema.nodes).values(node);
        createdNodes.push({ ...node, temp_id: n.temp_id });
      }

      // Create edges
      const createdEdges = [];
      for (const e of edgeArray) {
        const fromId = tempIdMap.get(e.from_temp_id as string) || (e.from_temp_id as string);
        const toId = tempIdMap.get(e.to_temp_id as string) || (e.to_temp_id as string);
        // Build condition from source_attr/target_attr if provided
        let buildEdgeCondition = (e.condition as string) || "";
        if (e.source_attr || e.target_attr) {
          const handleInfo: Record<string, string> = {};
          if (e.source_attr) handleInfo.sourceAttr = e.source_attr as string;
          if (e.target_attr) handleInfo.targetAttr = e.target_attr as string;
          buildEdgeCondition = JSON.stringify(handleInfo);
        }
        const edge = {
          id: newId(),
          chartId: cid,
          fromNodeId: fromId,
          toNodeId: toId,
          type: ((e.type as string) || "default") as "default",
          label: (e.label as string) || "",
          condition: buildEdgeCondition,
          sourceRefId: null,
          confidence: 1.0,
          createdAt: now,
          updatedAt: now,
        };
        await db.insert(schema.edges).values(edge);
        createdEdges.push(edge);
      }

      // Record events for build_chart
      const buildBatchId = newBatchId();
      let buildSeq = 0;
      for (const n of createdNodes) {
        const { temp_id, ...nodeData } = n;
        await recordEvent({ chartId: cid, batchId: buildBatchId, sequence: buildSeq++, entityType: "node", entityId: n.id, action: "create", beforeJson: null, afterJson: nodeData as unknown as Record<string, unknown>, source: "chat", description: `AI: Built chart` });
      }
      for (const e of createdEdges) {
        await recordEvent({ chartId: cid, batchId: buildBatchId, sequence: buildSeq++, entityType: "edge", entityId: e.id, action: "create", beforeJson: null, afterJson: e as unknown as Record<string, unknown>, source: "chat", description: `AI: Built chart` });
      }
      await clearRedoStack(cid);
      pruneHistory(cid).catch(() => {});

      return {
        success: true,
        result: {
          nodes_created: createdNodes.length,
          edges_created: createdEdges.length,
          id_mapping: Object.fromEntries(tempIdMap),
          nodes: createdNodes.map((n) => ({ temp_id: n.temp_id, id: n.id, label: n.label })),
        },
      };
    }

    case "create_group": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      const group = {
        id: newId(),
        chartId: cid,
        label: (args.label as string) || "Group",
        description: (args.description as string) || "",
        color: (args.color as string) || "#3b82f6",
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.groups).values(group);
      const nodeIds = (args.node_ids as string[]) || [];
      const grpBid = newBatchId();
      let grpSeq = 0;
      await recordEvent({ chartId: cid, batchId: grpBid, sequence: grpSeq++, entityType: "group", entityId: group.id, action: "create", beforeJson: null, afterJson: group as unknown as Record<string, unknown>, source: "chat", description: `AI: Created group '${group.label}'` });
      for (const nodeId of nodeIds) {
        await db.insert(schema.nodeGroups).values({ nodeId, groupId: group.id });
        await recordEvent({ chartId: cid, batchId: grpBid, sequence: grpSeq++, entityType: "node_group", entityId: `${nodeId}:${group.id}`, action: "create", beforeJson: null, afterJson: { nodeId, groupId: group.id }, source: "chat", description: `AI: Created group '${group.label}'` });
      }
      await clearRedoStack(cid);
      pruneHistory(cid).catch(() => {});
      return { success: true, result: { ...group, nodeIds } };
    }

    case "update_group": {
      const gid = args.group_id as string;
      const beforeGrp = await captureEntity("group", gid);
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.label) updates.label = args.label;
      if (args.description !== undefined) updates.description = args.description;
      if (args.color) updates.color = args.color;
      await db.update(schema.groups).set(updates).where(eq(schema.groups.id, gid));
      const [updated] = await db.select().from(schema.groups).where(eq(schema.groups.id, gid));
      if (beforeGrp && updated) {
        const cid = beforeGrp.chartId as string;
        const bid = newBatchId();
        await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "group", entityId: gid, action: "update", beforeJson: beforeGrp, afterJson: updated as unknown as Record<string, unknown>, source: "chat", description: `AI: Updated group '${updated.label}'` });
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      }
      return { success: true, result: updated };
    }

    case "delete_group": {
      const delGrpId = args.group_id as string;
      const beforeDelGrp = await captureEntity("group", delGrpId);
      if (beforeDelGrp) {
        const cid = beforeDelGrp.chartId as string;
        const bid = newBatchId();
        await recordEvent({ chartId: cid, batchId: bid, sequence: 0, entityType: "group", entityId: delGrpId, action: "delete", beforeJson: beforeDelGrp, afterJson: null, source: "chat", description: `AI: Deleted group '${beforeDelGrp.label}'` });
        await clearRedoStack(cid);
        pruneHistory(cid).catch(() => {});
      }
      await db.delete(schema.groups).where(eq(schema.groups.id, delGrpId));
      return { success: true, result: { deleted: delGrpId } };
    }

    case "group_nodes": {
      const gid = args.group_id as string;
      const [grpForNodes] = await db.select().from(schema.groups).where(eq(schema.groups.id, gid));
      const gnBid = newBatchId();
      let gnSeq = 0;
      for (const nodeId of (args.add_node_ids as string[]) || []) {
        await db.insert(schema.nodeGroups).values({ nodeId, groupId: gid }).onConflictDoNothing();
        if (grpForNodes) {
          await recordEvent({ chartId: grpForNodes.chartId, batchId: gnBid, sequence: gnSeq++, entityType: "node_group", entityId: `${nodeId}:${gid}`, action: "create", beforeJson: null, afterJson: { nodeId, groupId: gid }, source: "chat", description: `AI: Modified group nodes` });
        }
      }
      for (const nodeId of (args.remove_node_ids as string[]) || []) {
        if (grpForNodes) {
          await recordEvent({ chartId: grpForNodes.chartId, batchId: gnBid, sequence: gnSeq++, entityType: "node_group", entityId: `${nodeId}:${gid}`, action: "delete", beforeJson: { nodeId, groupId: gid }, afterJson: null, source: "chat", description: `AI: Modified group nodes` });
        }
        await db.delete(schema.nodeGroups).where(
          eq(schema.nodeGroups.nodeId, nodeId)
        );
      }
      if (grpForNodes) {
        await clearRedoStack(grpForNodes.chartId);
        pruneHistory(grpForNodes.chartId).catch(() => {});
      }
      return { success: true, result: { ok: true } };
    }

    case "validate_chart": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      const issues = await validateChart(cid);
      return { success: true, result: { issues, count: issues.length } };
    }

    case "auto_layout_chart": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      // Server-side layout placeholder — actual layout happens client-side with ELK
      return { success: true, result: { message: "Layout will be applied on the client. The UI will auto-layout." } };
    }

    case "export_mermaid": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      const mermaid = await exportMermaid(cid);
      return { success: true, result: { mermaid } };
    }

    case "export_markdown_summary": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      const markdown = await exportMarkdown(cid);
      return { success: true, result: { markdown } };
    }

    case "attach_source_reference": {
      const ref = {
        id: newId(),
        chartId: (args.chart_id as string) || chartId || "",
        type: ((args.type as string) || "user_instruction") as "user_instruction",
        filePath: (args.file_path as string) || "",
        lineStart: (args.line_start as number) || null,
        lineEnd: (args.line_end as number) || null,
        documentSection: "",
        contentSnippet: (args.content_snippet as string) || "",
        confidence: (args.confidence as number) ?? 1.0,
        createdAt: now,
      };
      await db.insert(schema.sourceReferences).values(ref);

      // Link to node or edge
      if (args.node_id) {
        await db.update(schema.nodes).set({ sourceRefId: ref.id }).where(eq(schema.nodes.id, args.node_id as string));
      }
      if (args.edge_id) {
        await db.update(schema.edges).set({ sourceRefId: ref.id }).where(eq(schema.edges.id, args.edge_id as string));
      }

      return { success: true, result: ref };
    }

    case "query_database": {
      const sql = (args.sql as string || "").trim();
      const upper = sql.toUpperCase();
      if (upper.startsWith("DROP") || upper.startsWith("ALTER") || upper.startsWith("CREATE")) {
        return { success: false, result: "Blocked: DDL statements not allowed" };
      }
      try {
        if (upper.startsWith("SELECT")) {
          const stmt = sqlite.prepare(sql);
          const rows = stmt.all();
          return { success: true, result: rows.slice(0, 100) };
        } else {
          const stmt = sqlite.prepare(sql);
          const info = stmt.run();
          return { success: true, result: { changes: info.changes } };
        }
      } catch (err) {
        return { success: false, result: `SQL error: ${(err as Error).message}` };
      }
    }

    case "resize_nodes": {
      const nodeList = (args.nodes as Array<Record<string, unknown>>) || [];
      if (nodeList.length === 0) return { success: false, result: "No nodes specified" };
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
          await recordEvent({ chartId: cid, batchId, sequence: seq++, entityType: "node", entityId: nid, action: "update", beforeJson: beforeN, afterJson: updated as unknown as Record<string, unknown>, source: "chat", description: `AI: Resized node '${updated.label}'` });
          if (seq === nodeList.length) { await clearRedoStack(cid); pruneHistory(cid).catch(() => {}); }
        }
        results.push({ node_id: nid, width: existing.width ?? null, height: existing.height ?? null });
      }
      return { success: true, result: results };
    }

    case "get_nodes": {
      const cid = (args.chart_id as string) || chartId;
      if (!cid) return { success: false, result: "No chart specified" };
      const rows = await db.select().from(schema.nodes).where(eq(schema.nodes.chartId, cid));
      const result = rows.map((n) => {
        const s = (() => { try { return JSON.parse(n.styleJson || "{}"); } catch { return {}; } })();
        return {
          id: n.id, type: n.type, label: n.label, description: n.description,
          positionX: n.positionX, positionY: n.positionY,
          width: s.width ?? null, height: s.height ?? null,
        };
      });
      return { success: true, result };
    }

    default:
      return { success: false, result: `Unknown tool: ${name}` };
  }
}

// SSE streaming chat endpoint
app.post("/chat", async (c) => {
  const body = await c.req.json();
  const { messages: clientMessages, mode, projectId, chartId } = body;

  // Build system prompt
  let systemPrompt: string;
  let resolvedChartType = "flowchart";
  if (mode === "wizard") {
    systemPrompt = getWizardSystemPrompt();
  } else {
    // Gather chart context
    let chartContext: Record<string, unknown> | undefined;
    let nodeCount = 0;
    let edgeCount = 0;
    if (chartId) {
      const [chart] = await db.select().from(schema.charts).where(eq(schema.charts.id, chartId));
      if (chart) {
        chartContext = chart as unknown as Record<string, unknown>;
        resolvedChartType = chart.chartType || "flowchart";
        const nodes = await db.select().from(schema.nodes).where(eq(schema.nodes.chartId, chartId));
        const edges = await db.select().from(schema.edges).where(eq(schema.edges.chartId, chartId));
        nodeCount = nodes.length;
        edgeCount = edges.length;
      }
    }
    systemPrompt = getBuilderSystemPrompt({ chart: chartContext, nodeCount, edgeCount, chartType: resolvedChartType });
  }

  const toolDefs = getAllToolDefinitions(resolvedChartType);

  // Append external tool info to system prompt
  const externalTools = mcpClientManager.getAllToolDefinitions();
  if (externalTools.length > 0) {
    const toolList = externalTools
      .map((t) => `- ${t.function.name}: ${t.function.description}`)
      .join("\n");
    systemPrompt += `\n\nYou also have access to external tools from connected MCP servers:\n${toolList}\nUse these when the user's request involves external data or services.`;
  }

  // Build conversation
  type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  type ConvMsg = { role: string; content: string | ContentPart[]; tool_calls?: unknown[] };
  const conversation: ConvMsg[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of clientMessages) {
    const attachments = msg.attachments as Array<{ url: string; name: string; type: string }> | undefined;
    if (msg.role === "user" && attachments && attachments.length > 0) {
      // Build multimodal content array
      const parts: ContentPart[] = [];
      if (msg.content) {
        parts.push({ type: "text", text: msg.content });
      }
      for (const att of attachments) {
        if (att.type.startsWith("image/")) {
          // For images, convert to base64 data URL for vision models
          const { join } = await import("path");
          const projectRoot = import.meta.dir.replace(/\/server\/routes$/, "");
          const filepath = join(projectRoot, att.url.replace(/^\/api\//, ""));
          const file = Bun.file(filepath);
          if (await file.exists()) {
            const buf = await file.arrayBuffer();
            const b64 = Buffer.from(buf).toString("base64");
            parts.push({ type: "image_url", image_url: { url: `data:${att.type};base64,${b64}` } });
          }
        } else {
          // For text-based files, read content and include as text
          const { join } = await import("path");
          const projectRoot = import.meta.dir.replace(/\/server\/routes$/, "");
          const filepath = join(projectRoot, att.url.replace(/^\/api\//, ""));
          const file = Bun.file(filepath);
          if (await file.exists()) {
            const text = await file.text();
            parts.push({ type: "text", text: `[Attached file: ${att.name}]\n${text}` });
          }
        }
      }
      conversation.push({ role: msg.role, content: parts });
    } else if (msg.role === "system") {
      conversation.push({ role: "system", content: msg.content });
    } else {
      conversation.push({ role: msg.role, content: msg.content });
    }
  }

  // Context window management
  const contextWindow = await getContextWindowSize();
  const totalTokens = estimateTokens(conversation.map((m) => m.content).join("\n"));
  const threshold = Math.floor(contextWindow * 0.8);

  // SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        // Send context status
        send({ type: "context_status", used: totalTokens, total: contextWindow });

        // Auto-summarize if over threshold
        if (totalTokens > threshold && clientMessages.length > 4) {
          send({ type: "summarizing" });
          const summary = await summarizeConversation(
            conversation.map((m) => ({
              role: m.role as "system" | "user" | "assistant",
              content: typeof m.content === "string" ? m.content : m.content.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("\n"),
            }))
          );

          // Replace conversation with summary
          const latestUser = clientMessages[clientMessages.length - 1];
          conversation.length = 0;
          conversation.push(
            { role: "system", content: systemPrompt },
            { role: "system", content: `Previous conversation summary:\n${summary}` },
            { role: "user", content: latestUser.content }
          );

          send({ type: "context_summarized", summary });
        }

        // Agentic tool loop
        let maxTurns = 15;
        let consecutiveErrors = 0;
        const MAX_ERROR_RETRIES = 5;
        const assistantMsgId = newId();
        send({ type: "assistant_msg_id", id: assistantMsgId });

        while (maxTurns-- > 0) {
          const llmResponse = await streamChat(
            conversation as Parameters<typeof streamChat>[0],
            toolDefs
          );

          // Parse SSE from LLM
          let assistantContent = "";
          let assistantThinking = "";
          const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
          let finishReason = "";
          let insideThinkTag = false; // Track <think>...</think> blocks in content

          const reader = llmResponse.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const chunk = JSON.parse(data);
                const delta = chunk.choices?.[0]?.delta;
                const reason = chunk.choices?.[0]?.finish_reason;

                if (reason) finishReason = reason;

                if (delta?.content) {
                  // Parse <think>...</think> tags from content stream
                  let remaining = delta.content as string;
                  while (remaining.length > 0) {
                    if (insideThinkTag) {
                      const closeIdx = remaining.indexOf("</think>");
                      if (closeIdx === -1) {
                        // Still inside think block — all remaining is thinking
                        assistantThinking += remaining;
                        send({ type: "thinking", content: remaining });
                        remaining = "";
                      } else {
                        // Found closing tag — emit thinking up to it, then switch to content
                        const thinkPart = remaining.slice(0, closeIdx);
                        if (thinkPart) {
                          assistantThinking += thinkPart;
                          send({ type: "thinking", content: thinkPart });
                        }
                        insideThinkTag = false;
                        remaining = remaining.slice(closeIdx + "</think>".length);
                      }
                    } else {
                      const openIdx = remaining.indexOf("<think>");
                      if (openIdx === -1) {
                        // No think tag — all remaining is content
                        assistantContent += remaining;
                        send({ type: "content", content: remaining });
                        remaining = "";
                      } else {
                        // Found opening tag — emit content before it, then switch to thinking
                        const contentPart = remaining.slice(0, openIdx);
                        if (contentPart) {
                          assistantContent += contentPart;
                          send({ type: "content", content: contentPart });
                        }
                        insideThinkTag = true;
                        remaining = remaining.slice(openIdx + "<think>".length);
                      }
                    }
                  }
                }

                // Thinking via dedicated field (for models that support it natively)
                if (delta?.reasoning_content) {
                  assistantThinking += delta.reasoning_content;
                  send({ type: "thinking", content: delta.reasoning_content });
                }

                // Tool calls
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    while (toolCalls.length <= idx) {
                      toolCalls.push({ id: "", name: "", arguments: "" });
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
                  }
                }
              } catch {
                // Skip unparseable
              }
            }
          }

          // If no tool calls, we're done
          if (finishReason !== "tool_calls" || toolCalls.length === 0) {
            break;
          }

          // Execute tool calls
          const toolCallRequests = toolCalls.map((tc) => ({
            id: tc.id || newId(),
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));

          conversation.push({
            role: "assistant",
            content: assistantContent,
            tool_calls: toolCallRequests,
          });

          for (const tc of toolCallRequests) {
            let args: Record<string, unknown>;
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = {};
            }

            let result: { success: boolean; result: unknown };
            try {
              if (mcpClientManager.isExternalTool(tc.function.name)) {
                result = await mcpClientManager.callTool(tc.function.name, args);
              } else {
                result = await executeToolCall(tc.function.name, args, projectId, chartId);
              }
            } catch (toolErr) {
              // Catch unhandled errors (FK constraints, etc.) and return as failed tool result
              // so the LLM can see the error and retry
              const errMsg = (toolErr as Error).message || String(toolErr);
              const errStack = (toolErr as Error).stack || "";
              console.error(`[chat] Tool "${tc.function.name}" threw:`, errMsg);
              result = {
                success: false,
                result: `Error executing ${tc.function.name}: ${errMsg}${errStack ? `\n${errStack.split("\n").slice(0, 3).join("\n")}` : ""}`,
              };
            }

            send({
              type: "tool_call_result",
              toolCall: {
                id: tc.id,
                name: tc.function.name,
                arguments: args,
                result: result.result,
                success: result.success,
              },
            });

            conversation.push({
              role: "tool" as unknown as string,
              content: JSON.stringify(result.result),
              tool_call_id: tc.id,
            } as unknown as (typeof conversation)[0]);

            // Track consecutive error retries
            if (!result.success) {
              consecutiveErrors++;
            } else {
              consecutiveErrors = 0;
            }
          }

          // Stop if too many consecutive errors
          if (consecutiveErrors >= MAX_ERROR_RETRIES) {
            send({ type: "content", content: `\n\nI've encountered ${consecutiveErrors} consecutive errors and will stop retrying. Please check the chart state and try again.` });
            break;
          }

          // Reset content for next turn
          assistantContent = "";
          assistantThinking = "";
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

// Summarize endpoint
app.post("/chat/summarize", async (c) => {
  const body = await c.req.json();
  const { projectId } = body;

  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.projectId, projectId));

  const messages = rows.map((r) => ({
    role: r.role as "system" | "user" | "assistant",
    content: r.content,
  }));

  const summary = await summarizeConversation(messages);
  const messageId = newId();

  // Clear existing messages and save summary
  await db.delete(schema.chatMessages).where(eq(schema.chatMessages.projectId, projectId));
  await db.insert(schema.chatMessages).values({
    id: messageId,
    projectId,
    chartId: null,
    role: "system",
    content: summary,
    thinking: null,
    toolCalls: null,
    createdAt: new Date().toISOString(),
  });

  return c.json({ summary, messageId });
});

export default app;
