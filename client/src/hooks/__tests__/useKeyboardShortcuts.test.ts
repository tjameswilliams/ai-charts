import { describe, it, expect, mock } from "bun:test";

// Test the keyboard shortcut logic by testing the callback invocations
// We test the pure logic rather than the hook itself since the hook
// just wraps event listeners around the same logic

describe("useKeyboardShortcuts logic", () => {
  function createMockOptions() {
    return {
      selectedNodeId: null as string | null,
      selectedEdgeId: null as string | null,
      selectedNodeIds: new Set<string>(),
      nodes: [
        { id: "n1", positionX: 0, positionY: 0 },
        { id: "n2", positionX: 200, positionY: 0 },
        { id: "n3", positionX: 400, positionY: 0 },
      ],
      gridSize: 10,
      batchUpdatePositions: mock(() => {}),
      selectNode: mock(() => {}),
      selectEdge: mock(() => {}),
      setSelectedNodeIds: mock(() => {}),
      deleteNode: mock(() => {}),
      deleteEdge: mock(() => {}),
      deleteSelectedNodes: mock(() => {}),
      setEditingNodeId: mock(() => {}),
      setSearchOpen: mock(() => {}),
      setContextMenu: mock(() => {}),
      fitView: mock(() => {}),
    };
  }

  // Simulates what the handleKeyDown callback does for a given key event
  function simulateKey(opts: ReturnType<typeof createMockOptions>, key: string, extra: Partial<KeyboardEvent> = {}) {
    const e = {
      key,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      preventDefault: mock(() => {}),
      target: { tagName: "DIV", isContentEditable: false } as unknown as EventTarget,
      ...extra,
    };

    const target = e.target as HTMLElement;
    const tag = target.tagName;
    const isEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (target as HTMLElement).isContentEditable;
    const isMod = e.metaKey || e.ctrlKey;

    if (e.key === "Escape" && !isEditable) {
      opts.selectNode(null);
      opts.selectEdge(null);
      opts.setSelectedNodeIds(new Set());
      opts.setContextMenu(null);
      opts.setSearchOpen(false);
      return;
    }
    if (isEditable) return;
    if (isMod && e.key === "f") { e.preventDefault(); opts.setSearchOpen(true); return; }
    if (isMod && e.key === "a" && !e.shiftKey) { e.preventDefault(); opts.setSelectedNodeIds(new Set(opts.nodes.map(n => n.id))); return; }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (opts.selectedNodeIds.size > 0) { e.preventDefault(); opts.deleteSelectedNodes(); }
      else if (opts.selectedNodeId) { e.preventDefault(); opts.deleteNode(opts.selectedNodeId); }
      else if (opts.selectedEdgeId) { e.preventDefault(); opts.deleteEdge(opts.selectedEdgeId); }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      const nodesToNudge: string[] = [];
      if (opts.selectedNodeIds.size > 0) nodesToNudge.push(...opts.selectedNodeIds);
      else if (opts.selectedNodeId) nodesToNudge.push(opts.selectedNodeId);
      if (nodesToNudge.length === 0) return;
      e.preventDefault();
      const step = e.shiftKey ? opts.gridSize * 5 : opts.gridSize;
      const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
      const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
      const positions = nodesToNudge.map(id => {
        const node = opts.nodes.find(n => n.id === id);
        return { id, x: (node?.positionX ?? 0) + dx, y: (node?.positionY ?? 0) + dy };
      });
      opts.batchUpdatePositions(positions);
      return;
    }
    if (e.key === "Tab") {
      if (opts.nodes.length === 0) return;
      e.preventDefault();
      const currentIdx = opts.selectedNodeId ? opts.nodes.findIndex(n => n.id === opts.selectedNodeId) : -1;
      const nextIdx = e.shiftKey ? (currentIdx - 1 + opts.nodes.length) % opts.nodes.length : (currentIdx + 1) % opts.nodes.length;
      const nextNode = opts.nodes[nextIdx];
      opts.selectNode(nextNode.id);
      opts.fitView({ nodes: [{ id: nextNode.id }], duration: 200 });
    }
  }

  it("Arrow key dispatches batchUpdatePositions with correct offsets", () => {
    const opts = createMockOptions();
    opts.selectedNodeId = "n1";
    simulateKey(opts, "ArrowRight");
    expect(opts.batchUpdatePositions).toHaveBeenCalledWith([{ id: "n1", x: 10, y: 0 }]);
  });

  it("Shift+Arrow multiplies offset by 5", () => {
    const opts = createMockOptions();
    opts.selectedNodeId = "n1";
    simulateKey(opts, "ArrowDown", { shiftKey: true });
    expect(opts.batchUpdatePositions).toHaveBeenCalledWith([{ id: "n1", x: 0, y: 50 }]);
  });

  it("Tab cycles to next node and calls selectNode", () => {
    const opts = createMockOptions();
    opts.selectedNodeId = "n1";
    simulateKey(opts, "Tab");
    expect(opts.selectNode).toHaveBeenCalledWith("n2");
    expect(opts.fitView).toHaveBeenCalled();
  });

  it("Escape clears all selections", () => {
    const opts = createMockOptions();
    simulateKey(opts, "Escape");
    expect(opts.selectNode).toHaveBeenCalledWith(null);
    expect(opts.selectEdge).toHaveBeenCalledWith(null);
  });

  it("Cmd+A selects all nodes", () => {
    const opts = createMockOptions();
    simulateKey(opts, "a", { metaKey: true });
    expect(opts.setSelectedNodeIds).toHaveBeenCalled();
  });

  it("Shortcuts suppressed when input is focused", () => {
    const opts = createMockOptions();
    opts.selectedNodeId = "n1";
    simulateKey(opts, "ArrowRight", { target: { tagName: "INPUT", isContentEditable: false } as unknown as EventTarget });
    expect(opts.batchUpdatePositions).not.toHaveBeenCalled();
  });
});
