import { describe, test, expect, beforeEach } from "bun:test";
import {
  createTestDb,
  insertProject,
  insertChart,
  insertNode,
  insertEdge,
  insertGroup,
} from "../../__tests__/helpers";
import { mock } from "bun:test";

const testDb = createTestDb();

mock.module("../../../db/client", () => ({
  db: testDb.db,
  schema: testDb.schema,
}));

// Mock validation to return empty issues by default (tested separately)
mock.module("../../validation", () => ({
  validateChart: async () => [],
}));

const { exportMarkdown } = await import("../markdown");

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

describe("exportMarkdown (flowchart)", () => {
  beforeEach(() => {
    clearAll();
  });

  test("returns 'Chart not found.' for missing chart", async () => {
    const result = await exportMarkdown("nonexistent");
    expect(result).toBe("Chart not found.");
  });

  test("renders chart title as H1", async () => {
    setup();
    testDb.db
      .update(testDb.schema.charts)
      .set({ title: "My Flow" })
      .run();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });

    const result = await exportMarkdown("chart-1");
    expect(result).toStartWith("# My Flow");
  });

  test("includes chart metadata", async () => {
    setup();
    testDb.db
      .update(testDb.schema.charts)
      .set({ description: "A test chart", audience: "Engineers" })
      .run();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("A test chart");
    expect(result).toContain("**Audience:** Engineers");
    expect(result).toContain("**Type:** flowchart");
    expect(result).toContain("**Status:** draft");
  });

  test("includes node and edge counts", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("**Nodes:** 2");
    expect(result).toContain("**Edges:** 1");
  });

  test("renders entry points section", async () => {
    setup();
    insertNode(testDb.db, {
      id: "n1",
      type: "start",
      label: "User Request",
      description: "Initial trigger",
    });
    insertNode(testDb.db, { id: "n2", type: "end", label: "Done" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Entry Points");
    expect(result).toContain("**User Request**: Initial trigger");
  });

  test("renders process flow with arrows", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Process" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Process Flow");
    expect(result).toContain("**Begin** → **Process**");
    expect(result).toContain("**Process** → **End**");
  });

  test("renders decision branches", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "decision", label: "Is valid?" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "Success" });
    insertNode(testDb.db, { id: "n4", type: "end", label: "Failure" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3", label: "Yes" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n4", label: "No" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Decisions");
    expect(result).toContain("### Is valid?");
    expect(result).toContain("Yes: → Success");
    expect(result).toContain("No: → Failure");
  });

  test("renders edge labels in process flow", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2", label: "proceed" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("(proceed)");
  });

  test("renders error/fallback paths", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "API Call" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "Error Handler" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3", type: "error", label: "500" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Error & Fallback Paths");
    expect(result).toContain("[error]");
    expect(result).toContain("500");
  });

  test("renders groups section", async () => {
    setup();
    insertGroup(testDb.db, { id: "g1", label: "Auth Module", description: "Handles login" });
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Groups");
    expect(result).toContain("**Auth Module**: Handles login");
  });

  test("renders end states section", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "Complete" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "Aborted" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n3" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## End States");
    expect(result).toContain("**Complete**");
    expect(result).toContain("**Aborted**");
  });

  test("tags decisions in process flow", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "decision", label: "Check" });
    insertNode(testDb.db, { id: "n3", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });
    insertEdge(testDb.db, { fromNodeId: "n2", toNodeId: "n3" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("[Decision]");
  });
});

describe("exportMarkdown (ERD)", () => {
  beforeEach(() => {
    clearAll();
  });

  test("renders entities section", async () => {
    setup("erd");
    insertNode(testDb.db, {
      id: "n1",
      type: "entity",
      label: "User",
      description: "id: int [PK]\nname: string",
    });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Entities");
    expect(result).toContain("### User");
  });

  test("renders attribute table", async () => {
    setup("erd");
    insertNode(testDb.db, {
      id: "n1",
      type: "entity",
      label: "User",
      description: "id: int [PK]\nname: string",
    });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("| Attribute | Type | Constraints |");
    expect(result).toContain("| id | int | PK |");
    expect(result).toContain("| name | string |  |");
  });

  test("renders relationships section", async () => {
    setup("erd");
    insertNode(testDb.db, { id: "n1", type: "entity", label: "User", description: "id: int" });
    insertNode(testDb.db, { id: "n2", type: "entity", label: "Post", description: "id: int" });
    insertEdge(testDb.db, {
      fromNodeId: "n1",
      toNodeId: "n2",
      type: "one_to_many",
      label: "writes",
    });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Relationships");
    expect(result).toContain("**User** one to many **Post** (writes)");
  });
});

describe("exportMarkdown (Swimlane)", () => {
  beforeEach(() => {
    clearAll();
  });

  test("renders lane sections", async () => {
    setup("swimlane");
    insertGroup(testDb.db, { id: "g1", label: "Frontend" });
    insertGroup(testDb.db, { id: "g2", label: "Backend", description: "API layer" });
    insertNode(testDb.db, { id: "n1", type: "action", label: "Click" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Lane: Frontend");
    expect(result).toContain("## Lane: Backend");
    expect(result).toContain("API layer");
  });

  test("renders activities section", async () => {
    setup("swimlane");
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "action", label: "Process Request" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Activities");
    expect(result).toContain("**Begin** [start]");
    expect(result).toContain("**Process Request** [action]");
  });

  test("renders flow section", async () => {
    setup("swimlane");
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2", label: "next" });

    const result = await exportMarkdown("chart-1");
    expect(result).toContain("## Flow");
    expect(result).toContain("**Begin** → **End** (next)");
  });
});
