import { useState, useEffect, useRef } from "react";
import { useStore } from "../../store";
import type { ChartType } from "../../types";

export function ChartList() {
  const charts = useStore((s) => s.charts);
  const activeChart = useStore((s) => s.activeChart);
  const selectChart = useStore((s) => s.selectChart);
  const createChart = useStore((s) => s.createChart);
  const deleteChart = useStore((s) => s.deleteChart);
  const duplicateChart = useStore((s) => s.duplicateChart);
  const exportChart = useStore((s) => s.exportChart);
  const importChart = useStore((s) => s.importChart);
  const project = useStore((s) => s.project);
  const [isOpen, setIsOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chartId: string } | null>(null);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  // Dismiss on click anywhere or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", dismiss); window.removeEventListener("keydown", onKey); };
  }, [contextMenu]);

  // Dismiss confirm modal on Escape
  useEffect(() => {
    if (!confirmDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmDelete(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDelete]);

  const requestDelete = (id: string) => {
    const chart = charts.find((c) => c.id === id);
    setConfirmDelete({ id, title: chart?.title || "Untitled" });
    setContextMenu(null);
  };

  const confirmAndDelete = async () => {
    if (!confirmDelete) return;
    await deleteChart(confirmDelete.id);
    setConfirmDelete(null);
  };

  if (!project) return null;

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>Charts</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-3 pb-2 space-y-1">
          {charts.map((c) => (
            <div
              key={c.id}
              className={`flex items-center justify-between group rounded px-2 py-1 cursor-pointer transition-colors ${
                c.id === activeChart?.id ? "bg-blue-900/30 text-blue-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              onClick={() => selectChart(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, chartId: c.id });
              }}
            >
              <span className="text-xs truncate flex items-center gap-1.5">
                {c.title}
                {c.chartType && c.chartType !== "flowchart" && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 uppercase font-medium flex-shrink-0">
                    {c.chartType === "erd" ? "ERD" : "Swim"}
                  </span>
                )}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); requestDelete(c.id); }}
                className="text-[10px] text-red-400/0 group-hover:text-red-400/70 hover:!text-red-300"
              >
                x
              </button>
            </div>
          ))}
          <div className="relative" ref={newMenuRef}>
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="w-full text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              + New Chart
            </button>
            {showNewMenu && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1">
                {([
                  { type: "flowchart" as ChartType, label: "Flowchart", icon: "⊞" },
                  { type: "erd" as ChartType, label: "ERD", icon: "⊟" },
                  { type: "swimlane" as ChartType, label: "Swimlane", icon: "☰" },
                ]).map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => {
                      createChart({ title: `New ${opt.label}`, chartType: opt.type });
                      setShowNewMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                  >
                    <span className="text-zinc-500">{opt.icon}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importChart(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className="w-full text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            Import Chart
          </button>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { duplicateChart(contextMenu.chartId); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={() => { exportChart(contextMenu.chartId); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Export
          </button>
          <button
            onClick={() => requestDelete(contextMenu.chartId)}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl p-5 w-[340px] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Delete chart?</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                This will permanently delete <span className="text-zinc-200 font-medium">"{confirmDelete.title}"</span> and all its nodes, edges, and groups. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-xs text-zinc-300 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndDelete}
                className="px-3 py-1.5 text-xs text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
