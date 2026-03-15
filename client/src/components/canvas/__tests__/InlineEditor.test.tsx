import { describe, it, expect, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { InlineEditor } from "../InlineEditor";

describe("InlineEditor", () => {
  afterEach(cleanup);

  const defaultProps = {
    position: { x: 100, y: 100 },
    initialValue: "Test Label",
    onSave: () => {},
    onCancel: () => {},
  };

  it("renders input with initial value", () => {
    render(<InlineEditor {...defaultProps} />);
    const input = screen.getByDisplayValue("Test Label");
    expect(input).toBeInTheDocument();
  });

  it("calls onSave on Enter keypress", () => {
    let saved = "";
    render(<InlineEditor {...defaultProps} onSave={(v) => { saved = v; }} />);
    const input = screen.getByDisplayValue("Test Label");
    fireEvent.change(input, { target: { value: "New Label" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(saved).toBe("New Label");
  });

  it("calls onCancel on Escape keypress", () => {
    let cancelled = false;
    render(<InlineEditor {...defaultProps} onCancel={() => { cancelled = true; }} />);
    const input = screen.getByDisplayValue("Test Label");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(cancelled).toBe(true);
  });

  it("renders textarea for multi-line content", () => {
    const { container } = render(<InlineEditor {...defaultProps} initialValue={"Line 1\nLine 2"} />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea!.tagName).toBe("TEXTAREA");
    expect(textarea!.value).toContain("Line 1");
  });

  it("auto-focuses on mount", () => {
    render(<InlineEditor {...defaultProps} />);
    const input = screen.getByDisplayValue("Test Label");
    expect(document.activeElement).toBe(input);
  });
});
