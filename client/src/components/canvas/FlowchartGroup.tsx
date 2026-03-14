import { memo, useCallback } from "react";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import type { FlowGroup } from "../../types";

interface FlowchartGroupData {
  group: FlowGroup;
  isSelected: boolean;
  onResizeEnd?: (groupId: string, x: number, y: number, width: number, height: number) => void;
}

export const FlowchartGroup = memo(function FlowchartGroup({ data }: NodeProps) {
  const { group, isSelected, onResizeEnd } = data as unknown as FlowchartGroupData;
  const color = group.color || "#3b82f6";

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { x: number; y: number; width: number; height: number }) => {
      onResizeEnd?.(group.id, Math.round(params.x), Math.round(params.y), Math.round(params.width), Math.round(params.height));
    },
    [group.id, onResizeEnd]
  );

  return (
    <div
      className="w-full h-full rounded-xl relative"
      style={{
        backgroundColor: `${color}25`,
        border: `2px ${isSelected ? "solid" : "dashed"} ${color}50`,
        minWidth: "100%",
        minHeight: "100%",
      }}
    >
      <NodeResizer
        isVisible={isSelected}
        minWidth={100}
        minHeight={60}
        lineStyle={{ borderColor: `${color}80` }}
        handleStyle={{ backgroundColor: color, width: 8, height: 8, borderRadius: 2 }}
        onResizeEnd={handleResizeEnd}
      />
      {group.label && (
        <div
          className="absolute top-2 left-3 px-2 py-0.5 rounded text-[10px] font-medium"
          style={{
            backgroundColor: `${color}30`,
            color: `${color}`,
            border: `1px solid ${color}40`,
          }}
        >
          {group.label}
        </div>
      )}
    </div>
  );
});
