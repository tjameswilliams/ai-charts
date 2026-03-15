import { describe, it, expect, beforeEach } from "bun:test";
import { useStore } from "../../store";

describe("clipboard", () => {
  beforeEach(() => {
    // Reset store state directly
    useStore.setState({
      clipboard: null,
      selectedNodeId: null,
      selectedNodeIds: new Set<string>(),
      nodes: [
        { id: "n1", chartId: "c1", type: "process", label: "Node 1", description: "", positionX: 0, positionY: 0, styleJson: "{}", sourceRefId: null, confidence: 1, createdAt: "", updatedAt: "" },
        { id: "n2", chartId: "c1", type: "process", label: "Node 2", description: "", positionX: 200, positionY: 0, styleJson: "{}", sourceRefId: null, confidence: 1, createdAt: "", updatedAt: "" },
        { id: "n3", chartId: "c1", type: "process", label: "Node 3", description: "", positionX: 400, positionY: 0, styleJson: "{}", sourceRefId: null, confidence: 1, createdAt: "", updatedAt: "" },
      ],
      edges: [
        { id: "e1", chartId: "c1", fromNodeId: "n1", toNodeId: "n2", type: "default", label: "", condition: "", sourceRefId: null, confidence: 1, createdAt: "", updatedAt: "" },
        { id: "e2", chartId: "c1", fromNodeId: "n2", toNodeId: "n3", type: "default", label: "", condition: "", sourceRefId: null, confidence: 1, createdAt: "", updatedAt: "" },
      ],
    });
  });

  it("copySelection populates clipboard with correct nodes/edges", () => {
    useStore.setState({ selectedNodeIds: new Set(["n1", "n2"]) });
    useStore.getState().copySelection();
    const clip = useStore.getState().clipboard;
    expect(clip).not.toBeNull();
    expect(clip!.nodes).toHaveLength(2);
    expect(clip!.edges).toHaveLength(1); // e1 connects n1-n2, e2 has n3 which is not selected
  });

  it("edges not copied when only one endpoint selected", () => {
    useStore.setState({ selectedNodeIds: new Set(["n1"]) });
    useStore.getState().copySelection();
    const clip = useStore.getState().clipboard;
    expect(clip!.nodes).toHaveLength(1);
    expect(clip!.edges).toHaveLength(0);
  });

  it("empty selection results in null clipboard", () => {
    useStore.getState().copySelection();
    expect(useStore.getState().clipboard).toBeNull();
  });

  it("single node selection via selectedNodeId works", () => {
    useStore.setState({ selectedNodeId: "n1", selectedNodeIds: new Set() });
    useStore.getState().copySelection();
    const clip = useStore.getState().clipboard;
    expect(clip!.nodes).toHaveLength(1);
  });
});
