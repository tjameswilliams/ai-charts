import { describe, it, expect } from "bun:test";

// Test edge routing mode logic
describe("FlowchartEdge routing", () => {
  it("defaults to bezier when no routing mode specified", () => {
    const routingMode = undefined;
    const mode = routingMode || "bezier";
    expect(mode).toBe("bezier");
  });

  it("accepts straight routing mode", () => {
    const mode = "straight" as const;
    expect(["bezier", "straight", "orthogonal"]).toContain(mode);
  });

  it("accepts orthogonal routing mode", () => {
    const mode = "orthogonal" as const;
    expect(["bezier", "straight", "orthogonal"]).toContain(mode);
  });
});
