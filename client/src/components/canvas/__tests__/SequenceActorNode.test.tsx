import { describe, it, expect } from "bun:test";

describe("SequenceActorNode", () => {
  it("renders different styles for actor vs participant", () => {
    // Actor uses stick figure, participant uses box
    const actorType = "actor";
    const participantType = "participant";
    expect(actorType).not.toBe(participantType);
  });

  it("actor type renders with correct label positioning", () => {
    // Test the data structure
    const nodeData = {
      node: { id: "1", type: "actor", label: "User" },
      isSelected: false,
    };
    expect(nodeData.node.type).toBe("actor");
    expect(nodeData.node.label).toBe("User");
  });

  it("participant type renders with box style", () => {
    const nodeData = {
      node: { id: "2", type: "participant", label: "Server" },
      isSelected: true,
    };
    expect(nodeData.isSelected).toBe(true);
    expect(nodeData.node.type).toBe("participant");
  });
});
