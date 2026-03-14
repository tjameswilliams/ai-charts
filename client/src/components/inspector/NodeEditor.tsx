import { useCallback, useRef, useState } from "react";
import { useStore } from "../../store";
import { MarkdownEditor } from "./MarkdownEditor";
import { useChartTypeConfig } from "../../lib/chartTypeConfig";
import type { NodeType } from "../../types";

export function NodeEditor() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNode = useStore((s) => s.updateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const chartTypeConfig = useChartTypeConfig();
  const chartType = useStore((s) => s.activeChart?.chartType);
  const nodeTypeOptions = chartTypeConfig.nodeTypes.map((n) => ({ value: n.type as NodeType, label: n.label }));

  const node = nodes.find((n) => n.id === selectedNodeId);

  // Debounce description updates to avoid hammering the API on every keystroke
  const handleDescriptionChange = useCallback(
    (md: string) => {
      if (!node) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateNode(node.id, { description: md });
      }, 400);
    },
    [node, updateNode]
  );

  if (!node) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Node</h3>
        <button
          onClick={() => deleteNode(node.id)}
          className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
        >
          Delete
        </button>
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Type</label>
        <select
          value={node.type}
          onChange={(e) => updateNode(node.id, { type: e.target.value as NodeType })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {nodeTypeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Label</label>
        <input
          value={node.label}
          onChange={(e) => updateNode(node.id, { label: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500 block mb-1">Description</label>
        <MarkdownEditor
          key={node.id}
          value={node.description}
          onChange={handleDescriptionChange}
          placeholder="Add a description..."
        />
      </div>

      {chartType === "erd" && node.type === "entity" && (
        <ERDAttributeEditor
          description={node.description}
          onChange={(desc) => updateNode(node.id, { description: desc })}
        />
      )}

      <div className="text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
        ID: {node.id}
        {node.confidence < 1.0 && (
          <span className="ml-2 text-amber-500">Confidence: {(node.confidence * 100).toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}

function ERDAttributeEditor({ description, onChange }: { description: string; onChange: (desc: string) => void }) {
  const parseAttrs = (desc: string) => {
    if (!desc) return [];
    return desc.split("\n").filter(Boolean).map((line) => {
      const bracketMatch = line.match(/\[([^\]]+)\]/);
      const constraints = bracketMatch ? bracketMatch[1] : "";
      const withoutBrackets = line.replace(/\[.*?\]/, "").trim();
      const parts = withoutBrackets.split(":").map((p) => p.trim());
      return { name: parts[0] || "", type: parts[1] || "", constraints };
    });
  };

  const [attrs, setAttrs] = useState(parseAttrs(description));

  const serialize = (a: typeof attrs) =>
    a.map((r) => `${r.name}${r.type ? " : " + r.type : ""}${r.constraints ? " [" + r.constraints + "]" : ""}`).join("\n");

  const update = (i: number, field: string, value: string) => {
    const next = [...attrs];
    next[i] = { ...next[i], [field]: value };
    setAttrs(next);
    onChange(serialize(next));
  };

  const addRow = () => {
    const next = [...attrs, { name: "", type: "", constraints: "" }];
    setAttrs(next);
    onChange(serialize(next));
  };

  const removeRow = (i: number) => {
    const next = attrs.filter((_, j) => j !== i);
    setAttrs(next);
    onChange(serialize(next));
  };

  return (
    <div>
      <label className="text-[10px] text-zinc-500 block mb-1">Attributes</label>
      <div className="space-y-1">
        {attrs.map((attr, i) => (
          <div key={i} className="flex gap-1 items-center">
            <input
              value={attr.name}
              onChange={(e) => update(i, "name", e.target.value)}
              placeholder="name"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              value={attr.type}
              onChange={(e) => update(i, "type", e.target.value)}
              placeholder="type"
              className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              value={attr.constraints}
              onChange={(e) => update(i, "constraints", e.target.value)}
              placeholder="PK|FK"
              className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-300 text-xs px-1">x</button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="mt-1 text-[10px] text-blue-400 hover:text-blue-300">+ Add attribute</button>
    </div>
  );
}
