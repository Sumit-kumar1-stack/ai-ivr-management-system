import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCall: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
  routeStandardInput: vi.fn(),
  executeIVRGraphRoute: vi.fn(),
}));

vi.mock("@/services/calls/call.service", () => ({
  getCall: mocks.getCall,
}));

vi.mock("@/services/ivr/ivr-flow-session.service", () => ({
  IVRFlowSessionService: {
    get: mocks.getSession,
    set: mocks.setSession,
  },
}));

vi.mock("@/services/ivr/standard-input-router.service", () => ({
  routeStandardInput: mocks.routeStandardInput,
}));

vi.mock("@/services/ivr/ivr-graph-executor.service", () => ({
  executeIVRGraphRoute: mocks.executeIVRGraphRoute,
}));

import { routeDtmfThroughIVR, routeVoiceThroughIVR } from "@/services/ivr/ivr-hybrid-router.service";

describe("IVRHybridRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getCall.mockResolvedValue({
      id: "call-1",
      campaignId: "campaign-1",
      tenantId: "tenant-1",
      ivrFlowVersion: {
        id: "version-1",
        status: "PUBLISHED",
        tenantId: "tenant-1",
        nodes: [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "menu",
            data: {
              nodeKind: "HYBRID_MENU",
              options: [
                {
                  label: "Loan",
                  digit: "1",
                  voicePhrases: ["loan"],
                  destinationNodeId: "knowledge",
                },
              ],
            },
          },
          { id: "knowledge", data: { nodeKind: "KNOWLEDGE" } },
        ],
        edges: [
          { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
          { source: "menu", target: "knowledge", data: { trigger: "MENU_OPTION" } },
        ],
      },
    });

    mocks.getSession.mockResolvedValue({
      flowId: "version-1",
      currentNodeId: "menu",
      previousNodeId: "start",
      lastTrigger: "DEFAULT",
      lastValue: null,
      navigationHistory: ["start"],
    });

    mocks.routeStandardInput.mockReturnValue({
      matched: true,
      confidence: 1,
      resultingNodeId: "knowledge",
      transition: "MENU_OPTION",
      action: "NAVIGATE",
      optionLabel: "Loan",
    });

    mocks.executeIVRGraphRoute.mockResolvedValue({
      status: "AWAITING_INPUT",
      currentNodeId: "knowledge",
      nextNodeId: null,
      speechText: "Knowledge response.",
      awaitInput: true,
      endCall: false,
      transitionReason: "KNOWLEDGE_FOUND",
    });
  });

  it("routes voice through the shared standard router and graph executor", async () => {
    const result = await routeVoiceThroughIVR("call-1", "loan");

    expect(mocks.routeStandardInput).toHaveBeenCalledWith(
      expect.objectContaining({
        currentNodeId: "menu",
        inputMode: "VOICE",
        rawInput: "loan",
      })
    );
    expect(mocks.executeIVRGraphRoute).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({
        matched: true,
        resultingNodeId: "knowledge",
      }),
      expect.objectContaining({
        mode: "VOICE",
        value: "loan",
      })
    );
    expect(result).toMatchObject({
      matched: true,
      action: "NAVIGATE",
      graphExecution: {
        currentNodeId: "knowledge",
        speechText: "Knowledge response.",
      },
    });
  });

  it("skips IVR routing when the current node is AI conversation", async () => {
    mocks.getSession.mockResolvedValue({
      flowId: "version-1",
      currentNodeId: "ai",
      previousNodeId: "start",
      lastTrigger: "DEFAULT",
      lastValue: null,
      navigationHistory: ["start"],
    });
    mocks.getCall.mockResolvedValue({
      id: "call-1",
      campaignId: "campaign-1",
      tenantId: "tenant-1",
      ivrFlowVersion: {
        id: "version-1",
        status: "PUBLISHED",
        tenantId: "tenant-1",
        nodes: [
          { id: "ai", data: { nodeKind: "AI_CONVERSATION" } },
        ],
        edges: [],
      },
    });

    const result = await routeVoiceThroughIVR("call-1", "help me");

    expect(result.matched).toBe(false);
    expect(mocks.routeStandardInput).not.toHaveBeenCalled();
    expect(mocks.executeIVRGraphRoute).not.toHaveBeenCalled();
  });

  it("persists the selected staged option intent, department, and language after its graph transition", async () => {
    const entrySession = { flowId: "version-1", currentNodeId: "menu", previousNodeId: "start", lastTrigger: "DEFAULT", lastValue: null, navigationHistory: ["start"], inputExperience: "STAGED_HYBRID", inputStage: "ENTRY_IVR" };
    mocks.getCall.mockResolvedValue({
      id: "call-1", campaignId: "campaign-1", tenantId: "tenant-1",
      ivrFlowVersion: {
        id: "version-1", status: "PUBLISHED", tenantId: "tenant-1",
        nodes: [
          { id: "start", data: { nodeKind: "START" } },
          { id: "menu", data: { nodeKind: "HYBRID_MENU", options: [{ label: "Personal loans", digit: "1", intent: "PERSONAL_LOAN", department: "Loans", language: "Hindi", destinationNodeId: "ai" }] } },
          { id: "ai", data: { nodeKind: "AI_CONVERSATION" } },
        ],
        edges: [{ source: "menu", target: "ai", sourceHandle: "1", data: { trigger: "DTMF", value: "1" } }],
      },
    });
    mocks.getSession.mockResolvedValueOnce(entrySession).mockResolvedValueOnce({ ...entrySession, currentNodeId: "ai", previousNodeId: "menu" });
    mocks.routeStandardInput.mockReturnValue({ matched: true, confidence: 1, resultingNodeId: "ai", transition: "DTMF", action: "NAVIGATE", optionLabel: "Personal loans" });

    await routeDtmfThroughIVR("call-1", "1");

    expect(mocks.setSession).toHaveBeenCalledWith("call-1", expect.objectContaining({
      currentNodeId: "ai", selectedDigit: "1", selectedIntent: "PERSONAL_LOAN",
      selectedDepartment: "Loans", preferredLanguage: "Hindi", inputStage: "REALTIME_AI",
    }));
  });
});
