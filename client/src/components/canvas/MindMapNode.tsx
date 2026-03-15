import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode, NodeType } from "../../types";

interface MindMapNodeData {
  node: FlowNode;
  isSelected: boolean;
}

const mindmapStyles: Record<string, { bg: string; border: string; text: string; size: string }> = {
  central_topic: { bg: "bg-violet-600/90", border: "border-violet-400", text: "text-violet-50", size: "text-base font-bold px-6 py-4" },
  main_branch: { bg: "bg-blue-700/80", border: "border-blue-400", text: "text-blue-50", size: "text-sm font-semibold px-4 py-2.5" },
  sub_branch: { bg: "bg-emerald-800/70", border: "border-emerald-500", text: "text-emerald-100", size: "text-xs font-medium px-3 py-2" },
  leaf: { bg: "bg-zinc-800/70", border: "border-zinc-600", text: "text-zinc-200", size: "text-xs px-3 py-1.5" },
};

export const MindMapNode = memo(function MindMapNode({ data }: NodeProps) {
  const { node, isSelected } = data as unknown as MindMapNodeData;
  const style = mindmapStyles[node.type] || mindmapStyles.main_branch;
  const selectedRing = isSelected ? "ring-2 ring-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]" : "";

  return (
    <div className={`${style.bg} border-2 ${style.border} rounded-2xl ${style.size} ${style.text} ${selectedRing} text-center whitespace-nowrap`}>
      <Handle type="target" position={Position.Left} className="!bg-zinc-500 !w-2 !h-2" />
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-500 !w-2 !h-2" />
      {node.label}
      {node.description && (
        <div className="text-[10px] mt-1 opacity-70 font-normal">{node.description}</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-zinc-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-500 !w-2 !h-2" />
    </div>
  );
});
