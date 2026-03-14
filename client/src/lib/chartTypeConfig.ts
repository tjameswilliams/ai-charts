import { useMemo } from "react";
import { useStore } from "../store";
import type { ChartType } from "../types";

export interface ChartTypeConfig {
  nodeTypes: Array<{ type: string; label: string; desc: string }>;
  edgeTypes: Array<{ type: string; label: string }>;
  defaultNodeType: string;
  defaultEdgeType: string;
  groupLabel: string;
  supportsGroups: boolean;
}

const flowchartConfig: ChartTypeConfig = {
  nodeTypes: [
    { type: "process", label: "Process", desc: "General step" },
    { type: "decision", label: "Decision", desc: "Branch point" },
    { type: "start", label: "Start", desc: "Entry point" },
    { type: "end", label: "End", desc: "Exit point" },
    { type: "input_output", label: "Input / Output", desc: "Data flow" },
    { type: "data_store", label: "Data Store", desc: "Database / storage" },
    { type: "external_system", label: "External System", desc: "Third-party service" },
    { type: "subflow_ref", label: "Sub-flow", desc: "Reference to another flow" },
    { type: "note", label: "Note", desc: "Annotation" },
  ],
  edgeTypes: [
    { type: "default", label: "Default" },
    { type: "conditional", label: "Conditional" },
    { type: "error", label: "Error" },
    { type: "async", label: "Async" },
    { type: "fallback", label: "Fallback" },
  ],
  defaultNodeType: "process",
  defaultEdgeType: "default",
  groupLabel: "Group",
  supportsGroups: true,
};

const erdConfig: ChartTypeConfig = {
  nodeTypes: [
    { type: "entity", label: "Entity", desc: "Database table / entity" },
  ],
  edgeTypes: [
    { type: "one_to_one", label: "One to One" },
    { type: "one_to_many", label: "One to Many" },
    { type: "many_to_many", label: "Many to Many" },
  ],
  defaultNodeType: "entity",
  defaultEdgeType: "one_to_many",
  groupLabel: "Group",
  supportsGroups: false,
};

const swimlaneConfig: ChartTypeConfig = {
  nodeTypes: [
    { type: "action", label: "Action", desc: "Activity step" },
    { type: "process", label: "Process", desc: "General step" },
    { type: "decision", label: "Decision", desc: "Branch point" },
    { type: "start", label: "Start", desc: "Entry point" },
    { type: "end", label: "End", desc: "Exit point" },
  ],
  edgeTypes: [
    { type: "default", label: "Default" },
    { type: "conditional", label: "Conditional" },
  ],
  defaultNodeType: "action",
  defaultEdgeType: "default",
  groupLabel: "Lane",
  supportsGroups: true,
};

const configs: Record<ChartType, ChartTypeConfig> = {
  flowchart: flowchartConfig,
  erd: erdConfig,
  swimlane: swimlaneConfig,
};

export function getChartTypeConfig(chartType: ChartType): ChartTypeConfig {
  return configs[chartType] || flowchartConfig;
}

export function useChartTypeConfig(): ChartTypeConfig {
  const chartType = useStore((s) => s.activeChart?.chartType) as ChartType | undefined;
  return useMemo(() => getChartTypeConfig(chartType || "flowchart"), [chartType]);
}
