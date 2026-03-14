import { useState, useEffect } from "react";
import { api } from "../api/client";
import { SetupPane } from "./SetupPane";
import { McpServersPane } from "./McpServersPane";

interface Props {
  onClose: () => void;
}

type Tab = "llm" | "mcp" | "mcp-clients";

export function SettingsDialog({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("llm");
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.settings.get().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    await api.settings.update(settings as Record<string, string>);
    onClose();
  };

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return null;

  const fields = [
    { key: "apiBaseUrl", label: "API Base URL", placeholder: "http://localhost:11434/v1" },
    { key: "apiKey", label: "API Key", placeholder: "ollama", type: "password" },
    { key: "model", label: "Model", placeholder: "llama3.2" },
    { key: "temperature", label: "Temperature", placeholder: "0.7" },
    { key: "maxTokens", label: "Max Tokens", placeholder: "2048" },
    { key: "contextWindow", label: "Context Window (override)", placeholder: "auto-detected" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-[540px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab bar */}
        <div className="flex border-b border-zinc-700">
          <button
            onClick={() => setTab("llm")}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "llm"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            LLM Settings
          </button>
          <button
            onClick={() => setTab("mcp")}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "mcp"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            MCP Setup
          </button>
          <button
            onClick={() => setTab("mcp-clients")}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "mcp-clients"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            MCP Clients
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "llm" ? (
            <div className="p-6">
              <div className="space-y-3">
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="text-[10px] text-zinc-500 block mb-1">{f.label}</label>
                    <input
                      type={f.type || "text"}
                      value={settings[f.key] || ""}
                      onChange={(e) => update(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-500 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          ) : tab === "mcp" ? (
            <SetupPane />
          ) : (
            <McpServersPane />
          )}
        </div>
      </div>
    </div>
  );
}
