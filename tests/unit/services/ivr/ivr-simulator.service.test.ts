import { describe, expect, it } from "vitest";

import { simulateIVRFlow } from "@/services/ivr/ivr-simulator.service";

describe("IVRSimulator", () => {
  const flow = {
    nodes: [
      { id: "start", data: { nodeKind: "START" } },
      {
        id: "menu",
        data: {
          nodeKind: "HYBRID_MENU",
          prompt: "Press 1 for loan help.",
          allowNaturalLanguageEscape: true,
          escapeNodeId: "knowledge",
          options: [
            { digit: "1", label: "Loan help", destinationNodeId: "knowledge" },
          ],
        },
      },
      {
        id: "knowledge",
        data: {
          nodeKind: "KNOWLEDGE",
          question: "What is the rate?",
          knowledgeDocumentIds: ["doc-1"],
        },
      },
      { id: "end", data: { nodeKind: "END_CALL", prompt: "Goodbye." } },
    ],
    edges: [
      { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
      { source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
      { source: "knowledge", target: "end", data: { trigger: "DEFAULT" } },
    ],
  };

  it("simulates configured DTMF without side effects", () => {
    const result = simulateIVRFlow({
      ...flow,
      inputMode: "DTMF",
      input: "1",
    });

    expect(result.validation.valid).toBe(true);
    expect(result.resultingNodeId).toBe("knowledge");
    expect(result.actionWouldExecute).toBe("KNOWLEDGE_LOOKUP");
    expect(result.knowledgeScopeSummary).toContain("doc-1");
    expect(result.trace).toEqual(
      expect.arrayContaining([
        "Input: DTMF (1)",
        "Action would execute: KNOWLEDGE_LOOKUP",
      ])
    );
  });

  it("simulates each same-target menu digit as an independent Knowledge route", () => {
    const shared = {
      ...flow,
      nodes: flow.nodes.map(node => node.id === "menu"
        ? { ...node, data: { ...node.data, options: [
          { digit: "1", label: "Loan help", destinationNodeId: "knowledge" },
          { digit: "2", label: "Eligibility", destinationNodeId: "knowledge" },
          { digit: "3", label: "Documents", destinationNodeId: "knowledge" },
        ] } }
        : node),
      edges: [
        flow.edges[0],
        { source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
        { source: "menu", target: "knowledge", sourceHandle: "2", data: { trigger: "DTMF", value: "2" } },
        { source: "menu", target: "knowledge", sourceHandle: "3", data: { trigger: "DTMF", value: "3" } },
        flow.edges[2],
      ],
    };

    for (const digit of ["1", "2", "3"]) {
      expect(simulateIVRFlow({ ...shared, inputMode: "DTMF", input: digit }).resultingNodeId).toBe("knowledge");
    }
  });

  it("simulates natural language voice escape", () => {
    const result = simulateIVRFlow({
      ...flow,
      inputMode: "VOICE",
      input: "What documents do I need for a home loan?",
    });

    expect(result.validation.valid).toBe(true);
    expect(result.transition).toBe("NATURAL_LANGUAGE_ESCAPE");
    expect(result.resultingNodeId).toBe("knowledge");
    expect(result.responsePreview).toContain("What is the rate?");
    expect(result.knowledgeScopeSummary).toContain("doc-1");
  });

  it("simulates silence as a preview only", () => {
    const result = simulateIVRFlow({
      ...flow,
      inputMode: "SILENCE",
      input: "",
    });

    expect(result.validation.valid).toBe(true);
    expect(result.transition).toBe("SILENCE");
    expect(result.responsePreview).toContain("Press 1");
  });
});
