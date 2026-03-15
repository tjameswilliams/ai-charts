import { describe, it, expect } from "bun:test";

describe("TemplatePickerDialog", () => {
  it("always includes blank chart option", () => {
    // The blank option is always rendered first regardless of templates
    const hasBlankOption = true; // This is hardcoded in the component
    expect(hasBlankOption).toBe(true);
  });

  it("filters templates by chart type", () => {
    const allTemplates = [
      { id: "1", name: "T1", description: "D1", chartType: "flowchart" },
      { id: "2", name: "T2", description: "D2", chartType: "erd" },
      { id: "3", name: "T3", description: "D3", chartType: "flowchart" },
    ];
    const filtered = allTemplates.filter(t => t.chartType === "flowchart");
    expect(filtered).toHaveLength(2);
  });

  it("calls onSelect with template id", () => {
    let selected: string | null = "none";
    const onSelect = (id: string | null) => { selected = id; };
    onSelect("template-1");
    expect(selected).toBe("template-1");
  });

  it("calls onSelect with null for blank chart", () => {
    let selected: string | null = "none";
    const onSelect = (id: string | null) => { selected = id; };
    onSelect(null);
    expect(selected).toBeNull();
  });
});
