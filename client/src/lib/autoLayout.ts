import ELK from "elkjs/lib/elk.bundled.js";
import type { FlowNode, FlowEdge, FlowGroup, ChartType } from "../types";
import { mindmapLayout } from "./mindmapLayout";
import { sequenceLayout } from "./sequenceLayout";

const elk = new ELK();

const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 50;

function measureNodeSizes(): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();

  // Get the current zoom level from the ReactFlow viewport transform
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  let zoom = 1;
  if (viewport) {
    const transform = viewport.style.transform;
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    if (scaleMatch) zoom = parseFloat(scaleMatch[1]) || 1;
  }

  const nodeEls = document.querySelectorAll<HTMLElement>(".react-flow__node");
  for (const el of nodeEls) {
    const id = el.dataset.id;
    if (!id) continue;
    const rect = el.getBoundingClientRect();
    // Divide by zoom to get actual unscaled dimensions
    sizes.set(id, {
      width: Math.ceil(rect.width / zoom) + 8,
      height: Math.ceil(rect.height / zoom) + 8,
    });
  }
  return sizes;
}

export interface LayoutResult {
  nodes: Array<{ id: string; x: number; y: number }>;
  groups?: Array<{ id: string; x: number; y: number; w: number; h: number }>;
}

export async function autoLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: string = "DOWN",
  chartType: ChartType = "flowchart",
  groups: FlowGroup[] = [],
): Promise<LayoutResult> {
  if (chartType === "mindmap") {
    return mindmapLayout(nodes, edges);
  }
  if (chartType === "sequence") {
    return sequenceLayout(nodes, edges);
  }
  if (chartType === "swimlane" && groups.length > 0) {
    return swimlaneLayout(nodes, edges, groups);
  }
  if (groups.length > 0) {
    return groupedLayout(nodes, edges, groups, direction);
  }
  return { nodes: await standardLayout(nodes, edges, direction) };
}

async function standardLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: string = "DOWN"
): Promise<Array<{ id: string; x: number; y: number }>> {
  const measured = measureNodeSizes();

  // Calculate spacing relative to average node size
  let avgHeight = DEFAULT_HEIGHT;
  if (measured.size > 0) {
    let totalH = 0;
    for (const s of measured.values()) totalH += s.height;
    avgHeight = totalH / measured.size;
  }

  // Scale spacing based on content size — larger nodes need more breathing room
  const nodeNodeSpacing = Math.max(40, Math.round(avgHeight * 0.4));
  const layerSpacing = Math.max(60, Math.round(avgHeight * 0.6));

  const nodeIds = new Set(nodes.map((n) => n.id));
  // Filter out edges referencing nodes not in the layout
  const validEdges = edges.filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.spacing.nodeNode": String(nodeNodeSpacing),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
      "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.round(layerSpacing * 0.5)),
      "elk.spacing.edgeNode": String(Math.round(nodeNodeSpacing * 0.5)),
      "elk.spacing.edgeEdge": "20",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.thoroughness": "100",
    },
    children: nodes.map((n) => {
      const size = measured.get(n.id);
      return {
        id: n.id,
        width: size?.width ?? DEFAULT_WIDTH,
        height: size?.height ?? DEFAULT_HEIGHT,
      };
    }),
    edges: validEdges.map((e) => ({
      id: e.id,
      sources: [e.fromNodeId],
      targets: [e.toNodeId],
    })),
  };

  const laid = await elk.layout(graph);

  return (laid.children ?? []).map((node) => ({
    id: node.id,
    x: node.x ?? 0,
    y: node.y ?? 0,
  }));
}

/**
 * Grouped layout for flowcharts and ERDs with groups.
 *
 * Strategy:
 * 1. Layout each group's internal nodes independently with ELK
 * 2. Build a meta-graph where each group is a node (sized by its internal layout)
 * 3. Use ELK to arrange the meta-graph, positioning groups relative to each other
 * 4. Offset each group's internal node positions to the group's final position
 * 5. Place unassigned nodes with a separate layout below the groups
 */
