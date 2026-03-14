import { useStore } from "../../store";

export function ChartEditor() {
  const activeChart = useStore((s) => s.activeChart);
  const updateChart = useStore((s) => s.updateChart);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);

  if (!activeChart) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Chart</h3>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Title</label>
        <input
          value={activeChart.title}
          onChange={(e) => updateChart(activeChart.id, { title: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Description</label>
        <textarea
          value={activeChart.description}
          onChange={(e) => updateChart(activeChart.id, { description: e.target.value })}
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Audience</label>
        <input
          value={activeChart.audience}
          onChange={(e) => updateChart(activeChart.id, { audience: e.target.value })}
          placeholder="e.g. Engineering team, Product managers"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Status</label>
        <select
          value={activeChart.status}
          onChange={(e) => updateChart(activeChart.id, { status: e.target.value as "draft" | "review" | "final" })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="final">Final</option>
        </select>
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Chart Type</label>
        <div className="text-sm text-zinc-200 capitalize bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5">
          {activeChart.chartType || "flowchart"}
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
        {nodes.length} nodes, {edges.length} edges
      </div>
    </div>
  );
}
