import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "../../types";

interface SequenceActivationNodeData {
  node: FlowNode;
  isSelected: boolean;
}

export const SequenceActivationNode = memo(function SequenceActivationNode({ data }: NodeProps) {
  const { node, isSelected } = data as unknown as SequenceActivationNodeData;
  const selectedRing = isSelected ? "ring-2 ring-blue-400" : "";

  return (
    <div
      className={`bg-blue-900/50 border-2 border-blue-500 rounded ${selectedRing}`}
      style={{ width: 16, minHeight: 40 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-blue-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-blue-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-2 !h-2" />
    </div>
  );
});
