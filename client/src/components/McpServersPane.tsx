import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { McpServerConfig } from "../types";

export function McpServersPane() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; tools?: string[]; error?: string }>
  >({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadServers = async () => {
    const data = await api.mcpServers.list();
    setServers(data);
    setLoading(false);
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleDelete = async (id: string) => {
    await api.mcpServers.delete(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const updated = await api.mcpServers.update(id, { enabled });
    setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const handleTest = async (id: string) => {
    setTestResults((prev) => ({ ...prev, [id]: { success: false, error: "Testing..." } }));
    try {
      const result = await api.mcpServers.test(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      if (result.success) loadServers();
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, error: (err as Error).message },
      }));
    }
  };

  const handleReconnect = async (id: string) => {
    try {
      await api.mcpServers.reconnect(id);
      loadServers();
    } catch {
      // ignore
    }
  };

  if (loading) return <div className="p-6 text-zinc-500 text-sm">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">External MCP Servers</h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-2 py-1 text-xs text-blue-400 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
        >
          {showAdd ? "Cancel" : "+ Add Server"}
        </button>
      </div>

      {showAdd && (
        <AddServerForm
          onSaved={(server) => {
            setServers((prev) => [...prev, server]);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {servers.length === 0 && !showAdd && (
        <p className="text-zinc-600 text-xs">
          No MCP servers configured. Add one to give the LLM access to external tools.
        </p>
      )}

      {servers.map((server) => (
        <div key={server.id} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-2">
          {editingId === server.id ? (
            <EditServerForm
              server={server}
              onSaved={(updated) => {
                setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      server.connected ? "bg-green-500" : "bg-zinc-600"
                    }`}
                  />
                  <span className="text-sm font-medium text-zinc-200">{server.name}</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <span className="text-[10px] text-zinc-500">
                    {server.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    onChange={(e) => handleToggle(server.id, e.target.checked)}
                    className="accent-blue-500"
                  />
                </label>
              </div>

              <div className="text-[10px] text-zinc-500 font-mono">
                {server.command} {server.args.join(" ")}
              </div>

              {server.tools && server.tools.length > 0 && (
                <div className="text-[10px] text-zinc-500">
                  {server.tools.length} tool{server.tools.length !== 1 ? "s" : ""} available
                </div>
              )}

              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={() => handleTest(server.id)}
                  className="px-2 py-1 text-[10px] text-zinc-300 bg-zinc-700 rounded hover:bg-zinc-600 transition-colors"
                >
                  Test
                </button>
                <button
                  onClick={() => handleReconnect(server.id)}
                  className="px-2 py-1 text-[10px] text-zinc-300 bg-zinc-700 rounded hover:bg-zinc-600 transition-colors"
                >
                  Reconnect
                </button>
                <button
                  onClick={() => setEditingId(server.id)}
                  className="px-2 py-1 text-[10px] text-zinc-300 bg-zinc-700 rounded hover:bg-zinc-600 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(server.id)}
                  className="px-2 py-1 text-[10px] text-red-400 bg-zinc-700 rounded hover:bg-zinc-600 transition-colors"
                >
                  Delete
                </button>
              </div>

              {testResults[server.id] && (
                <div
                  className={`text-[10px] p-2 rounded ${
                    testResults[server.id].success
                      ? "bg-green-900/30 text-green-400"
                      : "bg-red-900/30 text-red-400"
                  }`}
                >
                  {testResults[server.id].success
                    ? `Connected! Tools: ${testResults[server.id].tools?.join(", ") || "none"}`
                    : testResults[server.id].error}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function AddServerForm({
  onSaved,
  onCancel,
}: {
  onSaved: (server: McpServerConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsStr, setArgsStr] = useState("");
  const [envStr, setEnvStr] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim() || !command.trim()) {
      setError("Name and command are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const args = argsStr
        .split("\n")
        .map((a) => a.trim())
        .filter(Boolean);
      const env: Record<string, string> = {};
      for (const line of envStr.split("\n")) {
        const eqIdx = line.indexOf("=");
        if (eqIdx > 0) {
          env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
        }
      }
      const server = await api.mcpServers.create({ name, command, args, env });
      onSaved(server);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 space-y-2">
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My MCP Server"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Command</label>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="npx"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Arguments (one per line)</label>
        <textarea
          value={argsStr}
          onChange={(e) => setArgsStr(e.target.value)}
          placeholder={"-y\n@modelcontextprotocol/server-example"}
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">
          Environment Variables (KEY=VALUE, one per line)
        </label>
        <textarea
          value={envStr}
          onChange={(e) => setEnvStr(e.target.value)}
          placeholder="API_KEY=sk-..."
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
      </div>
      {error && <div className="text-[10px] text-red-400">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function EditServerForm({
  server,
  onSaved,
  onCancel,
}: {
  server: McpServerConfig;
  onSaved: (server: McpServerConfig) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(server.name);
  const [command, setCommand] = useState(server.command);
  const [argsStr, setArgsStr] = useState(server.args.join("\n"));
  const [envStr, setEnvStr] = useState(
    Object.entries(server.env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim() || !command.trim()) {
      setError("Name and command are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const args = argsStr
        .split("\n")
        .map((a) => a.trim())
        .filter(Boolean);
      const env: Record<string, string> = {};
      for (const line of envStr.split("\n")) {
        const eqIdx = line.indexOf("=");
        if (eqIdx > 0) {
          env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim();
        }
      }
      const updated = await api.mcpServers.update(server.id, { name, command, args, env });
      onSaved(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Command</label>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Arguments (one per line)</label>
        <textarea
          value={argsStr}
          onChange={(e) => setArgsStr(e.target.value)}
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
      </div>
      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">
          Environment Variables (KEY=VALUE, one per line)
        </label>
        <textarea
          value={envStr}
          onChange={(e) => setEnvStr(e.target.value)}
          rows={2}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
      </div>
      {error && <div className="text-[10px] text-red-400">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-zinc-400 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
