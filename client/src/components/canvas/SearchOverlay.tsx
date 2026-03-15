import { useState, useEffect, useRef, useCallback } from "react";
import type { FlowNode } from "../../types";

interface SearchOverlayProps {
  nodes: FlowNode[];
  onSelect: (nodeId: string) => void;
  onClose: () => void;
}

export function SearchOverlay({ nodes, onSelect, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = query.trim()
    ? nodes.filter((n) => {
        const q = query.toLowerCase();
        return (
          n.label.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q)
        );
      })
    : [];

  const safeIndex = matches.length > 0 ? matchIndex % matches.length : 0;

  useEffect(() => {
    if (matches.length > 0) {
      onSelect(matches[safeIndex].id);
    }
  }, [safeIndex, matches.length]);

  // Reset index when query changes
  useEffect(() => {
    setMatchIndex(0);
  }, [query]);

  const cycleNext = useCallback(() => {
    if (matches.length > 0) {
      setMatchIndex((i) => (i + 1) % matches.length);
    }
  }, [matches.length]);

  const cyclePrev = useCallback(() => {
    if (matches.length > 0) {
      setMatchIndex((i) => (i - 1 + matches.length) % matches.length);
    }
  }, [matches.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      cycleNext();
    } else if (e.key === "Enter" && e.shiftKey) {
      cyclePrev();
    }
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 bg-zinc-800/95 backdrop-blur border border-zinc-700 rounded-lg shadow-xl flex items-center gap-2 px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search nodes..."
        className="bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none w-48"
      />
      {query && (
        <span className="text-xs text-zinc-400 whitespace-nowrap">
          {matches.length > 0 ? `${safeIndex + 1} of ${matches.length}` : "No results"}
        </span>
      )}
      <div className="flex gap-0.5">
        <button
          onClick={cyclePrev}
          disabled={matches.length === 0}
          className="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          title="Previous (Shift+Enter)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          onClick={cycleNext}
          disabled={matches.length === 0}
          className="p-0.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
          title="Next (Enter)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      <button
        onClick={onClose}
        className="p-0.5 text-zinc-400 hover:text-zinc-200"
        title="Close (Esc)"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
