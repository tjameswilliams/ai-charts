import type { FlowNode, FlowEdge } from "../types";

interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

const ACTOR_SPACING = 200;
const HEADER_HEIGHT = 100;
const MESSAGE_SPACING = 60;

export function sequenceLayout(
  nodes: FlowNode[],
  edges: FlowEdge[]
): { nodes: LayoutNode[] } {
  if (nodes.length === 0) return { nodes: [] };

  // Separate actors/participants from activations
  const actors = nodes.filter((n) => n.type === "actor" || n.type === "participant");
  const activations = nodes.filter((n) => n.type === "lifeline_activation");
  const others = nodes.filter((n) => n.type !== "actor" && n.type !== "participant" && n.type !== "lifeline_activation");

  const positions = new Map<string, { x: number; y: number }>();

  // Place actors in a horizontal row at the top
  actors.forEach((actor, i) => {
    positions.set(actor.id, { x: i * ACTOR_SPACING, y: 0 });
  });

  // Build actor index for x-position lookup
  const actorIndex = new Map<string, number>();
  actors.forEach((actor, i) => actorIndex.set(actor.id, i));

  // Sort edges by orderIndex (or createdAt fallback)
  const sortedEdges = [...edges].sort((a, b) => {
    const aOrder = (a as any).orderIndex ?? Infinity;
    const bOrder = (b as any).orderIndex ?? Infinity;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });

  // Place activations along lifelines
  // Each activation gets positioned at its actor's x, at the y of its first incoming message
  const actorMessageY = new Map<string, number[]>();

  let messageY = HEADER_HEIGHT;
  for (const edge of sortedEdges) {
    const sourceIdx = actorIndex.get(edge.fromNodeId);
    const targetIdx = actorIndex.get(edge.toNodeId);

    if (sourceIdx !== undefined && targetIdx !== undefined) {
      // This is a message between actors - we don't need to position the edge itself
      // but we track the y-position for any activations
      if (!actorMessageY.has(edge.toNodeId)) actorMessageY.set(edge.toNodeId, []);
      actorMessageY.get(edge.toNodeId)!.push(messageY);
      messageY += MESSAGE_SPACING;
    }
  }

  // Place activations
  for (const activation of activations) {
    // Find which actor this activation belongs to (connected via edge)
    const incomingEdge = edges.find((e) => e.toNodeId === activation.id);
    const outgoingEdge = edges.find((e) => e.fromNodeId === activation.id);
    const actorId = incomingEdge?.fromNodeId || outgoingEdge?.toNodeId;

    if (actorId && actorIndex.has(actorId)) {
      const x = actorIndex.get(actorId)! * ACTOR_SPACING + ACTOR_SPACING / 2 - 8;
      const y = HEADER_HEIGHT + activations.indexOf(activation) * MESSAGE_SPACING;
      positions.set(activation.id, { x, y });
    }
  }

  // Place other nodes (like sticky notes) below
  let othersY = messageY + 50;
  for (const node of others) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: 0, y: othersY });
      othersY += 80;
    }
  }

  // Fill in any remaining unpositioned nodes
  for (const node of nodes) {
    if (!positions.has(node.id)) {
      positions.set(node.id, { x: 0, y: othersY });
      othersY += 80;
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
