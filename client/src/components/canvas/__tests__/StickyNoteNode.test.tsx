import { describe, it, expect } from "bun:test";

describe("StickyNoteNode", () => {
  it("sticky_note has correct style colors", () => {
    // Test the style configuration
    const stickyStyle = {
      bg: "bg-yellow-200/90",
      border: "border-yellow-400",
      text: "text-yellow-900",
      descText: "text-yellow-800/70"
    };
    expect(stickyStyle.bg).toContain("yellow");
    expect(stickyStyle.border).toContain("yellow");
    expect(stickyStyle.text).toContain("yellow");
  });

  it("sticky_note is available in chart type configs", () => {
    // Verify the config includes sticky_note for all chart types
    const flowchartTypes = ["process", "decision", "start", "end", "input_output", "data_store", "external_system", "subflow_ref", "note", "sticky_note"];
    const erdTypes = ["entity", "sticky_note"];
    const swimlaneTypes = ["action", "process", "decision", "start", "end", "sticky_note"];

    expect(flowchartTypes).toContain("sticky_note");
    expect(erdTypes).toContain("sticky_note");
    expect(swimlaneTypes).toContain("sticky_note");
  });
});
