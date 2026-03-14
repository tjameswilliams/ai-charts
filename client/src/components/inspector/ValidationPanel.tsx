import { useState } from "react";
import { useStore } from "../../store";
import { api } from "../../api/client";
import type { ValidationIssue } from "../../types";

export function ValidationPanel() {
  const activeChart = useStore((s) => s.activeChart);
  const selectNode = useStore((s) => s.selectNode);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [loading, setLoading] = useState(false);

  const runValidation = async () => {
    if (!activeChart) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "validate" }],
          mode: "builder",
          projectId: activeChart.projectId || null,
          chartId: activeChart.id,
        }),
      });
      // For simple validation, just use the markdown export parse
      // Actually use a direct validation call
      const data = await api.exports.markdown(activeChart.id);
      // Parse validation issues from markdown
      const lines = data.content.split("\n");
      const found: ValidationIssue[] = [];
      let inValidation = false;
      for (const line of lines) {
        if (line.includes("## Validation Issues")) {
          inValidation = true;
          continue;
        }
        if (inValidation && line.startsWith("## ")) break;
        if (inValidation && line.startsWith("- [")) {
          const isError = line.includes("[X]");
          const msg = line.replace(/- \[.\] /, "");
          found.push({
            type: isError ? "error" : "warning",
            code: "validation",
            message: msg,
          });
        }
      }
      setIssues(found);
    } catch {
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Validation</h3>
        <button
          onClick={runValidation}
          disabled={!activeChart || loading}
          className="text-[10px] px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Running..." : "Run"}
        </button>
      </div>

      {issues.length === 0 && !loading && (
        <p className="text-xs text-zinc-600">No issues found. Click Run to validate.</p>
      )}

      {issues.map((issue, i) => (
        <div
          key={i}
          onClick={() => issue.nodeId && selectNode(issue.nodeId)}
          className={`text-xs px-2 py-1.5 rounded cursor-pointer transition-colors ${
            issue.type === "error"
              ? "bg-red-900/30 text-red-300 hover:bg-red-900/50"
              : "bg-amber-900/30 text-amber-300 hover:bg-amber-900/50"
          }`}
        >
          {issue.message}
        </div>
      ))}
    </div>
  );
}
