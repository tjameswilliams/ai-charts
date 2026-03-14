import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdge, EdgeType } from "../../types";

interface ERDEdgeData {
  edge: FlowEdge;
}

// SVG marker definitions for crow's foot notation
// These get added to the SVG defs once, referenced by marker-start/marker-end
const MARKER_DEFS_ID = "erd-markers";

function ensureMarkerDefs() {
  if (typeof document === "undefined") return;
  const svg = document.querySelector(".react-flow__edges > svg");
  if (!svg || svg.querySelector(`#${MARKER_DEFS_ID}`)) return;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.id = MARKER_DEFS_ID;
  defs.innerHTML = `
    <marker id="erd-one" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
      <line x1="10" y1="2" x2="10" y2="10" stroke="#38bdf8" stroke-width="2"/>
    </marker>
    <marker id="erd-many" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
      <line x1="2" y1="2" x2="10" y2="6" stroke="#38bdf8" stroke-width="1.5"/>
      <line x1="2" y1="10" x2="10" y2="6" stroke="#38bdf8" stroke-width="1.5"/>
      <line x1="10" y1="2" x2="10" y2="10" stroke="#38bdf8" stroke-width="1.5"/>
    </marker>
    <marker id="erd-one-selected" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
      <line x1="10" y1="2" x2="10" y2="10" stroke="#3b82f6" stroke-width="2"/>
    </marker>
    <marker id="erd-many-selected" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
      <line x1="2" y1="2" x2="10" y2="6" stroke="#3b82f6" stroke-width="1.5"/>
      <line x1="2" y1="10" x2="10" y2="6" stroke="#3b82f6" stroke-width="1.5"/>
      <line x1="10" y1="2" x2="10" y2="10" stroke="#3b82f6" stroke-width="1.5"/>
    </marker>
  `;
  svg.prepend(defs);
}

type ERDEdgeType = "one_to_one" | "one_to_many" | "many_to_many";

function getMarkers(edgeType: ERDEdgeType, selected: boolean): { markerStart: string; markerEnd: string } {
  const suffix = selected ? "-selected" : "";
  switch (edgeType) {
    case "one_to_one":
      return { markerStart: `url(#erd-one${suffix})`, markerEnd: `url(#erd-one${suffix})` };
    case "one_to_many":
      return { markerStart: `url(#erd-one${suffix})`, markerEnd: `url(#erd-many${suffix})` };
    case "many_to_many":
      return { markerStart: `url(#erd-many${suffix})`, markerEnd: `url(#erd-many${suffix})` };
  }
}

export function ERDEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  } = props;

  ensureMarkerDefs();

  const edgeData = data as unknown as ERDEdgeData | undefined;
  const edge = edgeData?.edge;
  const edgeType: ERDEdgeType = (["one_to_one", "one_to_many", "many_to_many"].includes(edge?.type || "")
    ? edge!.type
    : "one_to_many") as ERDEdgeType;

  const color = selected ? "#3b82f6" : "#38bdf8";
  const { markerStart, markerEnd } = getMarkers(edgeType, !!selected);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: selected ? 3 : 2,
        }}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />
      {edge?.label && (
        <EdgeLabelRenderer>
          <div
            className="absolute text-[10px] bg-zinc-800 border border-sky-800 rounded px-1.5 py-0.5 text-sky-300 pointer-events-all"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {edge.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
