import { db, schema } from "../db/client";
import { eq } from "drizzle-orm";

export interface ValidationIssue {
  type: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export async function validateChart(chartId: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const [chart] = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.id, chartId));

  const chartType = chart?.chartType || "flowchart";

  const nodeRows = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.chartId, chartId));
  const edgeRows = await db
    .select()
    .from(schema.edges)
    .where(eq(schema.edges.chartId, chartId));

  if (nodeRows.length === 0) {
    issues.push({ type: "warning", code: "empty_chart", message: "Chart has no nodes" });
    return issues;
  }

  const nodeIds = new Set(nodeRows.map((n) => n.id));
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  // Sequence diagram validation
  if (chartType === "sequence") {
    return validateSequence(issues, nodeRows, edgeRows, nodeMap);
  }

  // Mind map-specific validation
  if (chartType === "mindmap") {
    return validateMindMap(issues, nodeRows, edgeRows, nodeMap);
  }

  // ERD-specific validation
  if (chartType === "erd") {
    return validateERD(issues, nodeRows, edgeRows, nodeMap);
  }

  // Swimlane-specific validation
  if (chartType === "swimlane") {
    return validateSwimlane(issues, nodeRows, edgeRows, nodeMap, chartId);
  }

  // Check for start/end nodes
  const startNodes = nodeRows.filter((n) => n.type === "start");
  const endNodes = nodeRows.filter((n) => n.type === "end");

  if (startNodes.length === 0) {
    issues.push({ type: "warning", code: "no_start", message: "No start node found" });
  }
  if (startNodes.length > 1) {
    for (const n of startNodes) {
      issues.push({
        type: "warning",
        code: "multiple_starts",
        message: `Multiple start nodes: "${n.label}"`,
        nodeId: n.id,
      });
    }
  }
  if (endNodes.length === 0) {
    issues.push({ type: "warning", code: "no_end", message: "No end node found" });
  }

  // Build adjacency
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const edge of edgeRows) {
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
  }

  // Empty labels
  for (const node of nodeRows) {
    if (!node.label.trim()) {
      issues.push({
        type: "warning",
        code: "empty_label",
        message: `Node has empty label`,
        nodeId: node.id,
      });
    }
  }

  // Disconnected nodes (no edges at all)
  for (const node of nodeRows) {
    if (node.type === "note") continue;
    const outs = outgoing.get(node.id) || [];
    const ins = incoming.get(node.id) || [];
    if (outs.length === 0 && ins.length === 0) {
      issues.push({
        type: "warning",
        code: "disconnected",
        message: `"${node.label}" has no connections`,
        nodeId: node.id,
      });
    }
  }

  // Dead ends (non-end nodes with no outgoing edges)
  for (const node of nodeRows) {
    if (node.type === "end" || node.type === "note") continue;
    const outs = outgoing.get(node.id) || [];
    if (outs.length === 0 && (incoming.get(node.id) || []).length > 0) {
      issues.push({
        type: "warning",
        code: "dead_end",
        message: `"${node.label}" is a dead end (no outgoing edges)`,
        nodeId: node.id,
      });
    }
  }

  // Unreachable nodes (no incoming, not start)
  for (const node of nodeRows) {
    if (node.type === "start" || node.type === "note") continue;
    const ins = incoming.get(node.id) || [];
    if (ins.length === 0 && (outgoing.get(node.id) || []).length > 0) {
      issues.push({
        type: "warning",
        code: "unreachable",
        message: `"${node.label}" has no incoming edges`,
        nodeId: node.id,
      });
    }
  }

  // Incomplete decision branches
  for (const node of nodeRows) {
    if (node.type !== "decision") continue;
    const outs = outgoing.get(node.id) || [];
    if (outs.length < 2) {
      issues.push({
        type: "warning",
        code: "incomplete_decision",
        message: `Decision "${node.label}" has fewer than 2 outgoing paths`,
        nodeId: node.id,
      });
    }
  }

  // Low confidence flags
  for (const node of nodeRows) {
    if (node.confidence !== null && node.confidence < 0.7) {
      issues.push({
        type: "warning",
        code: "low_confidence",
        message: `"${node.label}" has low confidence (${node.confidence})`,
        nodeId: node.id,
      });
    }
  }

  // Cycle detection (using DFS from start nodes)
  if (startNodes.length > 0) {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    let hasCycle = false;

    function dfs(nodeId: string) {
      if (hasCycle) return;
      if (inStack.has(nodeId)) {
        hasCycle = true;
        return;
      }
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const next of outgoing.get(nodeId) || []) {
        dfs(next);
      }
      inStack.delete(nodeId);
    }

    for (const start of startNodes) {
      dfs(start.id);
    }

    if (hasCycle) {
      issues.push({
        type: "warning",
        code: "cycle_detected",
        message: "Chart contains a cycle (loop)",
      });
    }
  }

  return issues;
}

