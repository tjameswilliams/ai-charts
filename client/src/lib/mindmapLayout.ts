import type { FlowNode, FlowEdge } from "../types";

interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export function mindmapLayout(
  nodes: FlowNode[],
  edges: FlowEdge[]
): { nodes: LayoutNode[] } {
  if (nodes.length === 0) return { nodes: [] };

  // Find central topic
  const central = nodes.find((n) => n.type === "central_topic") || nodes[0];

  // Build adjacency (parent -> children)
  const children = new Map<string, string[]>();
  const parents = new Map<string, string>();
  for (const n of nodes) children.set(n.id, []);

  for (const edge of edges) {
    children.get(edge.fromNodeId)?.push(edge.toNodeId);
    parents.set(edge.toNodeId, edge.fromNodeId);
  }

  // BFS from central to get tree levels
  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();

  // Place central at origin
  positions.set(central.id, { x: 0, y: 0 });
  visited.add(central.id);

  // Get direct children of central
  const mainBranches = children.get(central.id) || [];
  const branchCount = mainBranches.length || 1;
  const LEVEL_SPACING = 250;

  // Distribute main branches radially around center
  const angleStep = (2 * Math.PI) / branchCount;

  mainBranches.forEach((branchId, i) => {
    visited.add(branchId);
    const angle = angleStep * i - Math.PI / 2; // Start from top
    const x = Math.cos(angle) * LEVEL_SPACING;
    const y = Math.sin(angle) * LEVEL_SPACING;
    positions.set(branchId, { x, y });

    // Place sub-branches extending outward
    placeChildren(branchId, angle, LEVEL_SPACING * 2, angleStep * 0.6);
  });

  function placeChildren(parentId: string, parentAngle: number, radius: number, spread: number) {
    const kids = (children.get(parentId) || []).filter((id) => !visited.has(id));
    if (kids.length === 0) return;

    const halfSpread = (spread * (kids.length - 1)) / 2;
    kids.forEach((kidId, i) => {
      visited.add(kidId);
      const angle = parentAngle - halfSpread + spread * i;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      positions.set(kidId, { x, y });
      placeChildren(kidId, angle, radius + LEVEL_SPACING * 0.7, spread * 0.5);
    });
  }

  // Place any unvisited nodes
  let offsetY = 400;
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: 0, y: offsetY });
      offsetY += 100;
    }
  }

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      x: positions.get(n.id)?.x ?? 0,
      y: positions.get(n.id)?.y ?? 0,
    })),
  };
}
