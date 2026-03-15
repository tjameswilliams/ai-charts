import { useEffect } from "react";

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

const shortcuts = [
  { category: "Navigation", items: [
    { keys: "Tab / Shift+Tab", desc: "Cycle through nodes" },
    { keys: "Arrow Keys", desc: "Nudge selected nodes" },
    { keys: "Shift + Arrow", desc: "Nudge 5x distance" },
    { keys: "Cmd+F", desc: "Search nodes" },
  ]},
  { category: "Selection", items: [
    { keys: "Cmd+A", desc: "Select all nodes" },
    { keys: "Cmd+Shift+A", desc: "Deselect all" },
    { keys: "Escape", desc: "Clear selection" },
    { keys: "Shift+Click", desc: "Multi-select" },
    { keys: "Alt+Drag", desc: "Box select" },
  ]},
  { category: "Editing", items: [
    { keys: "F2 / Double-click", desc: "Edit node label" },
    { keys: "Delete / Backspace", desc: "Delete selection" },
    { keys: "Cmd+C", desc: "Copy selection" },
    { keys: "Cmd+V", desc: "Paste" },
    { keys: "Cmd+D", desc: "Duplicate" },
  ]},
  { category: "History", items: [
    { keys: "Cmd+Z", desc: "Undo" },
    { keys: "Cmd+Shift+Z", desc: "Redo" },
  ]},
  { category: "View", items: [
    { keys: "Cmd+/", desc: "Toggle this help" },
  ]},
];

export function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[480px] max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[55vh] space-y-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">
                {section.category}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <div key={item.keys} className="flex items-center justify-between py-1">
                    <span className="text-xs text-zinc-400">{item.desc}</span>
                    <kbd className="text-[10px] font-mono bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-300">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
