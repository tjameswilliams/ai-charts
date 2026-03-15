import { describe, it, expect } from "bun:test";

function validateSequence(
  nodeRows: Array<{ id: string; type: string; label: string }>,
  edgeRows: Array<{ id: string; fromNodeId: string; toNodeId: string; type: string; label: string }>
) {
  const issues: Array<{ type: string; code: string; message: string }> = [];
  const actors = nodeRows.filter((n) => n.type === "actor" || n.type === "participant");
  if (actors.length === 0) {
    issues.push({ type: "error", code: "no_actors", message: "Sequence diagram must have at least one actor or participant" });
  }
  const actorIds = new Set(actors.map((a) => a.id));
  for (const edge of edgeRows) {
    if (!actorIds.has(edge.fromNodeId) && !actorIds.has(edge.toNodeId)) {
      issues.push({ type: "warning", code: "invalid_message", message: `Message doesn't connect to any actor/participant` });
    }
  }
  return issues;
}

describe("sequence validation", () => {
  it("errors when no actors/participants", () => {
    const issues = validateSequence([], []);
    expect(issues.some((i) => i.code === "no_actors")).toBe(true);
  });

  it("warns on messages to invalid actors", () => {
    const issues = validateSequence(
      [{ id: "a1", type: "actor", label: "User" }],
      [{ id: "e1", fromNodeId: "x", toNodeId: "y", type: "sync_message", label: "" }]
    );
    expect(issues.some((i) => i.code === "invalid_message")).toBe(true);
  });

  it("passes with valid sequence", () => {
    const issues = validateSequence(
      [
        { id: "a1", type: "actor", label: "User" },
        { id: "a2", type: "participant", label: "Server" },
      ],
      [{ id: "e1", fromNodeId: "a1", toNodeId: "a2", type: "sync_message", label: "Request" }]
    );
    expect(issues.filter((i) => i.type === "error")).toHaveLength(0);
  });
});
