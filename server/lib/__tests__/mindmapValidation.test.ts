import { describe, it, expect } from "bun:test";

// Test the validation logic directly
function validateMindMap(
  nodeRows: Array<{ id: string; type: string; label: string }>,
  edgeRows: Array<{ fromNodeId: string; toNodeId: string }>
) {
  const issues: Array<{ type: string; code: string; message: string }> = [];

  const centralTopics = nodeRows.filter((n) => n.type === "central_topic");
  if (centralTopics.length === 0) {
    issues.push({ type: "error", code: "no_central_topic", message: "Mind map must have a central topic node" });
  }
  if (centralTopics.length > 1) {
    issues.push({ type: "warning", code: "multiple_central", message: "Mind map has multiple central topics" });
  }

  const connected = new Set<string>();
  for (const edge of edgeRows) {
    connected.add(edge.fromNodeId);
    connected.add(edge.toNodeId);
  }
  for (const node of nodeRows) {
    if (!connected.has(node.id) && nodeRows.length > 1) {
      issues.push({ type: "warning", code: "disconnected", message: `"${node.label}" is not connected` });
    }
  }

  return issues;
}

describe("mindmap validation", () => {
  it("errors when no central_topic", () => {
    const issues = validateMindMap(
      [{ id: "1", type: "main_branch", label: "Branch" }],
      []
    );
    expect(issues.some((i) => i.code === "no_central_topic")).toBe(true);
  });

  it("warns on disconnected branches", () => {
    const issues = validateMindMap(
      [
        { id: "1", type: "central_topic", label: "Main" },
        { id: "2", type: "main_branch", label: "Disconnected" },
      ],
      []
    );
    expect(issues.some((i) => i.code === "disconnected")).toBe(true);
  });

  it("passes with valid mind map", () => {
    const issues = validateMindMap(
      [
        { id: "1", type: "central_topic", label: "Main" },
        { id: "2", type: "main_branch", label: "Branch" },
      ],
      [{ fromNodeId: "1", toNodeId: "2" }]
    );
    expect(issues.filter((i) => i.type === "error")).toHaveLength(0);
  });
});
