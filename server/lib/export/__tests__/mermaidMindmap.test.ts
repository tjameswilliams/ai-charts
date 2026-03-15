import { describe, it, expect } from "bun:test";

// Test the mermaid mindmap export logic directly
function exportMermaidMindMap(
  nodeRows: Array<{ id: string; type: string; label: string }>,
  edgeRows: Array<{ fromNodeId: string; toNodeId: string }>
): string {
  const lines: string[] = ["mindmap"];
  const central = nodeRows.find((n) => n.type === "central_topic") || nodeRows[0];
  if (!central) return "mindmap\n  root(Empty)";

  const children = new Map<string, string[]>();
  for (const n of nodeRows) children.set(n.id, []);
  for (const edge of edgeRows) {
    children.get(edge.fromNodeId)?.push(edge.toNodeId);
  }

  lines.push(`  root(${central.label})`);

  function addChildren(parentId: string, indent: number) {
    const kids = children.get(parentId) || [];
    for (const kidId of kids) {
      const node = nodeRows.find((n) => n.id === kidId);
      if (!node) continue;
      lines.push(`${" ".repeat(indent)}${node.label}`);
      addChildren(kidId, indent + 2);
    }
  }
  addChildren(central.id, 4);

  return lines.join("\n");
}

describe("mermaid mindmap export", () => {
  it("outputs correct mindmap syntax", () => {
    const result = exportMermaidMindMap(
      [
        { id: "1", type: "central_topic", label: "AI" },
        { id: "2", type: "main_branch", label: "ML" },
        { id: "3", type: "sub_branch", label: "Deep Learning" },
      ],
      [
        { fromNodeId: "1", toNodeId: "2" },
        { fromNodeId: "2", toNodeId: "3" },
      ]
    );
    expect(result).toContain("mindmap");
    expect(result).toContain("root(AI)");
    expect(result).toContain("ML");
    expect(result).toContain("Deep Learning");
  });

  it("handles empty mind map", () => {
    const result = exportMermaidMindMap([], []);
    expect(result).toContain("mindmap");
    expect(result).toContain("Empty");
  });
});
