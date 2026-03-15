import { describe, test, expect } from "bun:test";
import { getChartTypeConfig, type ChartTypeConfig } from "../chartTypeConfig";

describe("getChartTypeConfig", () => {
  test("returns flowchart config", () => {
    const cfg = getChartTypeConfig("flowchart");
    expect(cfg.defaultNodeType).toBe("process");
    expect(cfg.defaultEdgeType).toBe("default");
    expect(cfg.supportsGroups).toBe(true);
    expect(cfg.groupLabel).toBe("Group");
  });

  test("flowchart has expected node types", () => {
    const cfg = getChartTypeConfig("flowchart");
    const types = cfg.nodeTypes.map((n) => n.type);
    expect(types).toContain("start");
    expect(types).toContain("end");
    expect(types).toContain("process");
    expect(types).toContain("decision");
    expect(types).toContain("input_output");
    expect(types).toContain("data_store");
    expect(types).toContain("note");
  });

  test("flowchart has expected edge types", () => {
    const cfg = getChartTypeConfig("flowchart");
    const types = cfg.edgeTypes.map((e) => e.type);
    expect(types).toContain("default");
    expect(types).toContain("conditional");
    expect(types).toContain("error");
    expect(types).toContain("async");
    expect(types).toContain("fallback");
  });

  test("returns ERD config", () => {
    const cfg = getChartTypeConfig("erd");
    expect(cfg.defaultNodeType).toBe("entity");
    expect(cfg.defaultEdgeType).toBe("one_to_many");
    expect(cfg.supportsGroups).toBe(false);
    expect(cfg.nodeTypes.length).toBeGreaterThanOrEqual(1);
    expect(cfg.nodeTypes[0].type).toBe("entity");
  });

  test("ERD has relationship edge types", () => {
    const cfg = getChartTypeConfig("erd");
    const types = cfg.edgeTypes.map((e) => e.type);
    expect(types).toContain("one_to_one");
    expect(types).toContain("one_to_many");
    expect(types).toContain("many_to_many");
  });

  test("returns swimlane config", () => {
    const cfg = getChartTypeConfig("swimlane");
    expect(cfg.defaultNodeType).toBe("action");
    expect(cfg.defaultEdgeType).toBe("default");
    expect(cfg.supportsGroups).toBe(true);
    expect(cfg.groupLabel).toBe("Lane");
  });

  test("swimlane has action node type", () => {
    const cfg = getChartTypeConfig("swimlane");
    const types = cfg.nodeTypes.map((n) => n.type);
    expect(types).toContain("action");
    expect(types).toContain("start");
    expect(types).toContain("end");
    expect(types).toContain("decision");
  });

  test("falls back to flowchart for unknown type", () => {
    // @ts-expect-error testing unknown type
    const cfg = getChartTypeConfig("unknown");
    expect(cfg.defaultNodeType).toBe("process");
    expect(cfg.defaultEdgeType).toBe("default");
  });

  test("all configs have non-empty nodeTypes and edgeTypes", () => {
    for (const type of ["flowchart", "erd", "swimlane"] as const) {
      const cfg = getChartTypeConfig(type);
      expect(cfg.nodeTypes.length).toBeGreaterThan(0);
      expect(cfg.edgeTypes.length).toBeGreaterThan(0);
    }
  });

  test("all node types have label and desc", () => {
    for (const type of ["flowchart", "erd", "swimlane"] as const) {
      const cfg = getChartTypeConfig(type);
      for (const nt of cfg.nodeTypes) {
        expect(nt.type).toBeTruthy();
        expect(nt.label).toBeTruthy();
        expect(nt.desc).toBeTruthy();
      }
    }
  });

  test("all edge types have label", () => {
    for (const type of ["flowchart", "erd", "swimlane"] as const) {
      const cfg = getChartTypeConfig(type);
      for (const et of cfg.edgeTypes) {
        expect(et.type).toBeTruthy();
        expect(et.label).toBeTruthy();
      }
    }
  });
});
