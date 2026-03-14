import { useEffect, useCallback, useRef, useState } from "react";
import { useStore } from "./store";
import { SidebarPane } from "./components/sidebar/SidebarPane";
import { CanvasPane } from "./components/canvas/CanvasPane";
import { ChatPane } from "./components/chat/ChatPane";
import { InspectorPane } from "./components/inspector/InspectorPane";
import { Toolbar } from "./components/Toolbar";
import { ResizeHandle } from "./components/ResizeHandle";
import { useResizablePanes } from "./hooks/useResizablePanes";

function parseHash(): { projectId?: string; chartId?: string } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return {};
  const [projectId, chartId] = hash.split("/");
  return { projectId: projectId || undefined, chartId: chartId || undefined };
}

export default function App() {
  const project = useStore((s) => s.project);
  const loadProjects = useStore((s) => s.loadProjects);
  const loadProject = useStore((s) => s.loadProject);
  const projects = useStore((s) => s.projects);
  const activeChart = useStore((s) => s.activeChart);
  const selectChart = useStore((s) => s.selectChart);
  const setChatMode = useStore((s) => s.setChatMode);
  const { widths, startDrag, onDrag, endDrag } = useResizablePanes();

  const [rightTab, setRightTab] = useState<"chat" | "inspector">("chat");
  const initializedRef = useRef(false);

  const startSidebarDrag = useCallback(
    (x: number) => startDrag("sidebar", x, 1),
    [startDrag]
  );
  const startChatDrag = useCallback(
    (x: number) => startDrag("chatInspector", x),
    [startDrag]
  );

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Once projects are loaded, restore from URL or fall back to first project
  useEffect(() => {
    if (initializedRef.current || projects.length === 0) return;
    initializedRef.current = true;

    const { projectId, chartId } = parseHash();

    const targetProject = projectId
      ? projects.find((p) => p.id === projectId)
      : projects[0];

    if (targetProject) {
      loadProject(targetProject.id).then(() => {
        if (chartId) {
          selectChart(chartId);
        }
      });
    }
  }, [projects, loadProject, selectChart]);

  // Sync URL hash when project or chart changes
  useEffect(() => {
    if (!project) return;
    const hash = activeChart
      ? `#${project.id}/${activeChart.id}`
      : `#${project.id}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [project, activeChart]);

  // Handle browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const { projectId, chartId } = parseHash();
      if (projectId && projectId !== project?.id) {
        loadProject(projectId).then(() => {
          if (chartId) selectChart(chartId);
        });
      } else if (chartId && chartId !== activeChart?.id) {
        selectChart(chartId);
      } else if (!chartId && activeChart) {
        selectChart(null);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [project, activeChart, loadProject, selectChart]);

  // Undo/redo keyboard shortcuts
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const isStreaming = useStore((s) => s.isStreaming);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (isStreaming) return;

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, isStreaming]);

  // Switch chat mode based on chart selection
  useEffect(() => {
    if (project && activeChart) {
      setChatMode("builder");
    }
  }, [project, activeChart, setChatMode]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div style={{ width: widths.sidebar }} className="shrink-0">
          <SidebarPane />
        </div>

        <ResizeHandle onDragStart={startSidebarDrag} onDrag={onDrag} onDragEnd={endDrag} />

        {/* Canvas */}
        <div className="flex-1 min-w-[200px]">
          <CanvasPane />
        </div>

        <ResizeHandle onDragStart={startChatDrag} onDrag={onDrag} onDragEnd={endDrag} />

        {/* Right Panel: Chat + Inspector tabs */}
        <div style={{ width: widths.chatInspector }} className="shrink-0 flex flex-col">
          <div className="flex border-b border-zinc-800 bg-zinc-900">
            <button
              onClick={() => setRightTab("chat")}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                rightTab === "chat"
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setRightTab("inspector")}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                rightTab === "inspector"
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Inspector
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === "chat" ? <ChatPane /> : <InspectorPane />}
          </div>
        </div>
      </div>
    </div>
  );
}
