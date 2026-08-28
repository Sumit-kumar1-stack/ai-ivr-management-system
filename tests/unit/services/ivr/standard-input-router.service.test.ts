import { describe, expect, it } from "vitest";
import { routeStandardInput } from "@/services/ivr/standard-input-router.service";

const flow = {
  nodes: [
    { id: "start", data: { nodeKind: "START" } },
    { id: "menu", data: { nodeKind: "HYBRID_MENU", allowNaturalLanguageEscape: true, escapeNodeId: "knowledge", options: [{ label: "Personal loan", digit: "1", voicePhrases: ["loan", "i need a loan"], destinationNodeId: "knowledge" }] } },
    { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
  ],
  edges: [{ source: "menu", target: "knowledge", data: { trigger: "MENU_OPTION", value: "1" } }],
};

describe("StandardInputRouter", () => {
  it("routes equivalent DTMF and configured voice to the same node", () => {
    const digit = routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "DTMF", rawInput: "1" });
    const voice = routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "loan" });
    expect(digit.resultingNodeId).toBe("knowledge");
    expect(voice.resultingNodeId).toBe(digit.resultingNodeId);
  });

  it("reads a legacy dtmf field without changing the canonical digit route", () => {
    const result = routeStandardInput({
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", options: [{ label: "Personal loan", dtmf: "1", destinationNodeId: "knowledge" }] } },
        { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [{ source: "menu", target: "knowledge", data: { trigger: "DTMF", value: "1" } }],
      currentNodeId: "menu",
      inputMode: "DTMF",
      rawInput: "1",
    });

    expect(result).toMatchObject({ matched: true, resultingNodeId: "knowledge" });
  });

  it("reads a saved menuOptions alias while canonical drafts use options", () => {
    const result = routeStandardInput({
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", menuOptions: [{ label: "Personal loan", digit: "1", voicePhrases: ["loan"], destinationNodeId: "knowledge" }] } },
        { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [{ source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } }],
      currentNodeId: "menu",
      inputMode: "VOICE",
      rawInput: "loan",
    });

    expect(result).toMatchObject({ matched: true, resultingNodeId: "knowledge" });
  });

  it("returns clarification for an invalid or ambiguous input", () => {
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "DTMF", rawInput: "9" }).action).toBe("CLARIFY");
  });

  it("escapes a spoken question to the configured node when natural language escape is enabled", () => {
    const result = routeStandardInput({
      ...flow,
      currentNodeId: "menu",
      inputMode: "VOICE",
      rawInput: "What documents do I need for a home loan?",
    });

    expect(result).toMatchObject({
      matched: true,
      action: "NAVIGATE",
      resultingNodeId: "knowledge",
      transition: "NATURAL_LANGUAGE_ESCAPE",
    });
  });

  it("routes multiple DTMF digits and their configured voice phrases to one Knowledge node", () => {
    const sharedKnowledgeFlow = {
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", allowNaturalLanguageEscape: true, escapeNodeId: "knowledge", options: [
          { label: "Loan information", digit: "1", voicePhrases: ["loan information"], destinationNodeId: "knowledge" },
          { label: "Eligibility", digit: "2", voicePhrases: ["eligibility"], destinationNodeId: "knowledge" },
          { label: "Documents", digit: "3", voicePhrases: ["documents"], destinationNodeId: "knowledge" },
        ] } },
        { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
      ],
      edges: [
        { source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { source: "menu", target: "knowledge", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
        { source: "menu", target: "knowledge", sourceHandle: "3", data: { trigger: "DTMF", value: "3" } },
      ],
    };

    for (const [digit, phrase] of [["1", "loan information"], ["2", "eligibility"], ["3", "documents"]]) {
      expect(routeStandardInput({ ...sharedKnowledgeFlow, currentNodeId: "menu", inputMode: "DTMF", rawInput: digit }).resultingNodeId).toBe("knowledge");
      expect(routeStandardInput({ ...sharedKnowledgeFlow, currentNodeId: "menu", inputMode: "VOICE", rawInput: phrase }).resultingNodeId).toBe("knowledge");
    }
  });

  it("supports repeat, go back, and main menu navigation commands", () => {
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "repeat" }).action).toBe("REPEAT");
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "back", previousNodeId: "start" }).resultingNodeId).toBe("start");
    expect(routeStandardInput({ ...flow, currentNodeId: "menu", inputMode: "VOICE", rawInput: "main menu" }).resultingNodeId).toBe("start");
  });
});
