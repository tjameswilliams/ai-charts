import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { api } from "../../api/client";
import type { SourceReference } from "../../types";

export function SourcesPanel() {
  const activeChart = useStore((s) => s.activeChart);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const [refs, setRefs] = useState<SourceReference[]>([]);

  useEffect(() => {
    if (!activeChart) return;
    api.sources.listReferences(activeChart.id).then(setRefs).catch(() => {});
  }, [activeChart?.id]);

  const filteredRefs = refs.filter((r) => {
    // Show all if nothing selected
    if (!selectedNodeId && !selectedEdgeId) return true;
    return true; // Source refs don't have direct node/edge FK, so show all
  });

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Source References</h3>

      {filteredRefs.length === 0 && (
        <p className="text-xs text-zinc-600">No source references yet.</p>
      )}

      {filteredRefs.map((ref) => (
        <div key={ref.id} className="bg-zinc-800 rounded-lg p-2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              ref.type === "file" ? "bg-blue-900/50 text-blue-300" :
              ref.type === "document" ? "bg-purple-900/50 text-purple-300" :
              ref.type === "user_instruction" ? "bg-emerald-900/50 text-emerald-300" :
              "bg-zinc-700 text-zinc-400"
            }`}>
              {ref.type}
            </span>
            {ref.confidence < 1.0 && (
              <span className="text-amber-500">{(ref.confidence * 100).toFixed(0)}%</span>
            )}
          </div>
          {ref.filePath && (
            <div className="text-zinc-400 truncate">{ref.filePath}
              {ref.lineStart && `:${ref.lineStart}`}
              {ref.lineEnd && `-${ref.lineEnd}`}
            </div>
          )}
          {ref.contentSnippet && (
            <div className="text-zinc-500 truncate">{ref.contentSnippet}</div>
          )}
        </div>
      ))}
    </div>
  );
}
