import { describe, test, expect, beforeEach } from "bun:test";
import { createTestDb, insertProject, insertChart, insertNode, insertEdge } from "./helpers";
import { mock } from "bun:test";
import { eq } from "drizzle-orm";

// Create a single in-memory DB for the entire test file
const testDb = createTestDb();

// Mock the db/client module BEFORE importing validation
mock.module("../../db/client", () => ({
  db: testDb.db,
  schema: testDb.schema,
}));

// Import after mock is set up
const { validateChart } = await import("../validation");

function clearAll() {
  testDb.db.delete(testDb.schema.edges).run();
  testDb.db.delete(testDb.schema.nodeGroups).run();
  testDb.db.delete(testDb.schema.nodes).run();
  testDb.db.delete(testDb.schema.groups).run();
  testDb.db.delete(testDb.schema.charts).run();
  testDb.db.delete(testDb.schema.projects).run();
}

function setup(chartType = "flowchart") {
  insertProject(testDb.db);
  insertChart(testDb.db, { chartType });
}

describe("validateChart", () => {
  beforeEach(() => {
    clearAll();
  });

  // ── Empty chart ──

  test("warns on empty chart", async () => {
    setup();
    const issues = await validateChart("chart-1");
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("empty_chart");
  });

  // ── Start / end nodes ──

  test("warns when no start node", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "process", label: "Step" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "Done" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const issues = await validateChart("chart-1");
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("no_start");
  });

  test("warns when no end node", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Step" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const issues = await validateChart("chart-1");
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("no_end");
  });

  test("warns on multiple start nodes", async () => {
    setup();
    insertNode(testDb.db, { id: "s1", type: "start", label: "Start A" });
    insertNode(testDb.db, { id: "s2", type: "start", label: "Start B" });
    insertNode(testDb.db, { id: "e1", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "s1", toNodeId: "e1" });
    insertEdge(testDb.db, { fromNodeId: "s2", toNodeId: "e1" });

    const issues = await validateChart("chart-1");
    const multiStarts = issues.filter((i) => i.code === "multiple_starts");
    expect(multiStarts).toHaveLength(2);
  });

  // ── Connectivity ──

  test("warns on disconnected nodes", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Orphan" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    const disconnected = issues.filter((i) => i.code === "disconnected");
    expect(disconnected).toHaveLength(1);
    expect(disconnected[0].nodeId).toBe("n2");
  });

  test("does not flag note nodes as disconnected", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertNode(testDb.db, { id: "n3", type: "note", label: "A note" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const issues = await validateChart("chart-1");
    const disconnected = issues.filter((i) => i.code === "disconnected");
    expect(disconnected).toHaveLength(0);
  });

  // ── Dead ends ──

  test("warns on dead-end nodes", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Dead End" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    const deadEnds = issues.filter((i) => i.code === "dead_end");
    expect(deadEnds).toHaveLength(1);
    expect(deadEnds[0].nodeId).toBe("n2");
  });

  test("does not flag end nodes as dead ends", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const issues = await validateChart("chart-1");
    const deadEnds = issues.filter((i) => i.code === "dead_end");
    expect(deadEnds).toHaveLength(0);
  });

  // ── Unreachable ──

  test("warns on unreachable nodes", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Unreachable" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n3" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    const unreachable = issues.filter((i) => i.code === "unreachable");
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0].nodeId).toBe("n2");
  });

  // ── Decisions ──

  test("warns on incomplete decision (fewer than 2 branches)", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "decision", label: "Check?" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    const incomplete = issues.filter((i) => i.code === "incomplete_decision");
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0].nodeId).toBe("n2");
  });

  test("no warning for decision with 2+ branches", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "decision", label: "Check?" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "Yes End" });
    insertNode(testDb.db, { id: "n4", type: "end", label: "No End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3", label: "Yes" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n4", label: "No" });

    const issues = await validateChart("chart-1");
    const incomplete = issues.filter((i) => i.code === "incomplete_decision");
    expect(incomplete).toHaveLength(0);
  });

  // ── Cycle detection ──

  test("detects cycles", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Step A" });
    insertNode(testDb.db, { id: "n3", type: "process", label: "Step B" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });
    insertEdge(testDb.db, { fromNodeId: "n3", toNodeId: "n2" }); // cycle

    const issues = await validateChart("chart-1");
    const cycles = issues.filter((i) => i.code === "cycle_detected");
    expect(cycles).toHaveLength(1);
  });

  test("no cycle warning for acyclic graph", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Step" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    const cycles = issues.filter((i) => i.code === "cycle_detected");
    expect(cycles).toHaveLength(0);
  });

  // ── Low confidence ──

  test("warns on low confidence nodes", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin", confidence: 0.5 });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const issues = await validateChart("chart-1");
    const lowConf = issues.filter((i) => i.code === "low_confidence");
    expect(lowConf).toHaveLength(1);
    expect(lowConf[0].message).toContain("0.5");
  });

  test("no warning for high confidence nodes", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin", confidence: 0.9 });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const issues = await validateChart("chart-1");
    const lowConf = issues.filter((i) => i.code === "low_confidence");
    expect(lowConf).toHaveLength(0);
  });

  // ── Empty labels ──

  test("warns on empty labels", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "  " });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    const emptyLabels = issues.filter((i) => i.code === "empty_label");
    expect(emptyLabels).toHaveLength(1);
  });

  // ── Valid flowchart ──

  test("valid simple flowchart has no structural issues", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Step" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    expect(issues).toHaveLength(0);
  });
});

