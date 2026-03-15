import { describe, it, expect } from "bun:test";
import { findAlignments, snapToGuide } from "../alignmentUtils";

describe("alignmentUtils", () => {
  const baseNode = { id: "a", x: 100, y: 100, width: 160, height: 60 };

  it("detects center-to-center alignment within threshold", () => {
    const other = { id: "b", x: 98, y: 300, width: 160, height: 60 };
    const result = findAlignments(baseNode, [other], 5);
    expect(result.vertical.length).toBeGreaterThan(0);
  });

  it("detects edge alignment (left-to-left)", () => {
    const other = { id: "b", x: 100, y: 300, width: 200, height: 60 };
    const result = findAlignments(baseNode, [other], 5);
    expect(result.vertical).toContain(100);
  });

  it("returns empty arrays when no alignment found", () => {
    const other = { id: "b", x: 500, y: 500, width: 160, height: 60 };
    const result = findAlignments(baseNode, [other], 5);
    expect(result.horizontal).toHaveLength(0);
    expect(result.vertical).toHaveLength(0);
  });

  it("respects threshold distance", () => {
    const other = { id: "b", x: 110, y: 300, width: 160, height: 60 };
    const strict = findAlignments(baseNode, [other], 2);
    const loose = findAlignments(baseNode, [other], 15);
    expect(strict.vertical.length).toBeLessThanOrEqual(loose.vertical.length);
  });

  it("snapToGuide adjusts position correctly", () => {
    expect(snapToGuide(102, [100, 200], 5)).toBe(100);
    expect(snapToGuide(150, [100, 200], 5)).toBe(150);
  });
});
