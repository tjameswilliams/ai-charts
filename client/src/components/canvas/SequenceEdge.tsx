import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdge, EdgeType } from "../../types";

interface SequenceEdgeData {
  edge: FlowEdge;
}

const messageStyles: Record<string, { dash?: string; color: string }> = {
  sync_message: { color: "#71717a" },
  async_message: { dash: "8 4", color: "#71717a" },
  return_message: { dash: "4 4", color: "#52525b" },
  self_message: { color: "#71717a" },
};

export function SequenceEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    selected,
  } = props;

  const edgeData = data as unknown as SequenceEdgeData | undefined;
  const edge = edgeData?.edge;
  const edgeType = (edge?.type as string) || "sync_message";
  const style = messageStyles[edgeType] || messageStyles.sync_message;

  // Self-message: render as a loop
  if (edgeType === "self_message" || (sourceX === targetX && sourceY === targetY)) {
    const loopSize = 30;
    const path = `M ${sourceX} ${sourceY} C ${sourceX + loopSize} ${sourceY}, ${sourceX + loopSize} ${sourceY + loopSize}, ${sourceX} ${sourceY + loopSize}`;
    return (
      <>
        <BaseEdge
          id={id}
          path={path}
          style={{
            stroke: selected ? "#3b82f6" : style.color,
            strokeWidth: selected ? 3 : 2,
            strokeDasharray: style.dash,
          }}
        />
        {edge?.label && (
          <EdgeLabelRenderer>
            <div
              className="absolute text-[10px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 pointer-events-all"
              style={{
                transform: `translate(${sourceX + loopSize + 4}px, ${sourceY + loopSize / 2 - 8}px)`,
              }}
            >
              {edge.label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "#3b82f6" : style.color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: style.dash,
        }}
      />
      {edge?.label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[10px] bg-zinc-800/90 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300 pointer-events-all"
            style={{
              transform: `translate(-50%, -120%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {edge.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
