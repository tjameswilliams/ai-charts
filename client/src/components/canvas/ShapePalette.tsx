import { useState, useCallback } from "react";
import { useChartTypeConfig } from "../../lib/chartTypeConfig";

export function ShapePalette() {
  const [collapsed, setCollapsed] = useState(false);
  const config = useChartTypeConfig();

  const onDragStart = useCallback(
    (e: React.DragEvent, nodeType: string, label: string) => {
      e.dataTransfer.setData("application/reactflow", JSON.stringify({ type: nodeType, label }));
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  return (
    <div className="absolute top-14 left-3 z-10">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="bg-zinc-800/90 backdrop-blur border border-zinc-700 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
        title={collapsed ? "Show shape palette" : "Hide shape palette"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      </button>
      {!collapsed && (
        <div className="mt-1.5 bg-zinc-800/95 backdrop-blur border border-zinc-700 rounded-lg p-2 w-40 max-h-[60vh] overflow-y-auto">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-1.5 px-1">
            Drag to canvas
          </div>
          {config.nodeTypes.map((item) => (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type, item.label)}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab hover:bg-zinc-700/50 transition-colors text-xs text-zinc-300 active:cursor-grabbing"
            >
              <div className="w-3 h-3 rounded-sm border border-zinc-600 bg-zinc-700 shrink-0" />
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
