import { memo, useCallback } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { FlowNode, NodeType } from "../../types";
import { useSkeleton } from "./SkeletonContext";

interface FlowchartNodeData {
  node: FlowNode;
  isSelected: boolean;
  onResizeEnd?: (id: string, width: number, height: number) => void;
}

const nodeStyles: Record<
  NodeType,
  { bg: string; border: string; text: string; descText: string; shape?: string }
> = {
  start: { bg: "bg-emerald-900/80", border: "border-emerald-500", text: "text-emerald-100", descText: "text-emerald-300/70" },
  end: { bg: "bg-red-900/80", border: "border-red-500", text: "text-red-100", descText: "text-red-300/70" },
  process: { bg: "bg-blue-900/60", border: "border-blue-500", text: "text-blue-100", descText: "text-blue-300/70" },
  decision: { bg: "bg-amber-900/60", border: "border-amber-500", text: "text-amber-100", descText: "text-amber-300/70", shape: "diamond" },
  input_output: { bg: "bg-purple-900/60", border: "border-purple-500", text: "text-purple-100", descText: "text-purple-300/70", shape: "parallelogram" },
  data_store: { bg: "bg-teal-900/60", border: "border-teal-500", text: "text-teal-100", descText: "text-teal-300/70", shape: "cylinder" },
  external_system: { bg: "bg-orange-900/60", border: "border-orange-500", text: "text-orange-100", descText: "text-orange-300/70" },
  note: { bg: "bg-zinc-800/60", border: "border-zinc-600 border-dashed", text: "text-zinc-400", descText: "text-zinc-500" },
  subflow_ref: { bg: "bg-indigo-900/60", border: "border-indigo-500", text: "text-indigo-100", descText: "text-indigo-300/70" },
  image: { bg: "bg-zinc-900/60", border: "border-zinc-600", text: "text-zinc-200", descText: "text-zinc-400" },
  entity: { bg: "bg-sky-900/60", border: "border-sky-500", text: "text-sky-100", descText: "text-sky-300/70" },
  action: { bg: "bg-cyan-900/60", border: "border-cyan-500", text: "text-cyan-100", descText: "text-cyan-300/70" },
  sticky_note: { bg: "bg-yellow-200/90", border: "border-yellow-400", text: "text-yellow-900", descText: "text-yellow-800/70" },
  actor: { bg: "bg-zinc-700/80", border: "border-zinc-400", text: "text-zinc-100", descText: "text-zinc-400" },
  participant: { bg: "bg-zinc-800/80", border: "border-zinc-500", text: "text-zinc-200", descText: "text-zinc-400" },
  lifeline_activation: { bg: "bg-blue-900/50", border: "border-blue-500", text: "text-blue-200", descText: "text-blue-400" },
  central_topic: { bg: "bg-violet-600/90", border: "border-violet-400", text: "text-violet-50", descText: "text-violet-200/70" },
  main_branch: { bg: "bg-blue-700/80", border: "border-blue-400", text: "text-blue-50", descText: "text-blue-200/70" },
  sub_branch: { bg: "bg-emerald-800/70", border: "border-emerald-500", text: "text-emerald-100", descText: "text-emerald-300/70" },
  leaf: { bg: "bg-zinc-800/70", border: "border-zinc-600", text: "text-zinc-200", descText: "text-zinc-400" },
};

// Skeleton overlay that covers the content area
function SkeletonOverlay({ color, hasDesc }: { color: string; hasDesc: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center px-4 py-3 pointer-events-none">
      <div className="h-2 rounded-sm opacity-40" style={{ width: "60%", backgroundColor: color }} />
      {hasDesc && (
        <div className="flex flex-col gap-1 mt-2">
          <div className="h-1.5 rounded-sm opacity-20" style={{ width: "90%", backgroundColor: color }} />
          <div className="h-1.5 rounded-sm opacity-20" style={{ width: "70%", backgroundColor: color }} />
        </div>
      )}
    </div>
  );
}

