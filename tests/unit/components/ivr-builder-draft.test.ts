import { describe, expect, it } from "vitest";

import { applyGeneratedGraphToDraft } from "@/components/ivr/ivr-builder-draft";
import { validateIVRFlowDefinition } from "@/services/ivr/ivr-flow-validator.service";

const demoBankCandidate = {
  nodes: [
    { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
    { id: "greeting", type: "ivr", position: { x: 180, y: 0 }, data: { nodeKind: "GREETING", prompt: "Welcome to DemoBank." } },
    {
      id: "hybrid_menu",
      type: "ivr",
      position: { x: 360, y: 0 },
      data: {
        nodeKind: "HYBRID_MENU",
        allowNaturalLanguageEscape: true,
        escapeNodeId: "knowledge",
        options: [
          { digit: "1", label: "Loan information", destinationNodeId: "knowledge" },
          { digit: "2", label: "Eligibility", destinationNodeId: "knowledge" },
          { digit: "3", label: "Documents", destinationNodeId: "knowledge" },
          { digit: "4", label: "Human agent", destinationNodeId: "human_transfer" },
          { digit: "9", label: "Goodbye", destinationNodeId: "end_call" },
        ],
      },
    },
    { id: "knowledge", type: "ivr", position: { x: 600, y: 0 }, data: { nodeKind: "KNOWLEDGE", knowledgeDocumentIds: ["demo-loan-kb"] } },
    { id: "human_transfer", type: "ivr", position: { x: 600, y: 160 }, data: { nodeKind: "HUMAN_TRANSFER", transferDestinationId: "agent-1" } },
    { id: "end_call", type: "ivr", position: { x: 840, y: 0 }, data: { nodeKind: "END_CALL" } },
  ],
  edges: [
    { id: "start-greeting", source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
    { id: "greeting-menu", source: "greeting", target: "hybrid_menu", data: { trigger: "DEFAULT" } },
    ...["1", "2", "3", "4", "9"].map(digit => ({
      id: `menu-${digit}`,
      source: "hybrid_menu",
      sourceHandle: digit,
      target: digit === "4" ? "human_transfer" : digit === "9" ? "end_call" : "knowledge",
      data: { trigger: "DTMF", value: digit },
    })),
    { id: "knowledge-found", source: "knowledge", target: "hybrid_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
    { id: "knowledge-missing", source: "knowledge", target: "hybrid_menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
    { id: "transfer-success", source: "human_transfer", target: "end_call", data: { trigger: "HUMAN_TRANSFER" } },
    { id: "transfer-failure", source: "human_transfer", target: "end_call", data: { trigger: "ACTION_FAILURE" } },
  ],
};

describe("Copilot candidate application to the Manual Builder draft", () => {
  it("atomically replaces the manual graph with the DemoBank candidate and preserves auth-path blocking", () => {
    const applied = applyGeneratedGraphToDraft(demoBankCandidate as never);

    expect(applied).toMatchObject({ mode: "MANUAL", saveState: "UNSAVED" });
    expect(applied.nodes).not.toBe(demoBankCandidate.nodes);
    expect(applied.edges).not.toBe(demoBankCandidate.edges);
    expect(applied.nodes.map(node => node.id)).toEqual([
      "start", "greeting", "hybrid_menu", "knowledge", "human_transfer", "end_call",
    ]);
    expect(applied.edges).toHaveLength(11);

    const menu = applied.nodes.find(node => node.id === "hybrid_menu")!;
    const options = (menu.data as { options: Array<{ digit: string; destinationNodeId: string }> }).options;
    expect(options.map(option => [option.digit, option.destinationNodeId])).toEqual([
      ["1", "knowledge"], ["2", "knowledge"], ["3", "knowledge"], ["4", "human_transfer"], ["9", "end_call"],
    ]);
    expect(applied.edges.filter(edge => edge.source === "hybrid_menu").map(edge => [
      edge.sourceHandle,
      edge.data?.trigger,
      edge.data?.value,
      edge.target,
    ])).toEqual([
      ["1", "DTMF", "1", "knowledge"], ["2", "DTMF", "2", "knowledge"], ["3", "DTMF", "3", "knowledge"],
      ["4", "DTMF", "4", "human_transfer"], ["9", "DTMF", "9", "end_call"],
    ]);
    expect(validateIVRFlowDefinition(applied)).toMatchObject({ valid: false });
    expect(validateIVRFlowDefinition(applied).errors.map(issue => issue.code)).toContain("AUTH_PATH_REQUIRED");
  });

  it("preserves and normalizes user-provided or copilot-generated flow names on draft application", () => {
    const candidateWithName = {
      ...demoBankCandidate,
      name: "  DemoBank Support Flow  ",
    };

    const applied = applyGeneratedGraphToDraft(candidateWithName as never);

    expect(applied.name).toBe("DemoBank Support Flow");
    expect(applied.saveState).toBe("UNSAVED");
    expect(applied.mode).toBe("MANUAL");
  });
});