async function groupedLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  groups: FlowGroup[],
  direction: string = "DOWN",
): Promise<LayoutResult> {
  const measured = measureNodeSizes();
  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));

  const GROUP_PAD = 50;   // padding inside group around nodes
  const GROUP_LABEL = 30; // space for the label badge at top

  // Build node → group membership map
  const nodeToGroup = new Map<string, string>();
  for (const group of groups) {
    for (const nid of group.nodeIds) {
      nodeToGroup.set(nid, group.id);
    }
  }

  // Partition nodes
  const groupNodeMap = new Map<string, FlowNode[]>();
  const unassigned: FlowNode[] = [];
  for (const group of groups) groupNodeMap.set(group.id, []);
  for (const node of nodes) {
    const gid = nodeToGroup.get(node.id);
    if (gid && groupNodeMap.has(gid)) {
      groupNodeMap.get(gid)!.push(node);
    } else {
      unassigned.push(node);
    }
  }

  // Layout each group's internal nodes
  interface GroupResult {
    groupId: string;
    nodePositions: Array<{ id: string; x: number; y: number }>;
    contentWidth: number;
    contentHeight: number;
  }

  const groupResults: GroupResult[] = [];

  for (const group of groups) {
    const members = groupNodeMap.get(group.id) || [];
    if (members.length === 0) {
      groupResults.push({ groupId: group.id, nodePositions: [], contentWidth: 120, contentHeight: 60 });
      continue;
    }

    const memberIds = new Set(members.map((n) => n.id));
    const intraEdges = validEdges.filter(
      (e) => memberIds.has(e.fromNodeId) && memberIds.has(e.toNodeId)
    );

    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": direction,
        "elk.spacing.nodeNode": "35",
        "elk.layered.spacing.nodeNodeBetweenLayers": "50",
        "elk.layered.spacing.edgeNodeBetweenLayers": "25",
        "elk.spacing.edgeNode": "15",
        "elk.spacing.edgeEdge": "15",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      },
      children: members.map((n) => {
        const size = measured.get(n.id);
        return {
          id: n.id,
          width: size?.width ?? DEFAULT_WIDTH,
          height: size?.height ?? DEFAULT_HEIGHT,
        };
      }),
      edges: intraEdges.map((e) => ({
        id: e.id,
        sources: [e.fromNodeId],
        targets: [e.toNodeId],
      })),
    };

    const laid = await elk.layout(graph);
    const positions = (laid.children ?? []).map((c) => ({
      id: c.id,
      x: c.x ?? 0,
      y: c.y ?? 0,
    }));

    // Compute content bounding box
    let maxX = 0;
    let maxY = 0;
    for (const c of laid.children ?? []) {
      const size = measured.get(c.id);
      maxX = Math.max(maxX, (c.x ?? 0) + (size?.width ?? DEFAULT_WIDTH));
      maxY = Math.max(maxY, (c.y ?? 0) + (size?.height ?? DEFAULT_HEIGHT));
    }

    groupResults.push({
      groupId: group.id,
      nodePositions: positions,
      contentWidth: maxX,
      contentHeight: maxY,
    });
  }

  // Build a meta-graph: each group becomes a node, sized by its content + padding
  // Cross-group edges become meta-edges
  const crossGroupEdges = new Map<string, Set<string>>();
  for (const edge of validEdges) {
    const sg = nodeToGroup.get(edge.fromNodeId);
    const tg = nodeToGroup.get(edge.toNodeId);
    if (sg && tg && sg !== tg) {
      const key = `${sg}__${tg}`;
      if (!crossGroupEdges.has(key)) crossGroupEdges.set(key, new Set());
      crossGroupEdges.get(key)!.add(edge.id);
    }
  }

  const metaEdges: Array<{ id: string; sources: string[]; targets: string[] }> = [];
  for (const [key] of crossGroupEdges) {
    const [sg, tg] = key.split("__");
    metaEdges.push({ id: `meta_${key}`, sources: [sg], targets: [tg] });
  }

  const groupResultMap = new Map(groupResults.map((gr) => [gr.groupId, gr]));

  const metaGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.layered.spacing.edgeNodeBetweenLayers": "40",
      "elk.spacing.edgeNode": "30",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.thoroughness": "100",
    },
    children: groups.map((g) => {
      const gr = groupResultMap.get(g.id)!;
      return {
        id: g.id,
        width: gr.contentWidth + GROUP_PAD * 2,
        height: gr.contentHeight + GROUP_PAD * 2 + GROUP_LABEL,
      };
    }),
    edges: metaEdges,
  };

  const metaLaid = await elk.layout(metaGraph);

  // Build final positions: offset each group's internal positions by the meta position
  const nodePositions: Array<{ id: string; x: number; y: number }> = [];
  const groupBounds: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];

  for (const metaNode of metaLaid.children ?? []) {
    const gr = groupResultMap.get(metaNode.id);
    if (!gr) continue;

    const gx = metaNode.x ?? 0;
    const gy = metaNode.y ?? 0;
    const gw = (metaNode.width ?? 0);
    const gh = (metaNode.height ?? 0);

    groupBounds.push({ id: gr.groupId, x: gx, y: gy, w: gw, h: gh });

    // Offset internal node positions: pad from group edge + label space at top
    for (const pos of gr.nodePositions) {
      nodePositions.push({
        id: pos.id,
        x: gx + GROUP_PAD + pos.x,
        y: gy + GROUP_PAD + GROUP_LABEL + pos.y,
      });
    }
  }

  // Place unassigned nodes below all groups
  if (unassigned.length > 0) {
    const maxGroupBottom = groupBounds.length > 0
      ? Math.max(...groupBounds.map((gb) => gb.y + gb.h))
      : 0;
    const unassignedGap = 60;

    const unassignedIds = new Set(unassigned.map((n) => n.id));
    const unassignedEdges = validEdges.filter(
      (e) => unassignedIds.has(e.fromNodeId) && unassignedIds.has(e.toNodeId)
    );

    const unassignedPositions = await standardLayout(unassigned, unassignedEdges, direction);
    for (const pos of unassignedPositions) {
      nodePositions.push({
        id: pos.id,
        x: pos.x,
        y: maxGroupBottom + unassignedGap + pos.y,
      });
    }
  }

  return { nodes: nodePositions, groups: groupBounds };
}