// Detect if text contains markdown syntax
function hasMarkdown(text: string): boolean {
  return /(?:^|\n)#{1,6}\s|(?:^|\n)[-*+]\s|(?:^|\n)\d+\.\s|\*\*.+\*\*|`.+`|\[.+\]\(.+\)|(?:^|\n)>\s|(?:^|\n)```|(?:^|\n)\|.+\|/m.test(text);
}

function NodeDescription({ text, descText }: { text: string; descText: string }) {
  if (!text) return null;

  if (hasMarkdown(text)) {
    return (
      <div className={`node-markdown mt-1.5 text-left ${descText}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={`text-[11px] mt-1 leading-snug ${descText} whitespace-pre-wrap`}>
      {text}
    </div>
  );
}

function parseStyle(styleJson: string): { width?: number; height?: number; imageUrl?: string } {
  try {
    return JSON.parse(styleJson || "{}");
  } catch {
    return {};
  }
}

// Map tailwind text class to a CSS color for skeleton bars
const textColorMap: Record<string, string> = {
  "text-emerald-100": "#d1fae5",
  "text-red-100": "#fee2e2",
  "text-blue-100": "#dbeafe",
  "text-amber-100": "#fef3c7",
  "text-purple-100": "#f3e8ff",
  "text-teal-100": "#ccfbf1",
  "text-orange-100": "#ffedd5",
  "text-zinc-400": "#a1a1aa",
  "text-indigo-100": "#e0e7ff",
  "text-zinc-200": "#e4e4e7",
  "text-sky-100": "#e0f2fe",
  "text-cyan-100": "#cffafe",
  "text-yellow-900": "#713f12",
  "text-violet-50": "#f5f3ff",
  "text-blue-50": "#eff6ff",
  "text-zinc-100": "#f4f4f5",
};

export const FlowchartNode = memo(function FlowchartNode({ data }: NodeProps) {
  const { node, isSelected, onResizeEnd } = data as unknown as FlowchartNodeData;
  const skeleton = useSkeleton();
  const style = nodeStyles[node.type] || nodeStyles.process;
  const hasDesc = !!node.description;
  const parsed = parseStyle(node.styleJson);

  // In skeleton mode, hide text content but keep it in DOM for layout
  const hideText: React.CSSProperties = skeleton ? { visibility: "hidden" } : {};
  const skeletonColor = textColorMap[style.text] || "#a1a1aa";

  const selectedRing = isSelected ? "ring-2 ring-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]" : "";

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      onResizeEnd?.(node.id, Math.round(params.width), Math.round(params.height));
    },
    [node.id, onResizeEnd]
  );

  const resizer = (
    <NodeResizer
      isVisible={isSelected}
      minWidth={80}
      minHeight={40}
      lineStyle={{ borderColor: "rgba(96,165,250,0.4)", borderWidth: 1 }}
      handleStyle={{ backgroundColor: "#60a5fa", width: 7, height: 7, borderRadius: 2, border: "none" }}
      onResizeEnd={handleResizeEnd}
    />
  );

  // Shape-specific classes
  let shapeClasses = "rounded-lg";
  if (node.type === "start" || node.type === "end") {
    shapeClasses = hasDesc ? "rounded-2xl" : "rounded-full";
  } else if (node.type === "external_system" || node.type === "subflow_ref") {
    shapeClasses = "rounded-lg border-double border-4";
  }

  const isDiamond = style.shape === "diamond";
  const isParallelogram = style.shape === "parallelogram";
  const isCylinder = style.shape === "cylinder";

  // Dimension styles — only apply if explicitly set
  const dimStyle: React.CSSProperties = {};
  if (parsed.width) dimStyle.width = parsed.width;
  if (parsed.height) dimStyle.height = parsed.height;

  // Image node
  if (node.type === "image") {
    const imageUrl = parsed.imageUrl;
    return (
      <div
        className={`rounded-lg border-2 ${style.border} ${selectedRing} overflow-hidden bg-zinc-900/80`}
        style={{ minWidth: 80, minHeight: 60, ...dimStyle }}
      >
        {resizer}
        <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={node.label}
            className="w-full h-full object-contain pointer-events-none"
            style={skeleton ? { visibility: "hidden" } : {}}
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full min-h-[60px] text-zinc-500 text-xs">
            No image
          </div>
        )}
        {node.label && node.label !== "Image" && (
          <div className={`text-[10px] text-center py-1 px-2 ${style.text} truncate border-t border-zinc-700/50`} style={hideText}>
            {node.label}
          </div>
        )}
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
      </div>
    );
  }

  if (isDiamond) {
    const size = parsed.width || 120;
    return (
      <div className="relative" style={{ width: size, height: size }}>
        {resizer}
        <Handle type="target" position={Position.Top} className="!bg-zinc-500" style={{ top: -4 }} />
        <div
          className={`absolute inset-0 flex items-center justify-center ${style.bg} border-2 ${style.border} ${selectedRing}`}
          style={{ transform: "rotate(45deg)", borderRadius: "8px" }}
        >
          <div className={`text-xs font-medium text-center px-1 ${style.text}`} style={{ transform: "rotate(-45deg)", maxWidth: `${size * 0.7}px`, ...hideText }}>
            {node.label}
          </div>
          {skeleton && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ transform: "rotate(-45deg)" }}>
              <div className="h-2 rounded-sm opacity-40" style={{ width: "50%", backgroundColor: skeletonColor }} />
            </div>
          )}
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" style={{ bottom: -4 }} />
        <Handle type="source" position={Position.Right} id="right" className="!bg-zinc-500" style={{ right: -4 }} />
        <Handle type="source" position={Position.Left} id="left" className="!bg-zinc-500" style={{ left: -4 }} />
      </div>
    );
  }

  if (isCylinder) {
    return (
      <div className={`relative ${selectedRing} rounded-lg`} style={{ minWidth: hasDesc ? 160 : 100, ...dimStyle, overflow: "hidden" }}>
        {resizer}
        <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
        <div className={`${style.bg} border-2 ${style.border} rounded-t-[50%] rounded-b-lg px-4 py-4 w-full h-full`}>
          <div className={hasDesc ? "text-left" : "text-center"} style={hideText}>
            <div className={`text-xs font-medium ${style.text}`}>{node.label}</div>
            <NodeDescription text={node.description} descText={style.descText} />
          </div>
        </div>
        {skeleton && <SkeletonOverlay color={skeletonColor} hasDesc={hasDesc} />}
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
      </div>
    );
  }

  if (isParallelogram) {
    return (
      <div className={`relative ${selectedRing}`} style={{ transform: "skewX(-10deg)", minWidth: hasDesc ? 160 : 100, ...dimStyle }}>
        {resizer}
        <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
        <div className={`${style.bg} border-2 ${style.border} rounded-lg px-4 py-3 w-full h-full`}>
          <div style={{ transform: "skewX(10deg)", ...hideText }}>
            <div className={`text-xs font-medium ${style.text} ${hasDesc ? "text-left" : "text-center"}`}>
              {node.label}
            </div>
            <NodeDescription text={node.description} descText={style.descText} />
          </div>
        </div>
        {skeleton && <SkeletonOverlay color={skeletonColor} hasDesc={hasDesc} />}
        <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
      </div>
    );
  }

  return (
    <div
      className={`relative ${style.bg} border-2 ${style.border} ${shapeClasses} px-4 py-3 ${hasDesc ? "text-left" : "text-center"} ${selectedRing} overflow-hidden`}
      style={{ minWidth: hasDesc ? 160 : 100, ...dimStyle }}
    >
      {resizer}
      <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
      <div style={hideText}>
        <div className={`text-xs font-medium ${style.text}`}>{node.label}</div>
        <NodeDescription text={node.description} descText={style.descText} />
      </div>
      {skeleton && <SkeletonOverlay color={skeletonColor} hasDesc={hasDesc} />}
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
    </div>
  );
});
