import { useStore } from "../../store";
import { useChartTypeConfig } from "../../lib/chartTypeConfig";

const presetColors = [
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#6b7280", // gray
];

export function GroupEditor() {
  const selectedGroupId = useStore((s) => s.selectedGroupId);
  const groups = useStore((s) => s.groups);
  const nodes = useStore((s) => s.nodes);
  const updateGroup = useStore((s) => s.updateGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);

  const chartTypeConfig = useChartTypeConfig();
  const group = groups.find((g) => g.id === selectedGroupId);
  if (!group) return null;

  const memberNodes = nodes.filter((n) => group.nodeIds.includes(n.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{chartTypeConfig.groupLabel}</h3>
        <button
          onClick={() => deleteGroup(group.id)}
          className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
        >
          Delete
        </button>
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Name</label>
        <input
          value={group.label}
          onChange={(e) => updateGroup(group.id, { label: e.target.value })}
          placeholder="Group name"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Description</label>
        <textarea
          value={group.description}
          onChange={(e) => updateGroup(group.id, { description: e.target.value })}
          placeholder="Optional description"
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Color</label>
        <div className="flex items-center gap-2 mb-2">
          <label className="relative w-6 h-6 rounded border border-zinc-600 cursor-pointer overflow-hidden">
            <div className="absolute inset-0" style={{ backgroundColor: group.color }} />
            <input
              type="color"
              value={group.color}
              onChange={(e) => updateGroup(group.id, { color: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
          <input
            type="text"
            value={group.color}
            onChange={(e) => updateGroup(group.id, { color: e.target.value })}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {presetColors.map((c) => (
            <button
              key={c}
              onClick={() => updateGroup(group.id, { color: c })}
              className={`w-5 h-5 rounded-sm border transition-all ${
                group.color === c
                  ? "border-white scale-110"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {memberNodes.length > 0 && (
        <div>
          <label className="text-[10px] text-zinc-500 block mb-1">
            Members ({memberNodes.length})
          </label>
          <div className="space-y-1">
            {memberNodes.map((n) => (
              <div
                key={n.id}
                className="text-[11px] text-zinc-400 bg-zinc-800 rounded px-2 py-1 truncate"
              >
                {n.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
        ID: {group.id}
      </div>
    </div>
  );
}
