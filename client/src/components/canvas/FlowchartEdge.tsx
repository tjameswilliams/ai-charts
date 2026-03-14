import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdge, EdgeType } from "../../types";

interface FlowchartEdgeData {
  edge: FlowEdge;
}

const edgeColors: Record<EdgeType, string> = {
  default: "#71717a",
  conditional: "#f59e0b",
  error: "#ef4444",
  async: "#8b5cf6",
  fallback: "#6b7280",
  one_to_one: "#38bdf8",
  one_to_many: "#38bdf8",
  many_to_many: "#38bdf8",
};

const edgeDash: Record<EdgeType, string | undefined> = {
  default: undefined,
  conditional: "5 5",
  error: undefined,
  async: "8 4",
  fallback: "3 3",
  one_to_one: undefined,
  one_to_many: undefined,
  many_to_many: undefined,
};

export function FlowchartEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  } = props;

  const edgeData = data as unknown as FlowchartEdgeData | undefined;
  const edge = edgeData?.edge;
  const edgeType: EdgeType = (edge?.type as EdgeType) || "default";
  const color = edgeColors[edgeType];
  const dash = edgeDash[edgeType];

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "#3b82f6" : color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: dash,
        }}
      />
      {edge?.label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 pointer-events-all"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {edge.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
