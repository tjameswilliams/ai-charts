import { describe, it, expect } from "bun:test";
import { mindmapLayout } from "../mindmapLayout";
import type { FlowNode, FlowEdge } from "../../types";

const makeNode = (id: string, type: string, label: string): FlowNode => ({
  id, chartId: "c1", type: type as any, label, description: "",
  positionX: 0, positionY: 0, styleJson: "{}", sourceRefId: null,
  confidence: 1, createdAt: "", updatedAt: "",
});

const makeEdge = (id: string, from: string, to: string): FlowEdge => ({
  id, chartId: "c1", fromNodeId: from, toNodeId: to, type: "branch",
  label: "", condition: "", sourceRefId: null, confidence: 1,
  createdAt: "", updatedAt: "",
});

describe("mindmapLayout", () => {
  it("places central at origin", () => {
    const nodes = [makeNode("c", "central_topic", "Main")];
    const result = mindmapLayout(nodes, []);
    const central = result.nodes.find((n) => n.id === "c");
    expect(central?.x).toBe(0);
    expect(central?.y).toBe(0);
  });

  it("distributes branches radially", () => {
    const nodes = [
      makeNode("c", "central_topic", "Main"),
      makeNode("b1", "main_branch", "Branch 1"),
      makeNode("b2", "main_branch", "Branch 2"),
      makeNode("b3", "main_branch", "Branch 3"),
    ];
    const edges = [
      makeEdge("e1", "c", "b1"),
      makeEdge("e2", "c", "b2"),
      makeEdge("e3", "c", "b3"),
    ];
    const result = mindmapLayout(nodes, edges);

    // All branches should be placed away from center
    for (const branch of result.nodes.filter((n) => n.id !== "c")) {
      const dist = Math.sqrt(branch.x ** 2 + branch.y ** 2);
      expect(dist).toBeGreaterThan(100);
    }
  });

  it("sub-branches extend from parents", () => {
    const nodes = [
      makeNode("c", "central_topic", "Main"),
      makeNode("b1", "main_branch", "Branch 1"),
      makeNode("s1", "sub_branch", "Sub 1"),
    ];
    const edges = [
      makeEdge("e1", "c", "b1"),
      makeEdge("e2", "b1", "s1"),
    ];
    const result = mindmapLayout(nodes, edges);
    const b1 = result.nodes.find((n) => n.id === "b1")!;
    const s1 = result.nodes.find((n) => n.id === "s1")!;

    // Sub-branch should be further from center than its parent
    const b1Dist = Math.sqrt(b1.x ** 2 + b1.y ** 2);
    const s1Dist = Math.sqrt(s1.x ** 2 + s1.y ** 2);
    expect(s1Dist).toBeGreaterThan(b1Dist);
  });
});