// ── ERD validation ──

describe("validateChart (ERD)", () => {
  beforeEach(() => {
    clearAll();
  });

  test("warns on entity with no attributes", async () => {
    setup("erd");
    insertNode(testDb.db, { id: "n1", type: "entity", label: "User", description: "" });

    const issues = await validateChart("chart-1");
    const noAttr = issues.filter((i) => i.code === "no_attributes");
    expect(noAttr).toHaveLength(1);
  });

  test("warns on entity with no relationships", async () => {
    setup("erd");
    insertNode(testDb.db, {
      id: "n1",
      type: "entity",
      label: "User",
      description: "id: int [PK]\nname: string",
    });
    insertNode(testDb.db, {
      id: "n2",
      type: "entity",
      label: "Orphan",
      description: "id: int [PK]",
    });
    insertEdge(testDb.db, {
      fromNodeId: "n1",
      toNodeId: "n1",
      type: "one_to_many",
      label: "self-ref",
    });

    const issues = await validateChart("chart-1");
    const noRel = issues.filter((i) => i.code === "no_relationships");
    expect(noRel).toHaveLength(1);
    expect(noRel[0].nodeId).toBe("n2");
  });

  test("warns on missing relationship labels", async () => {
    setup("erd");
    insertNode(testDb.db, {
      id: "n1",
      type: "entity",
      label: "User",
      description: "id: int [PK]",
    });
    insertNode(testDb.db, {
      id: "n2",
      type: "entity",
      label: "Post",
      description: "id: int [PK]",
    });
    insertEdge(testDb.db, {
      fromNodeId: "n1",
      toNodeId: "n2",
      type: "one_to_many",
      label: "",
    });

    const issues = await validateChart("chart-1");
    const missingLabel = issues.filter((i) => i.code === "missing_rel_label");
    expect(missingLabel).toHaveLength(1);
  });

  test("valid ERD produces no warnings", async () => {
    setup("erd");
    insertNode(testDb.db, {
      id: "n1",
      type: "entity",
      label: "User",
      description: "id: int [PK]\nname: string",
    });
    insertNode(testDb.db, {
      id: "n2",
      type: "entity",
      label: "Post",
      description: "id: int [PK]\ntitle: string",
    });
    insertEdge(testDb.db, {
      fromNodeId: "n1",
      toNodeId: "n2",
      type: "one_to_many",
      label: "has many",
    });

    const issues = await validateChart("chart-1");
    expect(issues).toHaveLength(0);
  });
});

// ── Swimlane validation ──

describe("validateChart (Swimlane)", () => {
  beforeEach(() => {
    clearAll();
  });

  test("warns on missing start/end nodes", async () => {
    setup("swimlane");
    insertNode(testDb.db, { id: "n1", type: "action", label: "Do thing" });

    const issues = await validateChart("chart-1");
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("no_start");
    expect(codes).toContain("no_end");
  });

  test("warns on disconnected swimlane nodes", async () => {
    setup("swimlane");
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "action", label: "Orphan" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    const disconnected = issues.filter((i) => i.code === "disconnected");
    expect(disconnected).toHaveLength(1);
    expect(disconnected[0].nodeId).toBe("n2");
  });

  test("valid swimlane has no structural issues", async () => {
    setup("swimlane");
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "action", label: "Do thing" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const issues = await validateChart("chart-1");
    expect(issues).toHaveLength(0);
  });
});
