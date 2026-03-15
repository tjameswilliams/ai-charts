import { db, schema } from "../../db/client";
import { eq } from "drizzle-orm";
import { validateChart } from "../validation";

export async function exportMarkdown(chartId: string): Promise<string> {
  const [chart] = await db
    .select()
    .from(schema.charts)
    .where(eq(schema.charts.id, chartId));
  if (!chart) return "Chart not found.";

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

  const issues = await validateChart(chartId);

  const lines: string[] = [];

  const chartType = chart.chartType || "flowchart";

  lines.push(`# ${chart.title}`);
  if (chart.description) lines.push(`\n${chart.description}`);
  if (chart.audience) lines.push(`\n**Audience:** ${chart.audience}`);
  lines.push(`\n**Type:** ${chartType} | **Status:** ${chart.status}`);
  lines.push(`\n**Nodes:** ${nodeRows.length} | **Edges:** ${edgeRows.length} | **Groups:** ${groupRows.length}`);

  if (chartType === "erd") {
    return exportMarkdownERD(lines, nodeRows, edgeRows);
  }

  if (chartType === "mindmap") {
    return exportMarkdownMindMap(lines, nodeRows, edgeRows);
  }

  if (chartType === "sequence") {
    return exportMarkdownSequence(lines, nodeRows, edgeRows);
  }

  if (chartType === "swimlane") {
    return exportMarkdownSwimlane(lines, nodeRows, edgeRows, groupRows, issues);
  }

  // Start nodes / entry points
  const startNodes = nodeRows.filter((n) => n.type === "start");
  if (startNodes.length > 0) {
    lines.push(`\n## Entry Points`);
    for (const n of startNodes) {
      lines.push(`- **${n.label}**${n.description ? `: ${n.description}` : ""}`);
    }
  }

  // Main flow
  lines.push(`\n## Process Flow`);
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  // Walk from each start node
  for (const start of startNodes) {
    lines.push(`\n### From: ${start.label}`);
    const visited = new Set<string>();
    const queue = [start.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = nodeMap.get(current);
      if (!node) continue;

      const outEdges = edgeRows.filter((e) => e.fromNodeId === current);
      if (outEdges.length === 0) continue;

      for (const edge of outEdges) {
        const target = nodeMap.get(edge.toNodeId);
        if (!target) continue;

        const edgeLabel = edge.label ? ` (${edge.label})` : "";
        const typeTag = node.type === "decision" ? " [Decision]" : "";
        lines.push(`- **${node.label}**${typeTag} → **${target.label}**${edgeLabel}`);
        queue.push(edge.toNodeId);
      }
    }
  }

  // Decision nodes
  const decisions = nodeRows.filter((n) => n.type === "decision");
  if (decisions.length > 0) {
    lines.push(`\n## Decisions`);
    for (const d of decisions) {
      const branches = edgeRows.filter((e) => e.fromNodeId === d.id);
      lines.push(`\n### ${d.label}`);
      if (d.description) lines.push(d.description);
      for (const b of branches) {
        const target = nodeMap.get(b.toNodeId);
        lines.push(`- ${b.label || b.type}: → ${target?.label || "Unknown"}`);
      }
    }
  }

  // Error/fallback paths
  const errorEdges = edgeRows.filter((e) => e.type === "error" || e.type === "fallback");
  if (errorEdges.length > 0) {
    lines.push(`\n## Error & Fallback Paths`);
    for (const e of errorEdges) {
      const from = nodeMap.get(e.fromNodeId);
      const to = nodeMap.get(e.toNodeId);
      lines.push(`- **${from?.label || "?"}** → **${to?.label || "?"}** [${e.type}]${e.label ? `: ${e.label}` : ""}`);
    }
  }

  // Groups
  if (groupRows.length > 0) {
    lines.push(`\n## Groups`);
    for (const g of groupRows) {
      lines.push(`- **${g.label}**${g.description ? `: ${g.description}` : ""}`);
    }
  }

  // Validation
  if (issues.length > 0) {
    lines.push(`\n## Validation Issues`);
    for (const issue of issues) {
      const icon = issue.type === "error" ? "X" : "!";
      lines.push(`- [${icon}] ${issue.message}`);
    }
  }

  // End nodes
  const endNodes = nodeRows.filter((n) => n.type === "end");
  if (endNodes.length > 0) {
    lines.push(`\n## End States`);
    for (const n of endNodes) {
      lines.push(`- **${n.label}**${n.description ? `: ${n.description}` : ""}`);
    }
  }

  return lines.join("\n");
}

