import { useState } from "react";
import { useStore } from "../../store";
import { api } from "../../api/client";

export function SourceMaterialList() {
  const project = useStore((s) => s.project);
  const sourceMaterials = useStore((s) => s.sourceMaterials);
  const loadSourceMaterials = useStore((s) => s.loadSourceMaterials);
  const [isOpen, setIsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  if (!project) return null;

  const handleAdd = async () => {
    if (!name.trim() || !content.trim()) return;
    await api.sources.createMaterial(project.id, {
      name: name.trim(),
      content: content.trim(),
      type: "paste",
    });
    setName("");
    setContent("");
    setAdding(false);
    loadSourceMaterials();
  };

  const handleDelete = async (id: string) => {
    await api.sources.deleteMaterial(id);
    loadSourceMaterials();
  };

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>Source Materials ({sourceMaterials.length})</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-3 pb-2 space-y-1">
          {sourceMaterials.map((m) => (
            <div key={m.id} className="flex items-center justify-between group rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800">
              <span className="text-xs truncate">{m.name}</span>
              <button
                onClick={() => handleDelete(m.id)}
                className="text-[10px] text-red-400/0 group-hover:text-red-400/70 hover:!text-red-300"
              >
                x
              </button>
            </div>
          ))}
          {adding ? (
            <div className="space-y-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste content..."
                rows={4}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none resize-none"
              />
              <div className="flex gap-1">
                <button onClick={handleAdd} className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded">Save</button>
                <button onClick={() => setAdding(false)} className="text-[10px] px-2 py-1 bg-zinc-700 text-zinc-300 rounded">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full text-[10px] px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            >
              + Add Material
            </button>
          )}
        </div>
      )}
    </div>
  );
}
