import { memo, useCallback } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import type { FlowGroup } from "../../types";

interface SwimlaneLaneData {
  group: FlowGroup;
  isSelected: boolean;
  onResizeEnd?: (groupId: string, x: number, y: number, width: number, height: number) => void;
}

export const SwimlaneLane = memo(function SwimlaneLane({ data }: NodeProps) {
  const { group, isSelected, onResizeEnd } = data as unknown as SwimlaneLaneData;
  const color = group.color || "#3b82f6";

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { x: number; y: number; width: number; height: number }) => {
      onResizeEnd?.(group.id, Math.round(params.x), Math.round(params.y), Math.round(params.width), Math.round(params.height));
    },
    [group.id, onResizeEnd]
  );

  return (
    <div
      className="w-full h-full relative"
      style={{
        backgroundColor: `${color}15`,
        border: `2px ${isSelected ? "solid" : "dashed"} ${color}40`,
        borderRadius: "8px",
        minWidth: "100%",
        minHeight: "100%",
      }}
    >
      <NodeResizer
        isVisible={isSelected}
        minWidth={200}
        minHeight={80}
        lineStyle={{ borderColor: `${color}80` }}
        handleStyle={{ backgroundColor: color, width: 8, height: 8, borderRadius: 2 }}
        onResizeEnd={handleResizeEnd}
      />
      {group.label && (
        <div
          className="absolute top-0 left-0 bottom-0 w-[40px] flex items-center justify-center"
          style={{
            backgroundColor: `${color}25`,
            borderRight: `1px solid ${color}30`,
            borderRadius: "6px 0 0 6px",
          }}
        >
          <div
            className="text-[10px] font-bold tracking-wider whitespace-nowrap"
            style={{
              color,
              transform: "rotate(-90deg)",
              transformOrigin: "center center",
            }}
          >
            {group.label}
          </div>
        </div>
      )}
    </div>
  );
});