function exportMarkdownERD(
  lines: string[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>
): string {
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  lines.push(`\n## Entities`);
  for (const node of nodeRows) {
    lines.push(`\n### ${node.label}`);
    if (node.description) {
      lines.push(`\n| Attribute | Type | Constraints |`);
      lines.push(`|-----------|------|-------------|`);
      for (const line of node.description.split("\n").filter(Boolean)) {
        const bracketMatch = line.match(/\[([^\]]+)\]/);
        const constraints = bracketMatch ? bracketMatch[1] : "";
        const withoutBrackets = line.replace(/\[.*?\]/, "").trim();
        const parts = withoutBrackets.split(":").map((p) => p.trim());
        lines.push(`| ${parts[0] || ""} | ${parts[1] || ""} | ${constraints} |`);
      }
    }
  }

  if (edgeRows.length > 0) {
    lines.push(`\n## Relationships`);
    for (const edge of edgeRows) {
      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      const relType = edge.type || "one_to_many";
      const label = edge.label ? ` (${edge.label})` : "";
      lines.push(`- **${from?.label || "?"}** ${relType.replace(/_/g, " ")} **${to?.label || "?"}**${label}`);
    }
  }

  return lines.join("\n");
}

function exportMarkdownSwimlane(
  lines: string[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>,
  groupRows: Array<{ id: string; label: string; description: string | null }>,
  issues: Array<{ type: string; message: string }>
): string {
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  for (const group of groupRows) {
    lines.push(`\n## Lane: ${group.label}`);
    if (group.description) lines.push(group.description);
    // Note: we can't directly associate nodes to groups here without nodeGroups
    // but the format shows the lane structure
  }

  if (nodeRows.length > 0) {
    lines.push(`\n## Activities`);
    for (const node of nodeRows) {
      const typeTag = node.type ? ` [${node.type}]` : "";
      lines.push(`- **${node.label}**${typeTag}${node.description ? `: ${node.description}` : ""}`);
    }
  }

  if (edgeRows.length > 0) {
    lines.push(`\n## Flow`);
    for (const edge of edgeRows) {
      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      const label = edge.label ? ` (${edge.label})` : "";
      lines.push(`- **${from?.label || "?"}** → **${to?.label || "?"}**${label}`);
    }
  }

  if (issues.length > 0) {
    lines.push(`\n## Validation Issues`);
    for (const issue of issues) {
      const icon = issue.type === "error" ? "X" : "!";
      lines.push(`- [${icon}] ${issue.message}`);
    }
  }

  return lines.join("\n");
}

function exportMarkdownMindMap(
  lines: string[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null }>
): string {
  const central = nodeRows.find((n) => n.type === "central_topic");
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  // Build tree
  const children = new Map<string, string[]>();
  for (const n of nodeRows) children.set(n.id, []);
  for (const edge of edgeRows) {
    children.get(edge.fromNodeId)?.push(edge.toNodeId);
  }

  if (central) {
    lines.push(`\n## Central Topic: ${central.label}`);
    if (central.description) lines.push(central.description);

    function addBranches(parentId: string, depth: number) {
      const kids = children.get(parentId) || [];
      for (const kidId of kids) {
        const node = nodeMap.get(kidId);
        if (!node) continue;
        const indent = "  ".repeat(depth);
        if (depth === 0) {
          lines.push(`\n### ${node.label}`);
        } else {
          lines.push(`${indent}- **${node.label}**${node.description ? `: ${node.description}` : ""}`);
        }
        addBranches(kidId, depth + 1);
      }
    }

    addBranches(central.id, 0);
  } else {
    lines.push(`\n## Topics`);
    for (const node of nodeRows) {
      lines.push(`- **${node.label}**${node.description ? `: ${node.description}` : ""}`);
    }
  }

  return lines.join("\n");
}

function exportMarkdownSequence(
  lines: string[],
  nodeRows: Array<{ id: string; type: string | null; label: string; description: string | null }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string | null; label: string | null; createdAt: string }>
): string {
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));

  const actors = nodeRows.filter((n) => n.type === "actor");
  const participants = nodeRows.filter((n) => n.type === "participant");

  if (actors.length > 0) {
    lines.push(`\n## Actors`);
    for (const a of actors) {
      lines.push(`- **${a.label}**${a.description ? `: ${a.description}` : ""}`);
    }
  }

  if (participants.length > 0) {
    lines.push(`\n## Participants`);
    for (const p of participants) {
      lines.push(`- **${p.label}**${p.description ? `: ${p.description}` : ""}`);
    }
  }

  if (edgeRows.length > 0) {
    lines.push(`\n## Messages`);
    const sorted = [...edgeRows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let step = 1;
    for (const edge of sorted) {
      const from = nodeMap.get(edge.fromNodeId);
      const to = nodeMap.get(edge.toNodeId);
      if (!from || !to) continue;
      const typeLabel = edge.type ? ` [${edge.type.replace(/_/g, " ")}]` : "";
      lines.push(`${step}. **${from.label}** → **${to.label}**${typeLabel}${edge.label ? `: ${edge.label}` : ""}`);
      step++;
    }
  }

  return lines.join("\n");
}