function validateSequence(
  issues: ValidationIssue[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null; confidence: number | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>,
  nodeMap: Map<string, typeof nodeRows[0]>
): ValidationIssue[] {
  const actors = nodeRows.filter((n) => n.type === "actor" || n.type === "participant");
  if (actors.length === 0) {
    issues.push({ type: "error", code: "no_actors", message: "Sequence diagram must have at least one actor or participant" });
  }

  // Check messages connect valid actors/participants
  const actorIds = new Set(actors.map((a) => a.id));
  for (const edge of edgeRows) {
    if (!actorIds.has(edge.fromNodeId) && !actorIds.has(edge.toNodeId)) {
      issues.push({
        type: "warning",
        code: "invalid_message",
        message: `Message "${edge.label || "unnamed"}" doesn't connect to any actor/participant`,
        edgeId: edge.id,
      });
    }
  }

  // Empty labels
  for (const node of nodeRows) {
    if (!node.label.trim()) {
      issues.push({ type: "warning", code: "empty_label", message: "Node has empty label", nodeId: node.id });
    }
  }

  return issues;
}

function validateERD(
  issues: ValidationIssue[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null; confidence: number | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>,
  nodeMap: Map<string, typeof nodeRows[0]>
): ValidationIssue[] {
  // Empty labels
  for (const node of nodeRows) {
    if (!node.label.trim()) {
      issues.push({ type: "warning", code: "empty_label", message: "Entity has empty label", nodeId: node.id });
    }
  }

  // Entities with no attributes
  for (const node of nodeRows) {
    if (!node.description?.trim()) {
      issues.push({ type: "warning", code: "no_attributes", message: `Entity "${node.label}" has no attributes`, nodeId: node.id });
    }
  }

  // Entities with no relationships
  const connectedIds = new Set<string>();
  for (const edge of edgeRows) {
    connectedIds.add(edge.fromNodeId);
    connectedIds.add(edge.toNodeId);
  }
  for (const node of nodeRows) {
    if (!connectedIds.has(node.id)) {
      issues.push({ type: "warning", code: "no_relationships", message: `Entity "${node.label}" has no relationships`, nodeId: node.id });
    }
  }

  // Missing relationship labels
  for (const edge of edgeRows) {
    if (!edge.label?.trim()) {
      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      issues.push({ type: "warning", code: "missing_rel_label", message: `Relationship between "${from?.label || "?"}" and "${to?.label || "?"}" has no label`, edgeId: edge.id });
    }
  }

  return issues;
}

function validateMindMap(
  issues: ValidationIssue[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null; confidence: number | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>,
  nodeMap: Map<string, typeof nodeRows[0]>
): ValidationIssue[] {
  // Must have central_topic
  const centralTopics = nodeRows.filter((n) => n.type === "central_topic");
  if (centralTopics.length === 0) {
    issues.push({ type: "error", code: "no_central_topic", message: "Mind map must have a central topic node" });
  }
  if (centralTopics.length > 1) {
    issues.push({ type: "warning", code: "multiple_central", message: "Mind map has multiple central topics" });
  }

  // Check for disconnected nodes
  const connected = new Set<string>();
  for (const edge of edgeRows) {
    connected.add(edge.fromNodeId);
    connected.add(edge.toNodeId);
  }
  for (const node of nodeRows) {
    if (!connected.has(node.id) && nodeRows.length > 1) {
      issues.push({ type: "warning", code: "disconnected", message: `"${node.label}" is not connected to the mind map`, nodeId: node.id });
    }
  }

  return issues;
}

function validateSwimlane(
  issues: ValidationIssue[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null; confidence: number | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>,
  nodeMap: Map<string, typeof nodeRows[0]>,
  chartId: string
): ValidationIssue[] {
  const nodeIds = new Set(nodeRows.map((n) => n.id));

  // Empty labels
  for (const node of nodeRows) {
    if (!node.label.trim()) {
      issues.push({ type: "warning", code: "empty_label", message: "Node has empty label", nodeId: node.id });
    }
  }

  // Build adjacency for connectivity checks
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const id of nodeIds) {
    outgoing.set(id, []);
    incoming.set(id, []);
  }
  for (const edge of edgeRows) {
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
    incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
  }

  // Disconnected nodes
  for (const node of nodeRows) {
    if (node.type === "note") continue;
    const outs = outgoing.get(node.id) || [];
    const ins = incoming.get(node.id) || [];
    if (outs.length === 0 && ins.length === 0) {
      issues.push({ type: "warning", code: "disconnected", message: `"${node.label}" has no connections`, nodeId: node.id });
    }
  }

  // Start/end checks
  const startNodes = nodeRows.filter((n) => n.type === "start");
  const endNodes = nodeRows.filter((n) => n.type === "end");
  if (startNodes.length === 0) {
    issues.push({ type: "warning", code: "no_start", message: "No start node found" });
  }
  if (endNodes.length === 0) {
    issues.push({ type: "warning", code: "no_end", message: "No end node found" });
  }

  return issues;
}
