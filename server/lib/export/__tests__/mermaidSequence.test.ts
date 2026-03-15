import { describe, it, expect } from "bun:test";

function exportMermaidSequence(
  nodeRows: Array<{ id: string; type: string; label: string }>,
  edgeRows: Array<{ fromNodeId: string; toNodeId: string; type: string; label: string; createdAt: string }>
): string {
  const lines: string[] = ["sequenceDiagram"];
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));
  for (const node of nodeRows) {
    if (node.type === "actor") lines.push(`  actor ${node.label}`);
    else if (node.type === "participant") lines.push(`  participant ${node.label}`);
  }
  const sorted = [...edgeRows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const edge of sorted) {
    const from = nodeMap.get(edge.fromNodeId);
    const to = nodeMap.get(edge.toNodeId);
    if (!from || !to) continue;
    let arrow = "->>";
    if (edge.type === "async_message") arrow = "-->>";
    else if (edge.type === "return_message") arrow = "-->>";
    lines.push(`  ${from.label}${arrow}${to.label}: ${edge.label}`);
  }
  return lines.join("\n");
}

describe("mermaid sequence export", () => {
  it("outputs correct sequenceDiagram syntax", () => {
    const result = exportMermaidSequence(
      [
        { id: "1", type: "actor", label: "User" },
        { id: "2", type: "participant", label: "API" },
      ],
      [{ fromNodeId: "1", toNodeId: "2", type: "sync_message", label: "GET /data", createdAt: "2024-01-01" }]
    );
    expect(result).toContain("sequenceDiagram");
    expect(result).toContain("actor User");
    expect(result).toContain("participant API");
    expect(result).toContain("User->>API: GET /data");
  });

  it("handles async messages", () => {
    const result = exportMermaidSequence(
      [
        { id: "1", type: "actor", label: "Client" },
        { id: "2", type: "participant", label: "Queue" },
      ],
      [{ fromNodeId: "1", toNodeId: "2", type: "async_message", label: "Enqueue", createdAt: "2024-01-01" }]
    );
    expect(result).toContain("-->>");
  });
});
