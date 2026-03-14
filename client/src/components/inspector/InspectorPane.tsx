import { useState } from "react";
import { useStore } from "../../store";
import { NodeEditor } from "./NodeEditor";
import { EdgeEditor } from "./EdgeEditor";
import { GroupEditor } from "./GroupEditor";
import { ChartEditor } from "./ChartEditor";
import { ValidationPanel } from "./ValidationPanel";
import { SourcesPanel } from "./SourcesPanel";

type Tab = "properties" | "validation" | "sources";

export function InspectorPane() {
  const [tab, setTab] = useState<Tab>("properties");
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const selectedGroupId = useStore((s) => s.selectedGroupId);
  const activeChart = useStore((s) => s.activeChart);

  const tabs: { id: Tab; label: string }[] = [
    { id: "properties", label: "Properties" },
    { id: "validation", label: "Validation" },
    { id: "sources", label: "Sources" },
  ];

  return (
    <div className="h-full flex flex-col bg-zinc-900 border-l border-zinc-800">
      <div className="flex border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.id
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "properties" && (
          <>
            {selectedGroupId ? (
              <GroupEditor />
            ) : selectedNodeId ? (
              <NodeEditor />
            ) : selectedEdgeId ? (
              <EdgeEditor />
            ) : activeChart ? (
              <ChartEditor />
            ) : (
              <div className="text-zinc-600 text-xs text-center mt-8">
                Select a node or edge to inspect
              </div>
            )}
          </>
        )}
        {tab === "validation" && <ValidationPanel />}
        {tab === "sources" && <SourcesPanel />}
      </div>
    </div>
  );
}
