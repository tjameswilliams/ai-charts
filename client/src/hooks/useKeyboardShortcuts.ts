import { useEffect, useCallback } from "react";

interface KeyboardShortcutOptions {
  // Node operations
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeIds: Set<string>;
  nodes: Array<{ id: string; positionX: number; positionY: number }>;
  gridSize: number;

  // Callbacks
  batchUpdatePositions: (positions: Array<{ id: string; x: number; y: number }>) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setSelectedNodeIds: (ids: Set<string>) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  deleteSelectedNodes: () => void;
  setEditingNodeId: (id: string | null) => void;
  setSearchOpen: (open: boolean) => void;
  setShortcutsHelpOpen: (open: boolean) => void;
  setContextMenu: (menu: null) => void;
  fitView: (options?: { nodes?: Array<{ id: string }>; duration?: number }) => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions) {
  const {
    selectedNodeId,
    selectedEdgeId,
    selectedNodeIds,
    nodes,
    gridSize,
    batchUpdatePositions,
    selectNode,
    selectEdge,
    setSelectedNodeIds,
    deleteNode,
    deleteEdge,
    deleteSelectedNodes,
    setEditingNodeId,
    setSearchOpen,
    setShortcutsHelpOpen,
    setContextMenu,
    fitView,
    copySelection,
    pasteClipboard,
    duplicateSelection,
  } = options;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;

      const isMod = e.metaKey || e.ctrlKey;

      // Shortcuts that work even in editable fields
      if (e.key === "Escape") {
        if (isEditable) return; // Let InlineEditor handle its own Escape
        selectNode(null);
        selectEdge(null);
        setSelectedNodeIds(new Set());
        setContextMenu(null);
        setSearchOpen(false);
        return;
      }

      // Block shortcuts when typing in inputs
      if (isEditable) return;

      // Cmd+F: Search
      if (isMod && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Cmd+A: Select all
      if (isMod && e.key === "a" && !e.shiftKey) {
        e.preventDefault();
        setSelectedNodeIds(new Set(nodes.map((n) => n.id)));
        return;
      }

      // Cmd+Shift+A: Deselect all
      if (isMod && e.key === "a" && e.shiftKey) {
        e.preventDefault();
        setSelectedNodeIds(new Set());
        selectNode(null);
        return;
      }

      // Cmd+C: Copy
      if (isMod && e.key === "c") {
        e.preventDefault();
        copySelection();
        return;
      }

      // Cmd+V: Paste
      if (isMod && e.key === "v") {
        e.preventDefault();
        pasteClipboard();
        return;
      }

      // Cmd+D: Duplicate
      if (isMod && e.key === "d") {
        e.preventDefault();
        duplicateSelection();
        return;
      }

      // Cmd+/: Toggle keyboard shortcuts help
      if (isMod && e.key === "/") {
        e.preventDefault();
        setShortcutsHelpOpen(true);
        return;
      }

      // F2: Edit selected node
      if (e.key === "F2" && selectedNodeId) {
        e.preventDefault();
        setEditingNodeId(selectedNodeId);
        return;
      }

      // Delete/Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.size > 0) {
          e.preventDefault();
          deleteSelectedNodes();
        } else if (selectedNodeId) {
          e.preventDefault();
          deleteNode(selectedNodeId);
        } else if (selectedEdgeId) {
          e.preventDefault();
          deleteEdge(selectedEdgeId);
        }
        return;
      }

      // Arrow keys: nudge selected nodes
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        const nodesToNudge: string[] = [];
        if (selectedNodeIds.size > 0) {
          nodesToNudge.push(...selectedNodeIds);
        } else if (selectedNodeId) {
          nodesToNudge.push(selectedNodeId);
        }
        if (nodesToNudge.length === 0) return;

        e.preventDefault();
        const step = e.shiftKey ? gridSize * 5 : gridSize;
        const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;

        const positions = nodesToNudge.map((id) => {
          const node = nodes.find((n) => n.id === id);
          return {
            id,
            x: (node?.positionX ?? 0) + dx,
            y: (node?.positionY ?? 0) + dy,
          };
        });
        batchUpdatePositions(positions);
        return;
      }

      // Tab/Shift+Tab: cycle selection
      if (e.key === "Tab") {
        if (nodes.length === 0) return;
        e.preventDefault();
        const currentIdx = selectedNodeId ? nodes.findIndex((n) => n.id === selectedNodeId) : -1;
        const nextIdx = e.shiftKey
          ? (currentIdx - 1 + nodes.length) % nodes.length
          : (currentIdx + 1) % nodes.length;
        const nextNode = nodes[nextIdx];
        selectNode(nextNode.id);
        fitView({ nodes: [{ id: nextNode.id }], duration: 200 });
        return;
      }
    },
    [
      selectedNodeId, selectedEdgeId, selectedNodeIds, nodes, gridSize,
      batchUpdatePositions, selectNode, selectEdge, setSelectedNodeIds,
      deleteNode, deleteEdge, deleteSelectedNodes, setEditingNodeId,
      setSearchOpen, setShortcutsHelpOpen, setContextMenu, fitView,
      copySelection, pasteClipboard, duplicateSelection,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
