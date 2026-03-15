import { useStore } from "../store";
import type { FlowNode, FlowEdge, Chart, Project } from "../types";

/**
 * Creates a pre-populated store state for testing.
 * Directly sets state via Zustand's setState — no API calls.
 */
export function setupTestStore(overrides: {
  project?: Partial<Project>;
  activeChart?: Partial<Chart>;
  nodes?: Partial<FlowNode>[];
  edges?: Partial<FlowEdge>[];
} = {}) {
  const defaultProject: Project = {
    id: "test-project",
    name: "Test Project",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides.project,
  };

  const defaultChart: Chart = {
    id: "test-chart",
    projectId: defaultProject.id,
    title: "Test Chart",
    description: "",
    audience: "",
    chartType: "flowchart",
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides.activeChart,
  };

  const nodes: FlowNode[] = (overrides.nodes || []).map((n, i) => ({
    id: `node-${i}`,
    chartId: defaultChart.id,
    type: "process",
    label: `Node ${i}`,
    description: "",
    positionX: i * 200,
    positionY: 0,
    styleJson: "{}",
    sourceRefId: null,
    confidence: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...n,
  }));

  const edges: FlowEdge[] = (overrides.edges || []).map((e, i) => ({
    id: `edge-${i}`,
    chartId: defaultChart.id,
    fromNodeId: "",
    toNodeId: "",
    type: "default",
    label: "",
    condition: "",
    sourceRefId: null,
    confidence: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...e,
  }));

  useStore.setState({
    project: defaultProject,
    projects: [defaultProject],
    activeChart: defaultChart,
    charts: [defaultChart],
    nodes,
    edges,
    groups: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeIds: new Set<string>(),
    selectedGroupId: null,
  });

  return { project: defaultProject, chart: defaultChart, nodes, edges };
}

export function resetTestStore() {
  useStore.setState({
    project: null,
    projects: [],
    activeChart: null,
    charts: [],
    nodes: [],
    edges: [],
    groups: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNodeIds: new Set<string>(),
    selectedGroupId: null,
    messages: [],
    messagesLoaded: false,
  });
}
