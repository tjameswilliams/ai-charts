import { memo, useCallback } from "react";
import { Handle, Position, NodeResizer, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "../../types";
import { useSkeleton } from "./SkeletonContext";

interface ERDNodeData {
  node: FlowNode;
  isSelected: boolean;
  onResizeEnd?: (id: string, width: number, height: number) => void;
}

interface Attribute {
  name: string;
  type: string;
  constraints: string[];
}

export function parseAttributes(description: string): Attribute[] {
  if (!description) return [];
  return description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Format: name : type [PK|FK|NOT NULL|UNIQUE]
      const bracketMatch = line.match(/\[([^\]]+)\]/);
      const constraints = bracketMatch
        ? bracketMatch[1].split("|").map((c) => c.trim())
        : [];
      const withoutBrackets = line.replace(/\[.*?\]/, "").trim();
      const parts = withoutBrackets.split(":").map((p) => p.trim());
      return {
        name: parts[0] || line,
        type: parts[1] || "",
        constraints,
      };
    });
}

function parseStyle(styleJson: string): { width?: number; height?: number } {
  try {
    return JSON.parse(styleJson || "{}");
  } catch {
    return {};
  }
}

function ConstraintBadge({ constraint }: { constraint: string }) {
  const upper = constraint.toUpperCase();
  let color = "bg-zinc-700 text-zinc-400";
  if (upper === "PK") color = "bg-amber-900/60 text-amber-300";
  else if (upper === "FK") color = "bg-blue-900/60 text-blue-300";
  else if (upper === "NOT NULL") color = "bg-red-900/40 text-red-400";
  else if (upper === "UNIQUE") color = "bg-purple-900/40 text-purple-400";

  return (
    <span className={`text-[8px] px-1 py-0.5 rounded ${color} font-medium`}>
      {upper}
    </span>
  );
}

// Row height must match the actual rendered row height for handle positioning
const HEADER_HEIGHT = 30; // header bar height in px
const ROW_HEIGHT = 24;    // each attribute row height in px

export const ERDNode = memo(function ERDNode({ data }: NodeProps) {
  const { node, isSelected, onResizeEnd } = data as unknown as ERDNodeData;
  const skeleton = useSkeleton();
  const parsed = parseStyle(node.styleJson);
  const attributes = parseAttributes(node.description);
  const selectedRing = isSelected
    ? "ring-2 ring-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]"
    : "";

  const handleResizeEnd = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      onResizeEnd?.(node.id, Math.round(params.width), Math.round(params.height));
    },
    [node.id, onResizeEnd]
  );

  // Compute content height: header + attribute rows (or "No attributes" fallback)
  const contentHeight = attributes.length > 0
    ? HEADER_HEIGHT + attributes.length * ROW_HEIGHT
    : HEADER_HEIGHT + 30; // 30px for "No attributes" padding

  // Estimate content width from the widest attribute row
  // Each row: px-3 (24px) + name + gap (8px) + type + gap (8px) + flex spacer + constraints + px-3
  // Approximate char widths: name/type ~6.5px per char at 11px/10px font, constraint badge ~30-55px each
  const CHAR_WIDTH = 6.5;
  const ROW_PAD = 28; // px-3 each side + gaps
  const BADGE_WIDTHS: Record<string, number> = { PK: 24, FK: 24, "NOT NULL": 52, UNIQUE: 44 };
  const DEFAULT_BADGE_W = 36;

  let contentWidth = Math.max(node.label.length * 7 + 24, 180); // header label width minimum
  for (const attr of attributes) {
    const nameW = attr.name.length * CHAR_WIDTH;
    const typeW = attr.type ? attr.type.length * CHAR_WIDTH : 0;
    const badgesW = attr.constraints.reduce(
      (sum, c) => sum + (BADGE_WIDTHS[c.toUpperCase()] || DEFAULT_BADGE_W) + 2, 0
    );
    const rowW = ROW_PAD + nameW + typeW + badgesW + 16; // 16px for gap between type and badges
    contentWidth = Math.max(contentWidth, rowW);
  }

  const dimStyle: React.CSSProperties = {
    width: parsed.width || Math.ceil(contentWidth),
    height: parsed.height || contentHeight,
  };

  const hideText: React.CSSProperties = skeleton ? { visibility: "hidden" } : {};

  return (
    <div
      className={`rounded-lg border-2 border-sky-600 overflow-visible bg-zinc-900 ${selectedRing}`}
      style={{ minWidth: 180, ...dimStyle }}
    >
      <NodeResizer
        isVisible={isSelected}
        minWidth={140}
        minHeight={40}
        lineStyle={{ borderColor: "rgba(96,165,250,0.4)", borderWidth: 1 }}
        handleStyle={{ backgroundColor: "#60a5fa", width: 7, height: 7, borderRadius: 2, border: "none" }}
        onResizeEnd={handleResizeEnd}
      />

      {/* Fallback handles at top/bottom for edges without attribute targeting */}
      <Handle type="target" position={Position.Top} id="top" className="!bg-sky-500" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-sky-500" />

      {/* Per-attribute row handles — positioned absolutely on left/right edges */}
      {attributes.map((attr, i) => {
        const topOffset = HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;
        return (
          <div key={attr.name}>
            <Handle
              type="target"
              position={Position.Left}
              id={`attr-${attr.name}-left`}
              className="!bg-sky-400 !w-[6px] !h-[6px]"
              style={{ top: topOffset, left: -3 }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`attr-${attr.name}-right`}
              className="!bg-sky-400 !w-[6px] !h-[6px]"
              style={{ top: topOffset, right: -3 }}
            />
          </div>
        );
      })}

      {/* Header */}
      <div
        className="bg-sky-900/80 px-3 border-b border-sky-700 flex items-center justify-center"
        style={{ height: HEADER_HEIGHT, ...hideText }}
      >
        <div className="text-xs font-bold text-sky-100 text-center">{node.label}</div>
      </div>

      {/* Skeleton for header */}
      {skeleton && (
        <div className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none" style={{ height: HEADER_HEIGHT }}>
          <div className="h-2 rounded-sm opacity-40 bg-sky-300" style={{ width: "50%" }} />
        </div>
      )}

      {/* Attributes */}
      {attributes.length > 0 && (
        <div className="divide-y divide-zinc-800" style={hideText}>
          {attributes.map((attr, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 text-[11px] relative"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="text-zinc-200 flex-shrink-0">{attr.name}</span>
              {attr.type && (
                <span className="text-zinc-500 font-mono text-[10px]">{attr.type}</span>
              )}
              <span className="flex-1" />
              <span className="flex gap-0.5">
                {attr.constraints.map((c, j) => (
                  <ConstraintBadge key={j} constraint={c} />
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      {attributes.length === 0 && !skeleton && (
        <div className="px-3 py-2 text-[10px] text-zinc-600 italic text-center">
          No attributes
        </div>
      )}
    </div>
  );
});
