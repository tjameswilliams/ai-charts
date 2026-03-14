import { useState, useEffect, useRef } from "react";
import { useStore } from "../../store";

export function ProjectList() {
  const projects = useStore((s) => s.projects);
  const project = useStore((s) => s.project);
  const loadProject = useStore((s) => s.loadProject);
  const createProject = useStore((s) => s.createProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const duplicateProject = useStore((s) => s.duplicateProject);
  const exportProject = useStore((s) => s.exportProject);
  const importProject = useStore((s) => s.importProject);
  const [isOpen, setIsOpen] = useState(true);
  const [newName, setNewName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Dismiss on click anywhere or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("click", dismiss);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", dismiss); window.removeEventListener("keydown", onKey); };
  }, [contextMenu]);

  const handleCreate = async () => {
    const name = newName.trim() || "New Project";
    const p = await createProject(name);
    setNewName("");
    await loadProject(p.id);
  };

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>Projects</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-3 pb-2 space-y-1">
          {projects.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between group rounded px-2 py-1 cursor-pointer transition-colors ${
                p.id === project?.id ? "bg-blue-900/30 text-blue-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              }`}
              onClick={() => loadProject(p.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, projectId: p.id });
              }}
            >
              <span className="text-xs truncate">{p.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}
                className="text-[10px] text-red-400/0 group-hover:text-red-400/70 hover:!text-red-300"
              >
                x
              </button>
            </div>
          ))}
          <div className="flex gap-1 mt-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="New project..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
            />
            <button onClick={handleCreate} className="text-[10px] px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600">
              +
            </button>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importProject(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className="w-full text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
          >
            Import Project
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
            onClick={() => { duplicateProject(contextMenu.projectId); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Duplicate
          </button>
          <button
            onClick={() => { exportProject(contextMenu.projectId); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Export
          </button>
          <button
            onClick={() => { deleteProject(contextMenu.projectId); setContextMenu(null); }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
