import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "../../types";

interface SequenceActorNodeData {
  node: FlowNode;
  isSelected: boolean;
}

export const SequenceActorNode = memo(function SequenceActorNode({ data }: NodeProps) {
  const { node, isSelected } = data as unknown as SequenceActorNodeData;
  const isActor = node.type === "actor";
  const selectedRing = isSelected ? "ring-2 ring-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]" : "";

  if (isActor) {
    // Stick figure representation
    return (
      <div className={`flex flex-col items-center ${selectedRing} rounded-lg p-2`}>
        <svg width="40" height="50" viewBox="0 0 40 50" fill="none" stroke="#a1a1aa" strokeWidth="2">
          <circle cx="20" cy="10" r="8" />
          <line x1="20" y1="18" x2="20" y2="35" />
          <line x1="8" y1="25" x2="32" y2="25" />
          <line x1="20" y1="35" x2="10" y2="48" />
          <line x1="20" y1="35" x2="30" y2="48" />
        </svg>
        <div className="text-xs font-medium text-zinc-200 mt-1 text-center whitespace-nowrap">
          {node.label}
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-500 !w-2 !h-2" />
        <Handle type="target" position={Position.Top} className="!bg-zinc-500 !w-2 !h-2" />
        <Handle type="source" position={Position.Left} id="left" className="!bg-zinc-500 !w-2 !h-2" />
        <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-500 !w-2 !h-2" />
      </div>
    );
  }

  // Participant: box style
  return (
    <div className={`bg-zinc-800/80 border-2 border-zinc-500 rounded-lg px-4 py-2 text-center ${selectedRing}`}>
      <Handle type="target" position={Position.Top} className="!bg-zinc-500 !w-2 !h-2" />
      <div className="text-xs font-medium text-zinc-200 whitespace-nowrap">{node.label}</div>
      {node.description && (
        <div className="text-[10px] text-zinc-400 mt-0.5">{node.description}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-zinc-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-500 !w-2 !h-2" />
    </div>
  );
});
