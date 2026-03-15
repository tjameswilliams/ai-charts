import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";

const nodeShapes: Record<string, [string, string]> = {
  start: ["([", "])"],
  end: ["([", "])"],
  process: ["[", "]"],
  decision: ["{", "}"],
  input_output: ["[/", "/]"],
  data_store: ["[(", ")]"],
  external_system: ["[[", "]]"],
  note: ["(", ")"],
  subflow_ref: ["[[", "]]"],
  entity: ["[", "]"],
  action: ["[", "]"],
  central_topic: ["((", "))"],
  main_branch: ["(", ")"],
  sub_branch: ["[", "]"],
  leaf: ["[", "]"],
  actor: ["[", "]"],
  participant: ["[", "]"],
  lifeline_activation: ["[", "]"],
};

function escapeLabel(label: string): string {
  return label.replace(/"/g, "&quot;").replace(/\n/g, "<br/>");
}

export async function exportMermaid(chartId: string): Promise<string> {
  const [chart] = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.id, chartId));

  const nodeRows = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.chartId, chartId));

  const edgeRows = await db
    .select()
    .from(schema.edges)
    .where(eq(schema.edges.chartId, chartId));

  const groupRows = await db
    .select()
    .from(schema.groups)
    .where(eq(schema.groups.chartId, chartId));

  const nodeGroupRows = await db.select().from(schema.nodeGroups);

  const chartType = chart?.chartType || "flowchart";

  if (chartType === "sequence") {
    return exportMermaidSequence(nodeRows, edgeRows);
  }

  if (chartType === "erd") {
    return exportMermaidERD(nodeRows, edgeRows);
  }

  if (chartType === "mindmap") {
    return exportMermaidMindMap(nodeRows, edgeRows);
  }

  // Build group membership
  const nodeToGroup = new Map<string, string>();
  for (const ng of nodeGroupRows) {
    const group = groupRows.find((g) => g.id === ng.groupId);
    if (group && group.chartId === chartId) {
      nodeToGroup.set(ng.nodeId, ng.groupId);
    }
  }

  // Build short IDs for readability
  const shortIds = new Map<string, string>();
  nodeRows.forEach((n, i) => shortIds.set(n.id, `N${i}`));

  const lines: string[] = [];
  lines.push(`flowchart TD`);

  // Render grouped nodes in subgraphs (works for both flowchart and swimlane)
  const groupedNodes = new Set<string>();
  for (const group of groupRows) {
    const members = nodeRows.filter((n) => nodeToGroup.get(n.id) === group.id);
    if (members.length === 0) continue;

    lines.push(`  subgraph ${escapeLabel(group.label)}`);
    for (const node of members) {
      const sid = shortIds.get(node.id)!;
      const [open, close] = nodeShapes[node.type || "process"] || ["[", "]"];
      lines.push(`    ${sid}${open}"${escapeLabel(node.label)}"${close}`);
      groupedNodes.add(node.id);
    }
    lines.push(`  end`);
  }

  // Render ungrouped nodes
  for (const node of nodeRows) {
    if (groupedNodes.has(node.id)) continue;
    const sid = shortIds.get(node.id)!;
    const [open, close] = nodeShapes[node.type || "process"] || ["[", "]"];
    lines.push(`  ${sid}${open}"${escapeLabel(node.label)}"${close}`);
  }

  // Render edges
  for (const edge of edgeRows) {
    const from = shortIds.get(edge.fromNodeId);
    const to = shortIds.get(edge.toNodeId);
    if (!from || !to) continue;

    let arrow = "-->";
    if (edge.type === "conditional") arrow = "-.->";
    if (edge.type === "error") arrow = "==>";
    if (edge.type === "async") arrow = "-.->";
    if (edge.type === "fallback") arrow = "-.->";

    if (edge.label) {
      lines.push(`  ${from} ${arrow}|"${escapeLabel(edge.label)}"|${to}`);
    } else {
      lines.push(`  ${from} ${arrow} ${to}`);
    }
  }

  // Style start/end nodes
  for (const node of nodeRows) {
    const sid = shortIds.get(node.id)!;
    if (node.type === "start") {
      lines.push(`  style ${sid} fill:#059669,stroke:#047857,color:#fff`);
    } else if (node.type === "end") {
      lines.push(`  style ${sid} fill:#dc2626,stroke:#b91c1c,color:#fff`);
    }
  }

  return lines.join("\n");
}

