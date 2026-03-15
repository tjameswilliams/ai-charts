import { useMemo } from "react";
import { useStore } from "../store";
import type { ChartType } from "../types";

export interface ChartTypeConfig {
  nodeTypes: Array<{ type: string; label: string; desc: string; category?: string }>;
  edgeTypes: Array<{ type: string; label: string }>;
  defaultNodeType: string;
  defaultEdgeType: string;
  groupLabel: string;
  supportsGroups: boolean;
}

const flowchartConfig: ChartTypeConfig = {
  nodeTypes: [
    { type: "process", label: "Process", desc: "General step", category: "Processing" },
    { type: "decision", label: "Decision", desc: "Branch point", category: "Flow Control" },
    { type: "start", label: "Start", desc: "Entry point", category: "Flow Control" },
    { type: "end", label: "End", desc: "Exit point", category: "Flow Control" },
    { type: "input_output", label: "Input / Output", desc: "Data flow", category: "Processing" },
    { type: "data_store", label: "Data Store", desc: "Database / storage", category: "Processing" },
    { type: "external_system", label: "External System", desc: "Third-party service", category: "Processing" },
    { type: "subflow_ref", label: "Sub-flow", desc: "Reference to another flow", category: "Processing" },
    { type: "note", label: "Note", desc: "Annotation", category: "Annotation" },
    { type: "sticky_note", label: "Sticky Note", desc: "Freeform note", category: "Annotation" },
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
    { type: "sticky_note", label: "Sticky Note", desc: "Freeform note" },
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
    { type: "sticky_note", label: "Sticky Note", desc: "Freeform note" },
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

const mindmapConfig: ChartTypeConfig = {
  nodeTypes: [
    { type: "central_topic", label: "Central Topic", desc: "Main idea" },
    { type: "main_branch", label: "Main Branch", desc: "Primary category" },
    { type: "sub_branch", label: "Sub-Branch", desc: "Secondary topic" },
    { type: "leaf", label: "Leaf", desc: "Detail or note" },
    { type: "sticky_note", label: "Sticky Note", desc: "Freeform note" },
  ],
  edgeTypes: [
    { type: "branch", label: "Branch" },
  ],
  defaultNodeType: "main_branch",
  defaultEdgeType: "branch",
  groupLabel: "Group",
  supportsGroups: false,
};

const sequenceConfig: ChartTypeConfig = {
  nodeTypes: [
    { type: "actor", label: "Actor", desc: "Person/role" },
    { type: "participant", label: "Participant", desc: "System/service" },
    { type: "lifeline_activation", label: "Activation", desc: "Active period" },
    { type: "sticky_note", label: "Sticky Note", desc: "Freeform note" },
  ],
  edgeTypes: [
    { type: "sync_message", label: "Sync Message" },
    { type: "async_message", label: "Async Message" },
    { type: "return_message", label: "Return" },
    { type: "self_message", label: "Self Message" },
  ],
  defaultNodeType: "participant",
  defaultEdgeType: "sync_message",
  groupLabel: "Group",
  supportsGroups: false,
};

const configs: Record<ChartType, ChartTypeConfig> = {
  flowchart: flowchartConfig,
  erd: erdConfig,
  swimlane: swimlaneConfig,
  mindmap: mindmapConfig,
  sequence: sequenceConfig,
};

export function getChartTypeConfig(chartType: ChartType): ChartTypeConfig {
  return configs[chartType] || flowchartConfig;
}

export function useChartTypeConfig(): ChartTypeConfig {
  const chartType = useStore((s) => s.activeChart?.chartType) as ChartType | undefined;
  return useMemo(() => getChartTypeConfig(chartType || "flowchart"), [chartType]);
}
