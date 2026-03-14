import { describe, test, expect, beforeEach } from "bun:test";
import {
  createTestDb,
  insertProject,
  insertChart,
  insertNode,
  insertEdge,
  insertGroup,
  insertNodeGroup,
} from "../../__tests__/helpers";
import { mock } from "bun:test";

const testDb = createTestDb();

mock.module("../../../db/client", () => ({
  db: testDb.db,
  schema: testDb.schema,
}));

const { exportMermaid } = await import("../mermaid");

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

describe("exportMermaid (flowchart)", () => {
  beforeEach(() => {
    clearAll();
  });

  test("renders flowchart TD header", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "process", label: "Step" });

    const result = await exportMermaid("chart-1");
    expect(result).toStartWith("flowchart TD");
  });

  test("maps node shapes correctly", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "decision", label: "Check" });
    insertNode(testDb.db, { id: "n3", type: "process", label: "Do" });
    insertNode(testDb.db, { id: "n4", type: "input_output", label: "IO" });
    insertNode(testDb.db, { id: "n5", type: "data_store", label: "DB" });
    insertNode(testDb.db, { id: "n6", type: "end", label: "Done" });

    const result = await exportMermaid("chart-1");
    // Start/end use stadium shape
    expect(result).toContain('(["Begin"])');
    expect(result).toContain('(["Done"])');
    // Decision uses rhombus
    expect(result).toContain('{"Check"}');
    // Process uses rectangle
    expect(result).toContain('["Do"]');
    // Input/output uses parallelogram
    expect(result).toContain('[/"IO"/]');
    // Data store uses cylinder
    expect(result).toContain('[("DB")]');
  });

  test("renders edges with arrows", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "A" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "B" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("N0 --> N1");
  });

  test("renders edge labels", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "A" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "B" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2", label: "next" });

    const result = await exportMermaid("chart-1");
    expect(result).toContain('|"next"|');
  });

  test("uses dashed arrows for conditional edges", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "A" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "B" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2", type: "conditional" });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("-.->");
  });

  test("uses thick arrows for error edges", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "A" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "B" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2", type: "error" });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("==>");
  });

  test("styles start nodes green and end nodes red", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "start", label: "Begin" });
    insertNode(testDb.db, { id: "n2", type: "end", label: "End" });
    insertEdge(testDb.db, { fromNodeId: "n1", toNodeId: "n2" });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("style N0 fill:#059669");
    expect(result).toContain("style N1 fill:#dc2626");
  });

  test("renders subgraph blocks for groups", async () => {
    setup();
    insertGroup(testDb.db, { id: "g1", label: "Auth Module" });
    insertNode(testDb.db, { id: "n1", type: "process", label: "Login" });
    insertNode(testDb.db, { id: "n2", type: "process", label: "Logout" });
    insertNodeGroup(testDb.db, "n1", "g1");
    insertNodeGroup(testDb.db, "n2", "g1");

    const result = await exportMermaid("chart-1");
    expect(result).toContain("subgraph Auth Module");
    expect(result).toContain('"Login"');
    expect(result).toContain('"Logout"');
    expect(result).toContain("end");
  });

  test("escapes quotes in labels", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "process", label: 'Say "hello"' });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("&quot;hello&quot;");
  });

  test("escapes newlines in labels", async () => {
    setup();
    insertNode(testDb.db, { id: "n1", type: "process", label: "Line 1\nLine 2" });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("<br/>");
  });
});

describe("exportMermaid (ERD)", () => {
  beforeEach(() => {
    clearAll();
  });

  test("renders erDiagram header", async () => {
    setup("erd");
    insertNode(testDb.db, { id: "n1", type: "entity", label: "User" });

    const result = await exportMermaid("chart-1");
    expect(result).toStartWith("erDiagram");
  });

  test("renders entity with attributes", async () => {
    setup("erd");
    insertNode(testDb.db, {
      id: "n1",
      type: "entity",
      label: "User",
      description: "id: int [PK]\nname: string\nemail: string",
    });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("User {");
    expect(result).toContain('int id "PK"');
    expect(result).toContain("string name");
    expect(result).toContain("string email");
  });

  test("renders empty entity block when no attributes", async () => {
    setup("erd");
    insertNode(testDb.db, { id: "n1", type: "entity", label: "Empty", description: "" });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("Empty {");
    expect(result).toContain("}");
  });

  test("renders one-to-many relationships", async () => {
    setup("erd");
    insertNode(testDb.db, { id: "n1", type: "entity", label: "User", description: "id: int" });
    insertNode(testDb.db, { id: "n2", type: "entity", label: "Post", description: "id: int" });
    insertEdge(testDb.db, {
      fromNodeId: "n1",
      toNodeId: "n2",
      type: "one_to_many",
      label: "writes",
    });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("User ||--o{ Post");
    expect(result).toContain(': "writes"');
  });

  test("renders one-to-one relationships", async () => {
    setup("erd");
    insertNode(testDb.db, { id: "n1", type: "entity", label: "User", description: "id: int" });
    insertNode(testDb.db, { id: "n2", type: "entity", label: "Profile", description: "id: int" });
    insertEdge(testDb.db, {
      fromNodeId: "n1",
      toNodeId: "n2",
      type: "one_to_one",
      label: "has",
    });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("User ||--|| Profile");
  });

  test("renders many-to-many relationships", async () => {
    setup("erd");
    insertNode(testDb.db, { id: "n1", type: "entity", label: "Student", description: "id: int" });
    insertNode(testDb.db, { id: "n2", type: "entity", label: "Course", description: "id: int" });
    insertEdge(testDb.db, {
      fromNodeId: "n1",
      toNodeId: "n2",
      type: "many_to_many",
      label: "enrolls",
    });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("Student }o--o{ Course");
  });

  test("replaces spaces with underscores in entity names", async () => {
    setup("erd");
    insertNode(testDb.db, {
      id: "n1",
      type: "entity",
      label: "Order Item",
      description: "id: int",
    });

    const result = await exportMermaid("chart-1");
    expect(result).toContain("Order_Item {");
  });
});
