import { memo } from "react";

interface AlignmentGuidesProps {
  horizontal: number[];
  vertical: number[];
}

export const AlignmentGuides = memo(function AlignmentGuides({
  horizontal,
  vertical,
}: AlignmentGuidesProps) {
  if (horizontal.length === 0 && vertical.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-40"
      style={{ width: "100%", height: "100%" }}
    >
      {horizontal.map((y, i) => (
        <line
          key={`h-${i}`}
          x1="0"
          x2="100%"
          y1={y}
          y2={y}
          stroke="#3b82f6"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.6"
        />
      ))}
      {vertical.map((x, i) => (
        <line
          key={`v-${i}`}
          x1={x}
          x2={x}
          y1="0"
          y2="100%"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.6"
        />
      ))}
    </svg>
  );
});
