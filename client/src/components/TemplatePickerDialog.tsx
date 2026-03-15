import { useState, useEffect } from "react";
import { api } from "../api/client";

interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  chartType: string;
}

interface TemplatePickerDialogProps {
  chartType: string;
  onSelect: (templateId: string | null) => void;
  onCancel: () => void;
}

export function TemplatePickerDialog({ chartType, onSelect, onCancel }: TemplatePickerDialogProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.templates.list().then((all) => {
      setTemplates(all.filter((t) => t.chartType === chartType));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [chartType]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[560px] max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Choose a Template</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Start with a pre-built diagram or create from scratch</p>
        </div>
        <div className="p-4 overflow-y-auto max-h-[50vh]">
          {loading ? (
            <div className="text-center py-8 text-zinc-500 text-sm">Loading templates...</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Blank option always first */}
              <button
                onClick={() => onSelect(null)}
                className="text-left p-4 rounded-lg border-2 border-dashed border-zinc-700 hover:border-blue-500 hover:bg-blue-950/20 transition-colors group"
              >
                <div className="text-sm font-medium text-zinc-300 group-hover:text-blue-300">Blank Chart</div>
                <div className="text-xs text-zinc-500 mt-1">Start from scratch</div>
              </button>
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className="text-left p-4 rounded-lg border border-zinc-700 hover:border-blue-500 hover:bg-blue-950/20 transition-colors group"
                >
                  <div className="text-sm font-medium text-zinc-300 group-hover:text-blue-300">{t.name}</div>
                  <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{t.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-zinc-800 flex justify-end">
          <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
