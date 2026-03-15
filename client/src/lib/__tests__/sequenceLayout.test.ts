import { describe, it, expect } from "bun:test";
import { sequenceLayout } from "../sequenceLayout";
import type { FlowNode, FlowEdge } from "../../types";

const makeNode = (id: string, type: string, label: string): FlowNode => ({
  id, chartId: "c1", type: type as any, label, description: "",
  positionX: 0, positionY: 0, styleJson: "{}", sourceRefId: null,
  confidence: 1, createdAt: "", updatedAt: "",
});

const makeEdge = (id: string, from: string, to: string, type = "sync_message"): FlowEdge => ({
  id, chartId: "c1", fromNodeId: from, toNodeId: to, type: type as any,
  label: "", condition: "", sourceRefId: null, confidence: 1,
  createdAt: "", updatedAt: "",
});

describe("sequenceLayout", () => {
  it("places actors in a horizontal row", () => {
    const nodes = [
      makeNode("a1", "actor", "User"),
      makeNode("a2", "participant", "Server"),
      makeNode("a3", "participant", "Database"),
    ];
    const result = sequenceLayout(nodes, []);
    const ys = result.nodes.map((n) => n.y);
    // All actors at same y
    expect(new Set(ys).size).toBe(1);
    // Increasing x positions
    const xs = result.nodes.map((n) => n.x);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeGreaterThan(xs[1]);
  });

  it("handles self-messages", () => {
    const nodes = [
      makeNode("a1", "actor", "User"),
    ];
    const edges = [
      makeEdge("e1", "a1", "a1", "self_message"),
    ];
    const result = sequenceLayout(nodes, edges);
    expect(result.nodes).toHaveLength(1);
  });

  it("handles empty diagram", () => {
    const result = sequenceLayout([], []);
    expect(result.nodes).toHaveLength(0);
  });
});
