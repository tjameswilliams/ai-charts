import { useStore } from "../../store";
import { useChartTypeConfig } from "../../lib/chartTypeConfig";
import type { EdgeType } from "../../types";

export function EdgeEditor() {
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const edges = useStore((s) => s.edges);
  const nodes = useStore((s) => s.nodes);
  const updateEdge = useStore((s) => s.updateEdge);
  const deleteEdge = useStore((s) => s.deleteEdge);
  const chartTypeConfig = useChartTypeConfig();
  const edgeTypeOptions = chartTypeConfig.edgeTypes.map((e) => ({ value: e.type as EdgeType, label: e.label }));

  const edge = edges.find((e) => e.id === selectedEdgeId);
  if (!edge) return null;

  const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
  const toNode = nodes.find((n) => n.id === edge.toNodeId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Edge</h3>
        <button
          onClick={() => deleteEdge(edge.id)}
          className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
        >
          Delete
        </button>
      </div>

      <div className="text-[10px] text-zinc-500">
        {fromNode?.label || "?"} &rarr; {toNode?.label || "?"}
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Type</label>
        <select
          value={edge.type}
          onChange={(e) => updateEdge(edge.id, { type: e.target.value as EdgeType })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {edgeTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Label</label>
        <input
          value={edge.label}
          onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
          placeholder="e.g. Yes, No, Error"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Condition</label>
        <input
          value={edge.condition}
          onChange={(e) => updateEdge(edge.id, { condition: e.target.value })}
          placeholder="e.g. status == 200"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
        ID: {edge.id}
      </div>
    </div>
  );
}
