import { useState } from "react";
import { useStore } from "../store";
import { SettingsDialog } from "./SettingsDialog";
import { ExportDialog } from "./export/ExportDialog";

export function Toolbar() {
  const project = useStore((s) => s.project);
  const activeChart = useStore((s) => s.activeChart);
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);

  return (
    <>
      <div className="h-10 px-3 flex items-center justify-between bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-zinc-300">AI Charts</span>
          {project && (
            <span className="text-xs text-zinc-500">
              {project.name}
              {activeChart && <> / {activeChart.title}</>}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeChart && (
            <button
              onClick={() => setShowExport(true)}
              className="text-xs px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              Export
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="text-xs px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            Settings
          </button>
        </div>
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </>
  );
}
