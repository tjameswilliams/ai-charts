import { useState } from "react";
import { useStore } from "../../store";
import { api } from "../../api/client";

export function RevisionList() {
  const activeChart = useStore((s) => s.activeChart);
  const revisions = useStore((s) => s.revisions);
  const loadRevisions = useStore((s) => s.loadRevisions);
  const loadAll = useStore((s) => s.loadAll);
  const [isOpen, setIsOpen] = useState(false);

  if (!activeChart) return null;

  const handleSnapshot = async () => {
    await api.revisions.create(activeChart.id, "Manual snapshot");
    loadRevisions();
  };

  const handleRestore = async (id: string) => {
    await api.revisions.restore(id);
    await loadAll();
  };

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) loadRevisions(); }}
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>Revisions ({revisions.length})</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-3 pb-2 space-y-1">
          {revisions.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800">
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate">{r.description || "Snapshot"}</div>
                <div className="text-[10px] text-zinc-600">{new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <button
                onClick={() => handleRestore(r.id)}
                className="text-[10px] text-blue-400 hover:text-blue-300 ml-2"
              >
                Restore
              </button>
            </div>
          ))}
          <button
            onClick={handleSnapshot}
            className="w-full text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            + Save Snapshot
          </button>
        </div>
      )}
    </div>
  );
}