function exportMermaidERD(
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>
): string {
  const lines: string[] = ["erDiagram"];
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  // Entity definitions with attributes
  for (const node of nodeRows) {
    const entityName = node.label.replace(/\s+/g, "_");
    if (node.description) {
      lines.push(`  ${entityName} {`);
      for (const line of node.description.split("\n").filter(Boolean)) {
        const bracketMatch = line.match(/\[([^\]]+)\]/);
        const constraints = bracketMatch ? bracketMatch[1].split("|").map((c) => c.trim()) : [];
        const withoutBrackets = line.replace(/\[.*?\]/, "").trim();
        const parts = withoutBrackets.split(":").map((p) => p.trim());
        const name = parts[0] || "field";
        const type = parts[1] || "string";
        const pk = constraints.some((c) => c.toUpperCase() === "PK") ? "PK" : "";
        const fk = constraints.some((c) => c.toUpperCase() === "FK") ? "FK" : "";
        const comment = pk || fk ? ` "${pk}${pk && fk ? "," : ""}${fk}"` : "";
        lines.push(`    ${type} ${name}${comment}`);
      }
      lines.push(`  }`);
    } else {
      lines.push(`  ${entityName} {`);
      lines.push(`  }`);
    }
  }

  // Relationships
  for (const edge of edgeRows) {
    const from = nodeMap.get(edge.fromNodeId);
    const to = nodeMap.get(edge.toNodeId);
    if (!from || !to) continue;
    const fromName = from.label.replace(/\s+/g, "_");
    const toName = to.label.replace(/\s+/g, "_");
    let rel = "||--o{";
    if (edge.type === "one_to_one") rel = "||--||";
    else if (edge.type === "many_to_many") rel = "}o--o{";
    const label = edge.label ? ` : "${escapeLabel(edge.label)}"` : " : relates";
    lines.push(`  ${fromName} ${rel} ${toName}${label}`);
  }

  return lines.join("\n");
}

function exportMermaidMindMap(
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>
): string {
  const lines: string[] = ["mindmap"];

  // Find central topic
  const central = nodeRows.find((n) => n.type === "central_topic") || nodeRows[0];
  if (!central) return "mindmap\n  root(Empty)";

  // Build tree structure
  const children = new Map<string, string[]>();
  for (const n of nodeRows) children.set(n.id, []);
  for (const edge of edgeRows) {
    children.get(edge.fromNodeId)?.push(edge.toNodeId);
  }

  lines.push(`  root(${escapeLabel(central.label)})`);

  function addChildren(parentId: string, indent: number) {
    const kids = children.get(parentId) || [];
    for (const kidId of kids) {
      const node = nodeRows.find((n) => n.id === kidId);
      if (!node) continue;
      const pad = " ".repeat(indent);
      lines.push(`${pad}${escapeLabel(node.label)}`);
      addChildren(kidId, indent + 2);
    }
  }

  addChildren(central.id, 4);

  return lines.join("\n");
}

function exportMermaidSequence(
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null; createdAt: string }>
): string {
  const lines: string[] = ["sequenceDiagram"];
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  // Declare participants
  for (const node of nodeRows) {
    if (node.type === "actor") {
      lines.push(`  actor ${escapeLabel(node.label)}`);
    } else if (node.type === "participant") {
      lines.push(`  participant ${escapeLabel(node.label)}`);
    }
  }

  // Sort edges by created_at
  const sorted = [...edgeRows].sort((a, b) => {
    return a.createdAt.localeCompare(b.createdAt);
  });

  // Messages
  for (const edge of sorted) {
    const from = nodeMap.get(edge.fromNodeId);
    const to = nodeMap.get(edge.toNodeId);
    if (!from || !to) continue;
    // Skip non-actor/participant nodes
    if (from.type !== "actor" && from.type !== "participant") continue;
    if (to.type !== "actor" && to.type !== "participant") continue;

    let arrow = "->>";
    if (edge.type === "sync_message") arrow = "->>";
    else if (edge.type === "async_message") arrow = "-->>";
    else if (edge.type === "return_message") arrow = "-->>";
    else if (edge.type === "self_message") arrow = "->>";

    const label = edge.label || "";
    lines.push(`  ${escapeLabel(from.label)}${arrow}${escapeLabel(to.label)}: ${label}`);
  }

  return lines.join("\n");
}
