import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type OnSelectionChangeParams,
  applyNodeChanges,
  useReactFlow,
  getNodesBounds,
  getViewportForBounds,
  ReactFlowProvider,
  SelectionMode,
  MarkerType,
  useStore as useRFStore,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toPng, toSvg } from "html-to-image";
import { useStore } from "../../store";
import { FlowchartNode } from "./FlowchartNode";
import { FlowchartEdge } from "./FlowchartEdge";
import { FlowchartGroup } from "./FlowchartGroup";
import { ERDNode, parseAttributes } from "./ERDNode";
import { ERDEdge } from "./ERDEdge";
import { SwimlaneLane } from "./SwimlaneLane";
import { autoLayout } from "../../lib/autoLayout";
import { api } from "../../api/client";
import { SkeletonContext } from "./SkeletonContext";
import { useChartTypeConfig } from "../../lib/chartTypeConfig";
import type { ChartType } from "../../types";

const EXPORT_PADDING = 50;

function CanvasPaneInner() {
  const storeNodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectNode = useStore((s) => s.selectNode);
  const selectEdge = useStore((s) => s.selectEdge);
  const updateNodePosition = useStore((s) => s.updateNodePosition);
  const updateNode = useStore((s) => s.updateNode);
  const createEdge = useStore((s) => s.createEdge);
  const createNode = useStore((s) => s.createNode);
  const activeChart = useStore((s) => s.activeChart);
  const batchUpdatePositions = useStore((s) => s.batchUpdatePositions);
  const loadAll = useStore((s) => s.loadAll);
  const setCanvasExportFn = useStore((s) => s.setCanvasExportFn);
  const selectedNodeIds = useStore((s) => s.selectedNodeIds);
  const setSelectedNodeIds = useStore((s) => s.setSelectedNodeIds);
  const deleteSelectedNodes = useStore((s) => s.deleteSelectedNodes);
  const deleteNode = useStore((s) => s.deleteNode);
  const deleteEdge = useStore((s) => s.deleteEdge);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const groups = useStore((s) => s.groups);
  const createGroup = useStore((s) => s.createGroup);
  const deleteGroup = useStore((s) => s.deleteGroup);
  const setGroupNodes = useStore((s) => s.setGroupNodes);
  const selectedGroupId = useStore((s) => s.selectedGroupId);
  const selectGroup = useStore((s) => s.selectGroup);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const undoDesc = useStore((s) => s.undoDesc);
  const redoDesc = useStore((s) => s.redoDesc);
  const undoAction = useStore((s) => s.undo);
  const redoAction = useStore((s) => s.redo);
  const { screenToFlowPosition, fitView, getNodes } = useReactFlow();
  // Only re-render when crossing the skeleton threshold, not on every zoom tick
  const isSkeleton = useRFStore((s) => s.transform[2] < 0.35);
  const chartTypeConfig = useChartTypeConfig();
  const chartType = (activeChart?.chartType || "flowchart") as ChartType;

  const nodeTypes = useMemo(() => {
    switch (chartType) {
      case "erd":       return { erd: ERDNode, group: FlowchartGroup } as Record<string, typeof FlowchartNode>;
      case "swimlane":  return { flowchart: FlowchartNode, group: SwimlaneLane } as Record<string, typeof FlowchartNode>;
      default:          return { flowchart: FlowchartNode, group: FlowchartGroup } as Record<string, typeof FlowchartNode>;
    }
  }, [chartType]);

  const edgeTypes = useMemo(() => {
    switch (chartType) {
      case "erd":  return { erd: ERDEdge } as Record<string, typeof FlowchartEdge>;
      default:     return { flowchart: FlowchartEdge } as Record<string, typeof FlowchartEdge>;
    }
  }, [chartType]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [exportingFlag, setExportingFlag] = useState(false);
  const [layouting, setLayouting] = useState(false);
  const layoutingRef = useRef(false);
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [altHeld, setAltHeld] = useState(false);

  // Track Alt/Option key for selection mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(true);
      if (e.key === "Escape") { setContextMenu(null); setResizingNodeId(null); }
      // Delete/Backspace to remove selected nodes or edges
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't delete if user is typing in an input
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(false);
    };
    // Reset if window loses focus while Alt is held
    const onBlur = () => setAltHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [selectedNodeIds, selectedNodeId, selectedEdgeId, deleteSelectedNodes, deleteNode, deleteEdge]);

  // Track ReactFlow selection changes (filter out group nodes)
  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const ids = new Set(selectedNodes.filter((n) => !n.id.startsWith("group-")).map((n) => n.id));
      setSelectedNodeIds(ids);
    },
    [setSelectedNodeIds]
  );

  // Local node state for fluid dragging — ReactFlow controls this directly
  const [localNodes, setLocalNodes] = useState<Node[]>([]);
  const prevStoreNodesRef = useRef(storeNodes);
  const prevGroupNodesRef = useRef<Node[]>([]);

  // Ref so the export closure can toggle skeleton off
  const setExportingRef = useRef(setExportingFlag);
  setExportingRef.current = setExportingFlag;

  // Register the canvas export function so ExportDialog can use it
  useEffect(() => {
    const filterUiElements = (node: HTMLElement) => {
      const cls = node.classList?.toString() ?? "";
      return (
        !cls.includes("react-flow__controls") &&
        !cls.includes("react-flow__minimap") &&
        !cls.includes("react-flow__attribution") &&
        !cls.includes("react-flow__background")
      );
    };

    const exportFn = async (format: "png" | "svg", crop: boolean, theme: "dark" | "light"): Promise<string> => {
      const nodes = getNodes();
      if (nodes.length === 0) throw new Error("No nodes to export");

      const el = document.querySelector<HTMLElement>(".react-flow__viewport");
      if (!el) throw new Error("Canvas not found");

      // Disable skeleton mode so real text renders in the export
      setExportingRef.current(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Apply light theme class if needed
      if (theme === "light") el.classList.add("export-light");

      const bgColor = theme === "light" ? "#ffffff" : "#09090b";
      const renderFn = format === "png" ? toPng : toSvg;

      try {
        if (crop) {
          const bounds = getNodesBounds(nodes);
          const pad = 40;
          const width = bounds.width + pad * 2;
          const height = bounds.height + pad * 2;

          return await renderFn(el, {
            backgroundColor: bgColor,
            width,
            height,
            quality: 1,
            pixelRatio: format === "png" ? 2 : 1,
            style: {
              width: `${width}px`,
              height: `${height}px`,
              transform: `translate(${-bounds.x + pad}px, ${-bounds.y + pad}px) scale(1)`,
            },
            filter: filterUiElements,
          });
        } else {
          const bounds = getNodesBounds(nodes);
          const width = bounds.width + EXPORT_PADDING * 2;
          const height = bounds.height + EXPORT_PADDING * 2;
          const viewport = getViewportForBounds(bounds, width, height, 0.5, 2, EXPORT_PADDING);

          return await renderFn(el, {
            backgroundColor: bgColor,
            width,
            height,
            quality: 1,
            pixelRatio: format === "png" ? 2 : 1,
            style: {
              width: `${width}px`,
              height: `${height}px`,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            },
            filter: filterUiElements,
          });
        }
      } finally {
        el.classList.remove("export-light");
        setExportingRef.current(false);
      }
    };

    setCanvasExportFn(exportFn);
    return () => setCanvasExportFn(null);
  }, [getNodes, setCanvasExportFn]);

  // Transient overrides during drag/resize (before server persists)
  const [groupOverrides, setGroupOverrides] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});

  const updateGroup = useStore((s) => s.updateGroup);

  // Parse group styleJson into bounds override
  function parseGroupStyle(styleJson: string): { x?: number; y?: number; w?: number; h?: number } | null {
    try {
      const p = JSON.parse(styleJson || "{}");
      if (p.x != null && p.y != null && p.w != null && p.h != null) return p;
      return null;
    } catch { return null; }
  }

  // Estimate the rendered size of a node (reads styleJson overrides, then content-based defaults)
  const getNodeDimensions = useCallback((node: typeof storeNodes[0]): { w: number; h: number } => {
    const parsed = (() => { try { return JSON.parse(node.styleJson || "{}"); } catch { return {}; } })();
    if (parsed.width && parsed.height) return { w: parsed.width, h: parsed.height };

    if (chartType === "erd") {
      // Match ERDNode auto-sizing logic
      const HEADER_HEIGHT = 30;
      const ROW_HEIGHT = 24;
      const CHAR_WIDTH = 6.5;
      const ROW_PAD = 28;
      const BADGE_WIDTHS: Record<string, number> = { PK: 24, FK: 24, "NOT NULL": 52, UNIQUE: 44 };
      const DEFAULT_BADGE_W = 36;

      const attrs = parseAttributes(node.description);
      const contentHeight = attrs.length > 0
        ? HEADER_HEIGHT + attrs.length * ROW_HEIGHT
        : HEADER_HEIGHT + 30;

      let contentWidth = Math.max(node.label.length * 7 + 24, 180);
      for (const attr of attrs) {
        const nameW = attr.name.length * CHAR_WIDTH;
        const typeW = attr.type ? attr.type.length * CHAR_WIDTH : 0;
        const badgesW = attr.constraints.reduce(
          (sum, c) => sum + (BADGE_WIDTHS[c.toUpperCase()] || DEFAULT_BADGE_W) + 2, 0
        );
        const rowW = ROW_PAD + nameW + typeW + badgesW + 16;
        contentWidth = Math.max(contentWidth, rowW);
      }

      return {
        w: parsed.width || Math.ceil(contentWidth),
        h: parsed.height || contentHeight,
      };
    }

    return { w: parsed.width || 160, h: parsed.height || 60 };
  }, [chartType]);

  // When a group is resized, persist bounds and update membership
  const onGroupResizeEnd = useCallback(
    (groupId: string, x: number, y: number, width: number, height: number) => {
      const bounds = { x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height) };
      setGroupOverrides((prev) => ({ ...prev, [groupId]: bounds }));
      // Persist to server
      updateGroup(groupId, { styleJson: JSON.stringify(bounds) });
      // Update membership based on enclosed nodes
      const enclosed = storeNodes.filter((n) => {
        const dims = getNodeDimensions(n);
        const cx = n.positionX + dims.w / 2;
        const cy = n.positionY + dims.h / 2;
        return cx >= x && cx <= x + width && cy >= y && cy <= y + height;
      });
      setGroupNodes(groupId, enclosed.map((n) => n.id));
    },
    [storeNodes, setGroupNodes, updateGroup, getNodeDimensions]
  );

  // Compute group bounding boxes (persisted styleJson > transient override > auto-compute)
  const groupNodes: Node[] = useMemo(() => {
    const PAD = 40;
    return groups.map((group) => {
      const persisted = parseGroupStyle(group.styleJson);
      const override = groupOverrides[group.id] || persisted;
      let x: number, y: number, w: number, h: number;
      if (override) {
        x = override.x; y = override.y; w = override.w; h = override.h;
      } else {
        const memberNodes = storeNodes.filter((n) => group.nodeIds.includes(n.id));
        x = 0; y = 0; w = 160; h = 80;
        if (memberNodes.length > 0) {
          const minX = Math.min(...memberNodes.map((n) => n.positionX));
          const minY = Math.min(...memberNodes.map((n) => n.positionY));
          const maxX = Math.max(...memberNodes.map((n) => {
            const dims = getNodeDimensions(n);
            return n.positionX + dims.w;
          }));
          const maxY = Math.max(...memberNodes.map((n) => {
            const dims = getNodeDimensions(n);
            return n.positionY + dims.h;
          }));
          x = minX - PAD;
          y = minY - PAD - 10;
          w = maxX - minX + PAD * 2;
          h = maxY - minY + PAD * 2 + 10;
        }
      }
      return {
        id: `group-${group.id}`,
        type: "group" as const,
        position: { x, y },
        style: { width: w, height: h, zIndex: -1 },
        data: { group, isSelected: group.id === selectedGroupId, onResizeEnd: onGroupResizeEnd },
        selectable: true,
        draggable: true,
        connectable: false,
      };
    });
  }, [groups, storeNodes, selectedGroupId, onGroupResizeEnd, groupOverrides, getNodeDimensions]);

  // Persist node resize to server
  const onNodeResizeEnd = useCallback(
    (id: string, width: number, height: number) => {
      const node = storeNodes.find((n) => n.id === id);
      if (!node) return;
      const existing = (() => { try { return JSON.parse(node.styleJson || "{}"); } catch { return {}; } })();
      updateNode(id, { styleJson: JSON.stringify({ ...existing, width, height }) });
    },
    [storeNodes, updateNode]
  );

  // Rebuild local nodes when store nodes change (not during drag)
  const flowNodes: Node[] = useMemo(() => {
    const built = storeNodes.map((node) => {
      const parsed = (() => { try { return JSON.parse(node.styleJson || "{}"); } catch { return {}; } })();
      const nodeStyle: React.CSSProperties = {};
      if (parsed.width) nodeStyle.width = parsed.width;
      if (parsed.height) nodeStyle.height = parsed.height;
      const rfNodeType = chartType === "erd" ? "erd" : "flowchart";
      return {
        id: node.id,
        type: rfNodeType as "flowchart",
        position: { x: node.positionX, y: node.positionY },
        selected: selectedNodeIds.has(node.id) || node.id === selectedNodeId || node.id === resizingNodeId,
        ...(Object.keys(nodeStyle).length > 0 ? { style: nodeStyle } : {}),
        data: {
          node,
          isSelected: selectedNodeIds.has(node.id) || node.id === selectedNodeId || node.id === resizingNodeId,
          onResizeEnd: onNodeResizeEnd,
        },
      };
    });
    const allNodes = [...groupNodes, ...built];
    // Update local nodes when store nodes or group data changes (not from our own drag)
    if (prevStoreNodesRef.current !== storeNodes || prevGroupNodesRef.current !== groupNodes) {
      prevStoreNodesRef.current = storeNodes;
      prevGroupNodesRef.current = groupNodes;
      setLocalNodes(allNodes);
    }
    return allNodes;
  }, [storeNodes, selectedNodeId, selectedNodeIds, groupNodes, onNodeResizeEnd, resizingNodeId]);

  // Use localNodes if they exist, otherwise flowNodes
  const displayNodes = localNodes.length > 0 ? localNodes : flowNodes;

  // Let ReactFlow manage node changes (drag, select) locally for fluid animation
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Skip processing during auto-layout to avoid corrupting state
      if (layoutingRef.current) return;
      setLocalNodes((nds) => {
        const current = nds.length > 0 ? nds : flowNodes;
        let updated = applyNodeChanges(changes, current);

        // If a group node moved, move its member nodes by the same delta from drag start
        const extraChanges: NodeChange[] = [];
        for (const change of changes) {
          if (change.type === "position" && change.position && change.id?.startsWith("group-")) {
            const groupId = change.id.replace("group-", "");
            const group = groups.find((g) => g.id === groupId);
            if (!group) continue;
            const start = groupDragStartRef.current[change.id];
            if (!start) continue;
            const dx = change.position.x - start.x;
            const dy = change.position.y - start.y;
            // Position members relative to their original positions (storeNodes)
            for (const nodeId of group.nodeIds) {
              const storeNode = storeNodes.find((sn) => sn.id === nodeId);
              if (storeNode) {
                extraChanges.push({
                  type: "position",
                  id: nodeId,
                  position: {
                    x: storeNode.positionX + dx,
                    y: storeNode.positionY + dy,
                  },
                });
              }
            }
          }
        }
        if (extraChanges.length > 0) {
          updated = applyNodeChanges(extraChanges, updated);
        }
        return updated;
      });
    },
    [flowNodes, groups, storeNodes]
  );

  // Build a map of node ID → set of attribute names for ERD handle validation
  const nodeAttrMap = useMemo(() => {
    if (chartType !== "erd") return null;
    const map = new Map<string, Set<string>>();
    for (const node of storeNodes) {
      const attrs = parseAttributes(node.description);
      map.set(node.id, new Set(attrs.map((a) => a.name)));
    }
    return map;
  }, [chartType, storeNodes]);

  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((edge) => {
        const rfEdgeType = chartType === "erd" ? "erd" : "flowchart";
        // For ERD edges, parse condition field for attribute-level handle targeting
        let sourceHandle: string | undefined;
        let targetHandle: string | undefined;
        if (chartType === "erd" && edge.condition && nodeAttrMap) {
          try {
            const handleInfo = JSON.parse(edge.condition);
            const sourceAttrs = nodeAttrMap.get(edge.fromNodeId);
            const targetAttrs = nodeAttrMap.get(edge.toNodeId);
            // Only set handle if the attribute actually exists on that node
            if (handleInfo.sourceAttr && sourceAttrs?.has(handleInfo.sourceAttr)) {
              sourceHandle = `attr-${handleInfo.sourceAttr}-right`;
            }
            if (handleInfo.targetAttr && targetAttrs?.has(handleInfo.targetAttr)) {
              targetHandle = `attr-${handleInfo.targetAttr}-left`;
            }
          } catch {
            // Not JSON — ignore
          }
        }
        return {
          id: edge.id,
          source: edge.fromNodeId,
          target: edge.toNodeId,
          type: rfEdgeType,
          data: { edge },
          ...(sourceHandle ? { sourceHandle } : {}),
          ...(targetHandle ? { targetHandle } : {}),
          ...(chartType !== "erd" ? { markerEnd: { type: MarkerType.ArrowClosed, color: "#71717a" } } : {}),
          style: { stroke: chartType === "erd" ? "#38bdf8" : "#71717a", strokeWidth: 2 },
        };
      }),
    [edges, chartType, nodeAttrMap]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id.startsWith("group-")) {
        selectGroup(node.id.replace("group-", ""));
      } else {
        selectNode(node.id);
      }
      if (node.id !== resizingNodeId) setResizingNodeId(null);
    },
    [selectNode, selectGroup, resizingNodeId]
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      selectEdge(edge.id);
      setResizingNodeId(null);
    },
    [selectEdge]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
    selectGroup(null);
    setContextMenu(null);
    setResizingNodeId(null);
  }, [selectNode, selectEdge, selectGroup]);

  // Track group drag start positions to compute delta for member nodes
  const groupDragStartRef = useRef<Record<string, { x: number; y: number }>>({});

  const onNodeDragStart = useCallback(
    (_: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
      const starts: Record<string, { x: number; y: number }> = {};
      for (const n of draggedNodes) {
        if (n.id.startsWith("group-")) {
          starts[n.id] = { x: n.position.x, y: n.position.y };
          // Lock group size override so groupNodes memo doesn't recompute from members
          const groupId = n.id.replace("group-", "");
          const style = n.style as { width?: number; height?: number } | undefined;
          setGroupOverrides((prev) => ({
            ...prev,
            [groupId]: {
              x: n.position.x,
              y: n.position.y,
              w: (style?.width as number) || 160,
              h: (style?.height as number) || 80,
            },
          }));
        }
      }
      groupDragStartRef.current = starts;
    },
    []
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, _node: Node, draggedNodes: Node[]) => {
      // Read final positions from localNodes (which reflect the drag)
      const currentNodes = localNodes.length > 0 ? localNodes : flowNodes;
      const positions: { id: string; x: number; y: number }[] = [];

      for (const n of draggedNodes) {
        if (n.id.startsWith("group-")) {
          const groupId = n.id.replace("group-", "");
          const group = groups.find((g) => g.id === groupId);
          if (!group) continue;
          // Persist group's new position/size so it doesn't snap back
          const groupNode = currentNodes.find((ln) => ln.id === n.id);
          if (groupNode) {
            const style = groupNode.style as { width?: number; height?: number } | undefined;
            const bounds = {
              x: Math.round(groupNode.position.x),
              y: Math.round(groupNode.position.y),
              w: Math.round((style?.width as number) || 160),
              h: Math.round((style?.height as number) || 80),
            };
            setGroupOverrides((prev) => ({ ...prev, [groupId]: bounds }));
            updateGroup(groupId, { styleJson: JSON.stringify(bounds) });
          }
          // Persist member node positions from localNodes
          for (const nodeId of group.nodeIds) {
            const localNode = currentNodes.find((ln) => ln.id === nodeId);
            if (localNode) {
              positions.push({ id: nodeId, x: localNode.position.x, y: localNode.position.y });
            }
          }
        } else {
          positions.push({ id: n.id, x: n.position.x, y: n.position.y });
        }
      }

      // Deduplicate (a node could be in multiple groups or also dragged directly)
      const seen = new Set<string>();
      const unique = positions.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      if (unique.length > 1) {
        batchUpdatePositions(unique);
      } else if (unique.length === 1) {
        updateNodePosition(unique[0].id, unique[0].x, unique[0].y);
      }
      groupDragStartRef.current = {};
    },
    [updateNodePosition, batchUpdatePositions, groups, localNodes, flowNodes]
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      // For ERD edges, capture which attribute handles were used
      let condition = "";
      if (chartType === "erd" && (connection.sourceHandle || connection.targetHandle)) {
        const handleInfo: Record<string, string> = {};
        // Handle IDs are like "attr-{name}-right" or "attr-{name}-left"
        const srcMatch = connection.sourceHandle?.match(/^attr-(.+)-(?:left|right)$/);
        const tgtMatch = connection.targetHandle?.match(/^attr-(.+)-(?:left|right)$/);
        if (srcMatch) handleInfo.sourceAttr = srcMatch[1];
        if (tgtMatch) handleInfo.targetAttr = tgtMatch[1];
        if (Object.keys(handleInfo).length > 0) condition = JSON.stringify(handleInfo);
      }
      await createEdge({
        fromNodeId: connection.source,
        toNodeId: connection.target,
        ...(condition ? { condition } : {}),
      });
    },
    [createEdge, chartType]
  );

  // Handle edge changes from ReactFlow (selection, removal)
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // Don't process edge removals during auto-layout — React Flow may fire
      // spurious remove changes when node positions change rapidly
      if (layoutingRef.current) return;
      for (const change of changes) {
        if (change.type === "remove") {
          deleteEdge(change.id);
        }
      }
    },
    [deleteEdge]
  );

  // Drag-to-disconnect: track the edge being reconnected
  const edgeReconnectSuccessful = useRef(false);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true;
      // Delete old edge and create new one with updated connection
      deleteEdge(oldEdge.id);
      if (newConnection.source && newConnection.target) {
        let condition = "";
        if (chartType === "erd" && (newConnection.sourceHandle || newConnection.targetHandle)) {
          const handleInfo: Record<string, string> = {};
          const srcMatch = newConnection.sourceHandle?.match(/^attr-(.+)-(?:left|right)$/);
          const tgtMatch = newConnection.targetHandle?.match(/^attr-(.+)-(?:left|right)$/);
          if (srcMatch) handleInfo.sourceAttr = srcMatch[1];
          if (tgtMatch) handleInfo.targetAttr = tgtMatch[1];
          if (Object.keys(handleInfo).length > 0) condition = JSON.stringify(handleInfo);
        }
        createEdge({
          fromNodeId: newConnection.source,
          toNodeId: newConnection.target,
          ...(condition ? { condition } : {}),
        });
      }
    },
    [deleteEdge, createEdge, chartType]
  );

  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      // If the reconnect was not successful (dropped on empty space), delete the edge
      if (!edgeReconnectSuccessful.current) {
        deleteEdge(edge.id);
      }
    },
    [deleteEdge]
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number; nodeId?: string } | null>(null);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!activeChart) return;
      const target = event.target as HTMLElement;
      const nodeEl = target.closest(".react-flow__node") as HTMLElement | null;
      if (nodeEl) {
        // Node right-click — extract node ID from data attribute
        const rfNodeId = nodeEl.getAttribute("data-id");
        if (rfNodeId && !rfNodeId.startsWith("group-")) {
          setContextMenu({ x: event.clientX, y: event.clientY, flowX: 0, flowY: 0, nodeId: rfNodeId });
          return;
        }
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({ x: event.clientX, y: event.clientY, flowX: position.x, flowY: position.y });
    },
    [activeChart, screenToFlowPosition]
  );

  const addNodeFromMenu = useCallback(
    async (type: string, label: string) => {
      if (!contextMenu) return;
      await createNode({
        type: type as never,
        label,
        positionX: contextMenu.flowX,
        positionY: contextMenu.flowY,
      });
      setContextMenu(null);
    },
    [contextMenu, createNode]
  );

  const handleAutoLayout = useCallback(async () => {
    if (storeNodes.length === 0) return;
    setLayouting(true);
    layoutingRef.current = true;
    try {
      const result = await autoLayout(storeNodes, edges, "DOWN", chartType, groups);
      await batchUpdatePositions(result.nodes);

      // Persist computed group/lane bounds when layout returns them
      if (result.groups && result.groups.length > 0) {
        const overrides: Record<string, { x: number; y: number; w: number; h: number }> = {};
        for (const gb of result.groups) {
          overrides[gb.id] = { x: gb.x, y: gb.y, w: gb.w, h: gb.h };
          await updateGroup(gb.id, { styleJson: JSON.stringify({ x: gb.x, y: gb.y, w: gb.w, h: gb.h }) });
        }
        setGroupOverrides(overrides);
      } else {
        setGroupOverrides({});
        // Clear persisted group bounds so they recompute from new positions
        for (const g of groups) {
          if (parseGroupStyle(g.styleJson)) {
            await updateGroup(g.id, { styleJson: "{}" });
          }
        }
      }

      // Reload all data from server to ensure consistent state
      await loadAll();
      // Reset local node state so display picks up fresh store data
      setLocalNodes([]);

      setTimeout(() => fitView({ duration: 300 }), 50);
    } finally {
      setLayouting(false);
      layoutingRef.current = false;
    }
  }, [storeNodes, edges, batchUpdatePositions, fitView, groups, updateGroup, chartType, loadAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChart) return;
    try {
      const { url } = await api.upload(file);
      await createNode({
        type: "image",
        label: file.name.replace(/\.[^.]+$/, ""),
        positionX: 100,
        positionY: 100,
        styleJson: JSON.stringify({ imageUrl: url, width: 300, height: 200 }),
      });
    } catch (err) {
      console.error("Image upload failed:", err);
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  }, [activeChart, createNode]);

  return (
    <div className="h-full w-full relative" onContextMenu={handleContextMenu} onClick={() => setContextMenu(null)}>
      {/* Selection toolbar */}
      {selectedNodeIds.size > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-zinc-800/95 backdrop-blur border border-zinc-700 rounded-lg px-3 py-1.5">
          <span className="text-xs text-zinc-300">
            {selectedNodeIds.size} node{selectedNodeIds.size !== 1 ? "s" : ""} selected
          </span>
          {selectedNodeIds.size >= 2 && (
            <button
              onClick={async () => {
                await createGroup("Group", [...selectedNodeIds]);
                setSelectedNodeIds(new Set());
              }}
              className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 hover:bg-blue-900/50 px-2 py-0.5 rounded transition-colors"
            >
              Group
            </button>
          )}
          <button
            onClick={() => deleteSelectedNodes()}
            className="text-xs text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 px-2 py-0.5 rounded transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => setSelectedNodeIds(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Group toolbar */}
      {selectedGroupId && selectedNodeIds.size === 0 && (() => {
        const group = groups.find((g) => g.id === selectedGroupId);
        if (!group) return null;
        return (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-zinc-800/95 backdrop-blur border border-zinc-700 rounded-lg px-3 py-1.5">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${group.color}30`, color: group.color }}>
              {group.label}
            </span>
            <button
              onClick={() => deleteGroup(group.id)}
              className="text-xs text-red-400 hover:text-red-300 bg-red-900/30 hover:bg-red-900/50 px-2 py-0.5 rounded transition-colors"
            >
              Delete Group
            </button>
            <button
              onClick={() => selectGroup(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear
            </button>
          </div>
        );
      })()}

      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button
          onClick={undoAction}
          disabled={!canUndo}
          title={undoDesc || "Undo (Cmd+Z)"}
          className="bg-zinc-800/90 backdrop-blur border border-zinc-700 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13" />
          </svg>
        </button>
        <button
          onClick={redoAction}
          disabled={!canRedo}
          title={redoDesc || "Redo (Cmd+Shift+Z)"}
          className="bg-zinc-800/90 backdrop-blur border border-zinc-700 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.69 3L21 13" />
          </svg>
        </button>
        <button
          onClick={handleAutoLayout}
          disabled={layouting || storeNodes.length === 0}
          title="Auto-layout"
          className="bg-zinc-800/90 backdrop-blur border border-zinc-700 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={layouting ? "animate-spin" : ""}>
            <rect x="1" y="1" width="4" height="4" rx="0.5" />
            <rect x="6" y="11" width="4" height="4" rx="0.5" />
            <rect x="11" y="1" width="4" height="4" rx="0.5" />
            <line x1="3" y1="5" x2="3" y2="8" />
            <line x1="3" y1="8" x2="8" y2="8" />
            <line x1="8" y1="8" x2="8" y2="11" />
            <line x1="13" y1="5" x2="13" y2="8" />
            <line x1="13" y1="8" x2="8" y2="8" />
          </svg>
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh"
          className="bg-zinc-800/90 backdrop-blur border border-zinc-700 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={refreshing ? "animate-spin" : ""}>
            <path d="M14 2v4h-4" />
            <path d="M2 14v-4h4" />
            <path d="M13.5 6A6 6 0 0 0 3.3 3.3L2 6" />
            <path d="M2.5 10a6 6 0 0 0 10.2 2.7L14 10" />
          </svg>
        </button>
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={!activeChart}
          title="Add image"
          className="bg-zinc-800/90 backdrop-blur border border-zinc-700 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,image/tiff"
          className="hidden"
          onChange={handleImageUpload}
        />
      </div>

      {!activeChart ? (
        <div className="h-full flex items-center justify-center text-zinc-600">
          <p>Select or create a chart to get started</p>
        </div>
      ) : (
        <SkeletonContext.Provider value={isSkeleton && !exportingFlag}>
          <ReactFlow
            nodes={displayNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onSelectionChange={onSelectionChange}
            selectionOnDrag={altHeld}
            selectionMode={SelectionMode.Partial}
            panOnDrag={!altHeld}
            multiSelectionKeyCode="Shift"
            deleteKeyCode={null}
            minZoom={0.05}
            maxZoom={2}
            fitView
            proOptions={{ hideAttribution: true }}
            className="bg-zinc-950"
          >
            <Background color="#27272a" gap={20} />
            <Controls className="!bg-zinc-800 !border-zinc-700 !rounded-lg [&>button]:!bg-zinc-800 [&>button]:!border-zinc-700 [&>button]:!text-zinc-300 [&>button:hover]:!bg-zinc-700" />
            <MiniMap
              className="!bg-zinc-900 !border-zinc-800"
              maskColor="rgba(0,0,0,0.6)"
              draggable
              zoomable
              pannable
            />
          </ReactFlow>
        </SkeletonContext.Provider>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.nodeId ? (() => {
            const node = storeNodes.find((n) => n.id === contextMenu.nodeId);
            if (!node) return null;
            const nodeGroup = groups.find((g) => g.nodeIds.includes(node.id));
            const nodeTypeItems = chartTypeConfig.nodeTypes;
            return (
              <>
                <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-medium truncate max-w-[200px]">
                  {node.label}
                </div>
                <button
                  onClick={() => { selectNode(node.id); setContextMenu(null); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  Edit in Inspector
                </button>
                <button
                  onClick={() => { setResizingNodeId(node.id); selectNode(node.id); setContextMenu(null); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                >
                  Resize
                </button>
                {nodeGroup && (
                  <button
                    onClick={() => {
                      setGroupNodes(nodeGroup.id, nodeGroup.nodeIds.filter((id) => id !== node.id));
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    Remove from <span className="text-zinc-400">{nodeGroup.label}</span>
                  </button>
                )}
                <div className="border-t border-zinc-700 my-1" />
                <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Change Type</div>
                {nodeTypeItems.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => {
                      updateNode(node.id, { type: item.type as never });
                      setContextMenu(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      node.type === item.type
                        ? "text-blue-400 bg-blue-900/20"
                        : "text-zinc-200 hover:bg-zinc-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
                <div className="border-t border-zinc-700 my-1" />
                <button
                  onClick={() => { deleteNode(node.id); setContextMenu(null); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30 transition-colors"
                >
                  Delete
                </button>
              </>
            );
          })() : (
            <>
              <div className="px-3 py-1 text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Add Node</div>
              {chartTypeConfig.nodeTypes.map((item) => (
                <button
                  key={item.type}
                  onClick={() => addNodeFromMenu(item.type, item.label)}
                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors flex items-center justify-between gap-4"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-zinc-500">{item.desc}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Selection mode hint */}
      {altHeld && selectedNodeIds.size === 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-blue-900/80 backdrop-blur border border-blue-700 rounded-lg px-3 py-1.5 pointer-events-none">
          <span className="text-xs text-blue-200">Drag to select nodes</span>
        </div>
      )}
    </div>
  );
}

export function CanvasPane() {
  return (
    <ReactFlowProvider>
      <CanvasPaneInner />
    </ReactFlowProvider>
  );
}
