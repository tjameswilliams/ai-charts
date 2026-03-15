export interface AlignmentGuide {
  position: number;
  type: "horizontal" | "vertical";
}

interface NodeBounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function findAlignments(
  draggingNode: NodeBounds,
  allNodes: NodeBounds[],
  threshold: number = 5
): { horizontal: number[]; vertical: number[] } {
  const horizontal: number[] = [];
  const vertical: number[] = [];

  const dragCenterX = draggingNode.x + draggingNode.width / 2;
  const dragCenterY = draggingNode.y + draggingNode.height / 2;
  const dragRight = draggingNode.x + draggingNode.width;
  const dragBottom = draggingNode.y + draggingNode.height;

  for (const node of allNodes) {
    if (node.id === draggingNode.id) continue;

    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    const right = node.x + node.width;
    const bottom = node.y + node.height;

    // Vertical alignments (x-axis matches)
    if (Math.abs(dragCenterX - centerX) <= threshold) vertical.push(centerX);
    if (Math.abs(draggingNode.x - node.x) <= threshold) vertical.push(node.x);
    if (Math.abs(dragRight - right) <= threshold) vertical.push(right);
    if (Math.abs(draggingNode.x - right) <= threshold) vertical.push(right);
    if (Math.abs(dragRight - node.x) <= threshold) vertical.push(node.x);

    // Horizontal alignments (y-axis matches)
    if (Math.abs(dragCenterY - centerY) <= threshold) horizontal.push(centerY);
    if (Math.abs(draggingNode.y - node.y) <= threshold) horizontal.push(node.y);
    if (Math.abs(dragBottom - bottom) <= threshold) horizontal.push(bottom);
    if (Math.abs(draggingNode.y - bottom) <= threshold) horizontal.push(bottom);
    if (Math.abs(dragBottom - node.y) <= threshold) horizontal.push(node.y);
  }

  return {
    horizontal: [...new Set(horizontal)],
    vertical: [...new Set(vertical)],
  };
}

export function snapToGuide(
  position: number,
  guides: number[],
  threshold: number = 5
): number {
  for (const guide of guides) {
    if (Math.abs(position - guide) <= threshold) {
      return guide;
    }
  }
  return position;
}
