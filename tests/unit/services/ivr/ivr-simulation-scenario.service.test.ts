import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRuntime: vi.fn(),
}));

vi.mock("@/services/ivr/ivr-runtime-selector.service", () => ({
  selectRuntime: mocks.selectRuntime,
}));

import { runIVRSimulationScenario } from "@/services/ivr/ivr-simulation-scenario.service";

describe("IVR simulation scenario", () => {
  const nodes = [
    { id: "start", data: { nodeKind: "START", runtimeMode: "AUTO", runtimeDefault: "STANDARD" } },
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
        question: "What documents do I need?",
        knowledgeDocumentIds: ["doc-1"],
      },
    },
    { id: "end", data: { nodeKind: "END_CALL" } },
  ];

  const edges = [
    { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
    { source: "menu", target: "knowledge", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } },
    { source: "knowledge", target: "end", data: { trigger: "DEFAULT" } },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRuntime.mockReturnValue({
      selectedRuntime: "STANDARD",
      reasonCode: "AUTO_INFORMATIONAL_USE_CASE",
      reasonText: "Informational routing stays on Standard runtime.",
    });
  });

  it("executes multiple steps in order and keeps the entry-selected runtime stable", () => {
    const result = runIVRSimulationScenario({
      nodes,
      edges,
      tenantId: "tenant-a",
      scenario: {
        name: "Support journey",
        steps: [
          {
            id: "step-1",
            callerInput: "English",
            dtmfInput: "1",
            expected: {
              expectedRuntime: "STANDARD",
              expectedLanguage: "en",
            },
          },
          {
            id: "step-2",
            callerInput: "I need a personal loan",
            expected: {
              expectedRuntime: "STANDARD",
            },
          },
        ],
      },
    });

    expect(result.blocked).toBe(false);
    expect(result.status).toBe("PASS");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].snapshot.selectedRuntime).toBe("STANDARD");
    expect(result.steps[1].snapshot.selectedRuntime).toBe("STANDARD");
    expect(result.steps[0].snapshot.runtimeReasonCode).toBe("AUTO_INFORMATIONAL_USE_CASE");
    expect(result.steps[1].snapshot.runtimeReasonCode).toBe("AUTO_INFORMATIONAL_USE_CASE");
    expect(result.steps[0].snapshot.language).toBe("en");
    expect(result.steps[1].snapshot.detectedIntent).toBe("PERSONAL_LOAN");
  });

  it("fails deterministically when an expectation is contradicted", () => {
    const result = runIVRSimulationScenario({
      nodes,
      edges,
      tenantId: "tenant-a",
      scenario: {
        name: "Expectation mismatch",
        steps: [
          {
            id: "step-1",
            callerInput: "English",
            expected: {
              expectedRuntime: "PREMIUM",
            },
          },
        ],
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.steps[0].status).toBe("FAIL");
    expect(result.steps[0].issues).toEqual(expect.arrayContaining([
      expect.stringContaining("Expected runtime PREMIUM"),
    ]));
  });

  it("blocks simulation for an invalid graph", () => {
    const result = runIVRSimulationScenario({
      nodes: [
        { id: "menu", data: { nodeKind: "HYBRID_MENU", prompt: "Choose", options: [{ digit: "1", label: "Continue", destinationNodeId: "end" }] } },
      ],
      edges: [],
      scenario: {
        name: "Broken graph",
        steps: [{ id: "step-1", callerInput: "English" }],
      },
    });

    expect(result.blocked).toBe(true);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.blockedIssues.map(issue => issue.code)).toContain("INVALID_START_COUNT");
    expect(result.steps).toHaveLength(0);
  });
});