/**
 * Swimlane layout: each group/lane becomes a horizontal band.
 * Nodes flow LEFT→RIGHT within their lane. Lanes stack vertically.
 *
 * Strategy: layout each lane independently with ELK (left-to-right),
 * then stack lanes vertically with consistent width and position
 * nodes at absolute coordinates.
 */
async function swimlaneLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  groups: FlowGroup[],
): Promise<LayoutResult> {
  const measured = measureNodeSizes();
  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));

  // Build node→group membership map
  const nodeToGroup = new Map<string, string>();
  for (const group of groups) {
    for (const nid of group.nodeIds) {
      nodeToGroup.set(nid, group.id);
    }
  }

  // Partition nodes into lanes and unassigned
  const laneNodes = new Map<string, FlowNode[]>();
  const unassigned: FlowNode[] = [];
  for (const group of groups) {
    laneNodes.set(group.id, []);
  }
  for (const node of nodes) {
    const gid = nodeToGroup.get(node.id);
    if (gid && laneNodes.has(gid)) {
      laneNodes.get(gid)!.push(node);
    } else {
      unassigned.push(node);
    }
  }

  // Determine lane order by analyzing edge flow direction
  const laneOrder = orderLanes(groups, validEdges, nodeToGroup);

  const LANE_HEADER = 50;  // width of rotated label area
  const LANE_PAD = 30;
  const LANE_GAP = 20;
  const MIN_LANE_HEIGHT = 100;

  // Layout each lane independently (LEFT→RIGHT flow within lane)
  interface LaneResult {
    groupId: string;
    nodePositions: Array<{ id: string; x: number; y: number }>;
    width: number;
    height: number;
  }

  const laneResults: LaneResult[] = [];

  for (const group of laneOrder) {
    const members = laneNodes.get(group.id) || [];
    if (members.length === 0) {
      laneResults.push({ groupId: group.id, nodePositions: [], width: 300, height: MIN_LANE_HEIGHT });
      continue;
    }

    // Intra-lane edges only
    const memberIds = new Set(members.map((n) => n.id));
    const intraEdges = validEdges.filter(
      (e) => memberIds.has(e.fromNodeId) && memberIds.has(e.toNodeId)
    );

    const graph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "60",
        "elk.layered.spacing.edgeNodeBetweenLayers": "30",
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "15",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      },
      children: members.map((n) => {
        const size = measured.get(n.id);
        return {
          id: n.id,
          width: size?.width ?? DEFAULT_WIDTH,
          height: size?.height ?? DEFAULT_HEIGHT,
        };
      }),
      edges: intraEdges.map((e) => ({
        id: e.id,
        sources: [e.fromNodeId],
        targets: [e.toNodeId],
      })),
    };

    const laid = await elk.layout(graph);
    const positions = (laid.children ?? []).map((c) => ({
      id: c.id,
      x: c.x ?? 0,
      y: c.y ?? 0,
    }));

    // Compute bounding box of the laid-out nodes
    let maxX = 0;
    let maxY = 0;
    for (const c of laid.children ?? []) {
      const size = measured.get(c.id);
      maxX = Math.max(maxX, (c.x ?? 0) + (size?.width ?? DEFAULT_WIDTH));
      maxY = Math.max(maxY, (c.y ?? 0) + (size?.height ?? DEFAULT_HEIGHT));
    }

    laneResults.push({
      groupId: group.id,
      nodePositions: positions,
      width: maxX + LANE_PAD * 2 + LANE_HEADER,
      height: Math.max(maxY + LANE_PAD * 2, MIN_LANE_HEIGHT),
    });
  }

  // Make all lanes the same width (the widest one)
  const maxLaneWidth = Math.max(300, ...laneResults.map((lr) => lr.width));

  // Stack lanes vertically and compute absolute positions
  const nodePositions: Array<{ id: string; x: number; y: number }> = [];
  const groupBounds: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];

  let currentY = 0;

  for (const lane of laneResults) {
    const laneX = 0;
    const laneY = currentY;

    groupBounds.push({
      id: lane.groupId,
      x: laneX,
      y: laneY,
      w: maxLaneWidth,
      h: lane.height,
    });

    // Offset node positions into absolute coordinates
    // Nodes are inset by header + padding from left, padding from top
    for (const pos of lane.nodePositions) {
      nodePositions.push({
        id: pos.id,
        x: laneX + LANE_HEADER + LANE_PAD + pos.x,
        y: laneY + LANE_PAD + pos.y,
      });
    }

    currentY += lane.height + LANE_GAP;
  }

  // Place unassigned nodes below all lanes
  if (unassigned.length > 0) {
    const unassignedPositions = await standardLayout(unassigned, validEdges.filter((e) => {
      const inUnassigned = new Set(unassigned.map((n) => n.id));
      return inUnassigned.has(e.fromNodeId) && inUnassigned.has(e.toNodeId);
    }), "RIGHT");
    for (const pos of unassignedPositions) {
      nodePositions.push({
        id: pos.id,
        x: pos.x + LANE_HEADER + LANE_PAD,
        y: currentY + pos.y,
      });
    }
  }

  return { nodes: nodePositions, groups: groupBounds };
}

