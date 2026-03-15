import { describe, it, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SearchOverlay } from "../SearchOverlay";
import type { FlowNode } from "../../../types";

const makeNode = (id: string, label: string, description = ""): FlowNode => ({
  id, chartId: "c1", type: "process", label, description,
  positionX: 0, positionY: 0, styleJson: "{}", sourceRefId: null,
  confidence: 1, createdAt: "", updatedAt: "",
});

describe("SearchOverlay", () => {
  afterEach(cleanup);
  const nodes = [
    makeNode("1", "Login Flow", "User authentication"),
    makeNode("2", "Dashboard", "Main view"),
    makeNode("3", "Login Error", "Error handling"),
  ];

  it("filters nodes by label match", () => {
    const onSelect = mock(() => {});
    render(<SearchOverlay nodes={nodes} onSelect={onSelect} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("Search nodes...");
    fireEvent.change(input, { target: { value: "Login" } });
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("filters nodes by description match (case-insensitive)", () => {
    const onSelect = mock(() => {});
    render(<SearchOverlay nodes={nodes} onSelect={onSelect} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("Search nodes...");
    fireEvent.change(input, { target: { value: "AUTHENTICATION" } });
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("shows correct match count", () => {
    render(<SearchOverlay nodes={nodes} onSelect={() => {}} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("Search nodes...");
    fireEvent.change(input, { target: { value: "Dashboard" } });
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
  });

  it("returns no results message for no matches", () => {
    render(<SearchOverlay nodes={nodes} onSelect={() => {}} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("Search nodes...");
    fireEvent.change(input, { target: { value: "zzzzz" } });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("Escape calls onClose", () => {
    const onClose = mock(() => {});
    render(<SearchOverlay nodes={nodes} onSelect={() => {}} onClose={onClose} />);
    const input = screen.getByPlaceholderText("Search nodes...");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