/**
 * Determine lane ordering by edge flow direction.
 * Lanes that act primarily as sources come first; lanes that are targets come later.
 * Falls back to the original order for disconnected lanes.
 */
function orderLanes(
  groups: FlowGroup[],
  edges: FlowEdge[],
  nodeToGroup: Map<string, string>,
): FlowGroup[] {
  if (groups.length <= 1) return groups;

  // Count cross-lane directed edges between lanes
  const laneIds = new Set(groups.map((g) => g.id));
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const gid of laneIds) {
    inDegree.set(gid, 0);
    outDegree.set(gid, 0);
  }

  // Build adjacency for topological sort
  const adj = new Map<string, Set<string>>();
  for (const gid of laneIds) adj.set(gid, new Set());

  for (const edge of edges) {
    const sg = nodeToGroup.get(edge.fromNodeId);
    const tg = nodeToGroup.get(edge.toNodeId);
    if (sg && tg && sg !== tg && laneIds.has(sg) && laneIds.has(tg)) {
      inDegree.set(tg, (inDegree.get(tg) || 0) + 1);
      outDegree.set(sg, (outDegree.get(sg) || 0) + 1);
      adj.get(sg)!.add(tg);
    }
  }

  // Topological sort (Kahn's algorithm) with original order as tiebreak
  const groupIndex = new Map(groups.map((g, i) => [g.id, i]));
  const queue: string[] = [];
  const inDeg = new Map(inDegree);

  // Seed with zero in-degree nodes, sorted by original index
  for (const gid of laneIds) {
    if ((inDeg.get(gid) || 0) === 0) queue.push(gid);
  }
  queue.sort((a, b) => (groupIndex.get(a) || 0) - (groupIndex.get(b) || 0));

  const sorted: string[] = [];
  while (queue.length > 0) {
    const gid = queue.shift()!;
    sorted.push(gid);
    for (const neighbor of adj.get(gid) || []) {
      const d = (inDeg.get(neighbor) || 1) - 1;
      inDeg.set(neighbor, d);
      if (d === 0) {
        // Insert maintaining original order
        const ni = groupIndex.get(neighbor) || 0;
        let inserted = false;
        for (let i = 0; i < queue.length; i++) {
          if ((groupIndex.get(queue[i]) || 0) > ni) {
            queue.splice(i, 0, neighbor);
            inserted = true;
            break;
          }
        }
        if (!inserted) queue.push(neighbor);
      }
    }
  }

  // Add any remaining (cycle participants) in original order
  const sortedSet = new Set(sorted);
  for (const g of groups) {
    if (!sortedSet.has(g.id)) sorted.push(g.id);
  }

  const groupMap = new Map(groups.map((g) => [g.id, g]));
  return sorted.map((id) => groupMap.get(id)!).filter(Boolean);
}
