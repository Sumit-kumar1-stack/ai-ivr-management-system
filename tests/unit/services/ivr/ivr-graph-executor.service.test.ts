import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCall: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
  getState: vi.fn(),
  getConversation: vi.fn(),
  getMemory: vi.fn(),
  generateAIResponse: vi.fn(),
  retrieveKnowledge: vi.fn(),
  resolveSecureCampaignKnowledgeDocumentIds: vi.fn(),
  triggerCampaignActionForVoiceOutcome: vi.fn(),
  orchestrateHumanTransfer: vi.fn(),
  resolveTenantHumanTransferDestination: vi.fn(),
  beginCallbackConversation: vi.fn(),
  recordMenuFailure: vi.fn(),
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

vi.mock("@/services/ivr/ivr-menu-session.service", () => ({
  IVRMenuSessionService: {
    recordFailure: mocks.recordMenuFailure,
    reset: vi.fn(),
    getState: vi.fn(),
  },
}));

vi.mock("@/services/conversations/conversation-state.service", () => ({
  ConversationStateService: {
    getState: mocks.getState,
  },
}));

vi.mock("@/services/conversations/conversation.service", () => ({
  ConversationService: {
    getConversation: mocks.getConversation,
  },
}));

vi.mock("@/services/conversations/memory.service", () => ({
  getConversationMemory: mocks.getMemory,
}));

vi.mock("@/services/ai/ai-response.service", () => ({
  generateAIResponse: mocks.generateAIResponse,
}));

vi.mock("@/services/knowledge/retrieval.service", () => ({
  retrieveKnowledge: mocks.retrieveKnowledge,
}));

vi.mock("@/services/knowledge/campaign-knowledge.service", () => ({
  resolveSecureCampaignKnowledgeDocumentIds:
    mocks.resolveSecureCampaignKnowledgeDocumentIds,
}));

vi.mock("@/services/communication/campaign-action-resolver.service", () => ({
  triggerCampaignActionForVoiceOutcome:
    mocks.triggerCampaignActionForVoiceOutcome,
}));

vi.mock("@/services/telephony/human-transfer-orchestrator.service", () => ({
  orchestrateHumanTransfer: mocks.orchestrateHumanTransfer,
}));

vi.mock("@/services/telephony/human-transfer-destination.service", () => ({
  resolveTenantHumanTransferDestination: mocks.resolveTenantHumanTransferDestination,
}));

vi.mock("@/services/conversations/callback-conversation.service", () => ({
  beginCallbackConversation: mocks.beginCallbackConversation,
}));

import {
  executeIVRGraphRoute,
  startIVRGraphExecution,
} from "@/services/ivr/ivr-graph-executor.service";

const baseNodes = {
  start: { id: "start", data: { nodeKind: "START" } },
  greeting: {
    id: "greeting",
    data: { nodeKind: "GREETING", prompt: "Welcome to the line." },
  },
  knowledge: {
    id: "knowledge",
    data: {
      nodeKind: "KNOWLEDGE",
      question: "What is the approved loan rate?",
      knowledgeDocumentIds: ["doc-2"],
    },
  },
  action: {
    id: "action",
    data: {
      nodeKind: "ACTION",
      prompt: "Connecting you now.",
      actionCode: "REQUEST_HUMAN",
    },
  },
  transfer: {
    id: "transfer",
    data: {
      nodeKind: "HUMAN_TRANSFER",
      prompt: null,
      transferDestinationId: "agent-1",
    },
  },
  callback: {
    id: "callback",
    data: {
      nodeKind: "CALLBACK",
      prompt: "Let me start the callback workflow.",
    },
  },
  menu: {
    id: "menu",
    data: { nodeKind: "HYBRID_MENU", prompt: "Press 1 to continue." },
  },
  end: {
    id: "end",
    data: { nodeKind: "END_CALL", prompt: "Thank you for calling. Goodbye." },
  },
};

function buildVersion(
  nodes: Array<(typeof baseNodes)[keyof typeof baseNodes]>,
  edges: Array<{ source: string; target: string; data?: Record<string, unknown> }>,
  overrides: Partial<{ id: string; tenantId: string | null; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }> = {}
) {
  return {
    id: overrides.id ?? "v1",
    tenantId: overrides.tenantId ?? "tenant-1",
    status: overrides.status ?? "PUBLISHED",
    nodes,
    edges,
  };
}

function buildCall(version: ReturnType<typeof buildVersion>, overrides: Record<string, unknown> = {}) {
  return {
    id: "call-1",
    ivrFlowVersionId: version.id,
    ivrFlowVersion: version,
    tenantId: "tenant-1",
    direction: "INBOUND",
    callerNumber: "+15551234567",
    contactPhoneSnapshot: "+15550000000",
    campaignId: "campaign-1",
    authenticationLevel: "AUTH_LEVEL_0",
    campaign: {
      ownerUserId: "owner-1",
      ownerUser: {
        tenantId: "tenant-1",
      },
    },
    inboundProfile: {
      knowledgeDocumentIds: ["doc-1", "doc-2"],
      callbackEnabled: true,
    },
    ...overrides,
  };
}

describe("IVRGraphExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getState.mockReturnValue("LISTENING");
    mocks.getConversation.mockResolvedValue({
      messages: [
        { role: "ASSISTANT", content: "Hello, how can I help?" },
        { role: "USER", content: "What is the approved loan rate?" },
      ],
    });
    mocks.getMemory.mockResolvedValue("Approved loan summary.");
    mocks.generateAIResponse.mockResolvedValue(
      "The approved loan rate is 12% APR."
    );
    mocks.getSession.mockResolvedValue({
      flowId: "v1",
      currentNodeId: "menu",
      lastTrigger: "DEFAULT",
      lastValue: null,
    });
    mocks.resolveSecureCampaignKnowledgeDocumentIds.mockResolvedValue(["doc-2"]);
    mocks.retrieveKnowledge.mockResolvedValue([
      {
        content: "Approved response from knowledge base.",
        score: 1,
        documentId: "doc-2",
        chunkIndex: 0,
        classification: "PUBLIC_PRODUCT_INFO",
      },
    ]);
    mocks.triggerCampaignActionForVoiceOutcome.mockResolvedValue({
      matched: true,
      executed: true,
      duplicate: false,
      actionCode: "REQUEST_HUMAN",
      type: "MOCK",
      status: null,
      reason: "ok",
    });
    mocks.orchestrateHumanTransfer.mockResolvedValue({
      requested: true,
      transferred: true,
      message: "Connected to a human agent.",
      code: null,
      callbackOffered: false,
    });
    mocks.resolveTenantHumanTransferDestination.mockResolvedValue({
      ok: true,
      destination: "+15557654321",
      destinationUserId: "agent-1",
    });
    mocks.beginCallbackConversation.mockResolvedValue({
      handled: true,
      completed: false,
      needsConfirmation: false,
      prompt: "Please tell me the best number and time for the callback.",
      missingFields: ["phone"],
    });
    mocks.recordMenuFailure.mockResolvedValue({
      attempts: 1,
      maxAttempts: 3,
      remainingAttempts: 2,
      exhausted: false,
      lastFailure: "INVALID",
    });
  });

  it("uses the pinned flow version and traverses START through GREETING to HYBRID_MENU", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.greeting, baseNodes.menu],
      [
        { source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
        { source: "greeting", target: "menu", data: { trigger: "DEFAULT" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "menu",
      speechText: "Welcome to the line.",
      awaitInput: true,
      endCall: false,
    });

    expect(mocks.getCall).toHaveBeenCalledWith("call-1");
    expect(mocks.setSession).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({
        flowId: "v1",
        currentNodeId: "menu",
      })
    );
  });

  it("retrieves scoped knowledge and follows the configured destination", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.knowledge, baseNodes.menu],
      [
        { source: "start", target: "knowledge", data: { trigger: "DEFAULT" } },
        {
          source: "knowledge",
          target: "menu",
          data: { trigger: "KNOWLEDGE_FOUND" },
        },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(mocks.resolveSecureCampaignKnowledgeDocumentIds).not.toHaveBeenCalled();
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      "What is the approved loan rate?",
      3,
      expect.objectContaining({
        knowledgeDocumentIds: ["doc-2"],
        tenantId: "tenant-1",
        ownerUserId: "owner-1",
        callId: "call-1",
      })
    );
    expect(mocks.generateAIResponse).toHaveBeenCalledTimes(1);
    expect(mocks.generateAIResponse.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining("CUSTOMER QUERY")
    );
    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "menu",
      speechText: "The approved loan rate is 12% APR.",
      awaitInput: true,
    });
  });

  it("resolves outbound knowledge through the secure campaign scope", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.knowledge, baseNodes.menu],
      [
        { source: "start", target: "knowledge", data: { trigger: "DEFAULT" } },
        {
          source: "knowledge",
          target: "menu",
          data: { trigger: "KNOWLEDGE_FOUND" },
        },
      ]
    );

    mocks.getConversation.mockResolvedValue({ messages: [] });
    mocks.getCall.mockResolvedValue(
      buildCall(version, {
        direction: "OUTBOUND",
        inboundProfile: null,
      })
    );

    const result = await startIVRGraphExecution("call-1");

    expect(mocks.resolveSecureCampaignKnowledgeDocumentIds).toHaveBeenCalledWith(
      "campaign-1",
      expect.objectContaining({
        ownerUserId: "owner-1",
      })
    );
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      "What is the approved loan rate?",
      3,
      expect.objectContaining({
        knowledgeDocumentIds: ["doc-2"],
        tenantId: "tenant-1",
        ownerUserId: "owner-1",
      })
    );
    expect(result.status).toBe("AWAITING_INPUT");
  });

  it("narrows node scope against the target scope", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.knowledge, baseNodes.menu],
      [
        { source: "start", target: "knowledge", data: { trigger: "DEFAULT" } },
        {
          source: "knowledge",
          target: "menu",
          data: { trigger: "KNOWLEDGE_FOUND" },
        },
      ]
    );

    mocks.getConversation.mockResolvedValue({ messages: [] });
    mocks.getCall.mockResolvedValue(
      buildCall(version, {
        inboundProfile: {
          knowledgeDocumentIds: ["doc-1", "doc-2"],
          callbackEnabled: true,
        },
      })
    );
    mocks.retrieveKnowledge.mockResolvedValue([]);

    await startIVRGraphExecution("call-1");

    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      "What is the approved loan rate?",
      3,
      expect.objectContaining({
        knowledgeDocumentIds: ["doc-2"],
      })
    );
  });

  it("returns a controlled fallback when secure scope is empty", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.knowledge],
      [{ source: "start", target: "knowledge", data: { trigger: "DEFAULT" } }]
    );

    mocks.getConversation.mockResolvedValue({ messages: [] });
    mocks.getCall.mockResolvedValue(
      buildCall(version, {
        inboundProfile: {
          knowledgeDocumentIds: [],
          callbackEnabled: true,
        },
      })
    );
    mocks.retrieveKnowledge.mockResolvedValue([]);

    const result = await startIVRGraphExecution("call-1");

    expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "knowledge",
      speechText: "I couldn't find that information in our knowledge base.",
    });
  });

  it("uses the fallback edge when no relevant result is returned", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.knowledge, baseNodes.menu],
      [
        { source: "start", target: "knowledge", data: { trigger: "DEFAULT" } },
        {
          source: "knowledge",
          target: "menu",
          data: { trigger: "NO_RELEVANT_KNOWLEDGE" },
        },
      ]
    );

    mocks.getConversation.mockResolvedValue({ messages: [] });
    mocks.getCall.mockResolvedValue(buildCall(version));
    mocks.retrieveKnowledge.mockResolvedValue([]);

    const result = await startIVRGraphExecution("call-1");

    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "menu",
      speechText: "I couldn't find that information in our knowledge base.",
      awaitInput: true,
    });
  });

  it("fails safely when the knowledge query cannot be resolved", async () => {
    const version = buildVersion(
      [baseNodes.start, { ...baseNodes.knowledge, data: { nodeKind: "KNOWLEDGE" } }],
      [
        { source: "start", target: "knowledge", data: { trigger: "DEFAULT" } },
      ]
    );

    mocks.getConversation.mockResolvedValue({ messages: [] });
    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result.status).toBe("SAFE_FAILURE");
    expect(result.transitionReason).toBe("KNOWLEDGE_QUERY_MISSING");
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
  });

  it("executes an action node and follows the configured success edge", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.action, baseNodes.menu],
      [
        { source: "start", target: "action", data: { trigger: "DEFAULT" } },
        { source: "action", target: "menu", data: { trigger: "ACTION_SUCCESS" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(mocks.triggerCampaignActionForVoiceOutcome).toHaveBeenCalledTimes(1);
    expect(mocks.triggerCampaignActionForVoiceOutcome).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({
        intent: "REQUEST_HUMAN",
        requestedAction: "REQUEST_HUMAN",
        handled: true,
      })
    );
    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "menu",
      speechText: "Connecting you now.",
      awaitInput: true,
    });
  });

  it("executes a human transfer node and preserves the provider response", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.transfer],
      [
        { source: "start", target: "transfer", data: { trigger: "DEFAULT" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(mocks.orchestrateHumanTransfer).toHaveBeenCalledWith(
      "call-1",
      "Caller requested a human agent",
      { destination: "+15557654321", destinationUserId: "agent-1" }
    );
    expect(result).toMatchObject({
      status: "EXECUTED",
      currentNodeId: "transfer",
      speechText: "Connected to a human agent.",
      awaitInput: false,
      endCall: false,
    });
    expect(mocks.resolveTenantHumanTransferDestination).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      destinationUserId: "agent-1",
    });
  });

  it("starts the callback workflow and stops for caller input", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.callback],
      [
        { source: "start", target: "callback", data: { trigger: "DEFAULT" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(mocks.beginCallbackConversation).toHaveBeenCalledWith("call-1", {
      phone: "+15551234567",
      reason: "Let me start the callback workflow.",
    });
    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "callback",
      speechText: "Let me start the callback workflow.",
      awaitInput: true,
      endCall: false,
    });
  });

  it("returns the terminal speech for END_CALL and ignores later input", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.greeting, baseNodes.end],
      [
        { source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
        { source: "greeting", target: "end", data: { trigger: "DEFAULT" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result).toMatchObject({
      status: "ENDED",
      currentNodeId: "end",
      speechText: "Thank you for calling. Goodbye.",
      awaitInput: false,
      endCall: true,
    });
  });

  it("returns a retry prompt for unmatched menu input", async () => {
    const version = buildVersion(
      [
        { ...baseNodes.start, data: { nodeKind: "START", inputExperience: "STAGED_HYBRID", defaultAiNodeId: "ai" } } as typeof baseNodes.start,
        {
          ...baseNodes.menu,
          data: {
            nodeKind: "HYBRID_MENU",
            prompt: "Press 1 to continue.",
            runtimeMenu: {
              type: "DTMF_MENU",
              prompt: "Press 1 to continue.",
              invalidPrompt: "That option is not available.",
              timeoutPrompt: "I did not receive a selection.",
              exhaustedPrompt: "Please continue with the voice assistant.",
              maxAttempts: 3,
            },
            options: [
              {
                digit: "1",
                label: "Continue",
                action: "CONTINUE_AI",
                response: "Continuing now.",
              },
            ],
          },
        } as unknown as (typeof baseNodes)["menu"],
      ],
      [
        { source: "start", target: "menu", data: { trigger: "DEFAULT" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));
    mocks.getSession.mockResolvedValue({
      flowId: "v1",
      currentNodeId: "menu",
      previousNodeId: "start",
      lastTrigger: "DEFAULT",
      lastValue: null,
      navigationHistory: ["start"],
    });

    const result = await executeIVRGraphRoute(
      "call-1",
      {
        matched: false,
        confidence: 0,
        resultingNodeId: null,
        transition: null,
        action: "CLARIFY",
        optionLabel: null,
      },
      { mode: "DTMF", value: "9" }
    );

    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "menu",
      awaitInput: true,
      entryInputStage: true,
      entryTimeoutSeconds: 8,
    });
    expect(result.speechText).toContain("attempts remaining");
  });

  it("bounds malformed automatic loops", async () => {
    const version = buildVersion(
      [baseNodes.start],
      [{ source: "start", target: "start", data: { trigger: "DEFAULT" } }]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result.status).toBe("SAFE_FAILURE");
    expect(result.transitionReason).toBe("AUTOMATIC_TRANSITION_LIMIT_EXCEEDED");
  });

  it("fails safely when the pinned version tenant does not match the call tenant", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.menu],
      [{ source: "start", target: "menu", data: { trigger: "DEFAULT" } }],
      { tenantId: "tenant-2" }
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result.status).toBe("SAFE_FAILURE");
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
    expect(mocks.triggerCampaignActionForVoiceOutcome).not.toHaveBeenCalled();
    expect(mocks.orchestrateHumanTransfer).not.toHaveBeenCalled();
    expect(mocks.beginCallbackConversation).not.toHaveBeenCalled();
  });

  it("does not use a draft or mismatched pinned version", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.menu],
      [{ source: "start", target: "menu", data: { trigger: "DEFAULT" } }],
      { id: "v1", status: "DRAFT" }
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result.status).toBe("SAFE_FAILURE");
  });

  it("rejects routed execution after termination starts", async () => {
    const version = buildVersion(
      [baseNodes.start, baseNodes.menu],
      [{ source: "start", target: "menu", data: { trigger: "DEFAULT" } }]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));
    mocks.getState.mockReturnValue("TERMINATING");

    const result = await executeIVRGraphRoute(
      "call-1",
      {
        matched: true,
        confidence: 1,
        resultingNodeId: "menu",
        transition: "MENU_OPTION",
        action: "NAVIGATE",
        optionLabel: "Continue",
      },
      {
        mode: "DTMF",
        value: "1",
      }
    );

    expect(result.status).toBe("SAFE_FAILURE");
  });

  it("treats DTMF_MENU as an input node and waits for caller input", async () => {
    const version = buildVersion(
      [
        baseNodes.start,
        {
          id: "menu",
          data: {
            nodeKind: "DTMF_MENU",
            prompt: "Press 1 to continue.",
          },
        },
      ],
      [{ source: "start", target: "menu", data: { trigger: "DEFAULT" } }]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "menu",
      speechText: "Press 1 to continue.",
      awaitInput: true,
    });
  });

  it("evaluates CONDITION nodes using deterministic runtime data", async () => {
    const version = buildVersion(
      [
        baseNodes.start,
        {
          id: "condition",
          data: {
            nodeKind: "CONDITION",
            conditionExpression: "call.direction === 'INBOUND'",
          } as never,
        },
        baseNodes.menu,
      ],
      [
        { source: "start", target: "condition", data: { trigger: "DEFAULT" } },
        { source: "condition", target: "menu", data: { trigger: "TRUE" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result.currentNodeId).toBe("menu");
    expect(result.status).toBe("AWAITING_INPUT");
  });

  it("evaluates AUTH_GATE nodes against the current call authentication level", async () => {
    const version = buildVersion(
      [
        baseNodes.start,
        {
          id: "auth",
          data: {
            nodeKind: "AUTH_GATE",
            requiredAuthLevel: "AUTH_LEVEL_1",
          } as never,
        },
        baseNodes.menu,
      ],
      [
        { source: "start", target: "auth", data: { trigger: "DEFAULT" } },
        { source: "auth", target: "menu", data: { trigger: "PASS" } },
      ]
    );

    mocks.getCall.mockResolvedValue(
      buildCall(version, {
        authenticationLevel: "AUTH_LEVEL_1",
      })
    );

    const result = await startIVRGraphExecution("call-1");

    expect(result.currentNodeId).toBe("menu");
    expect(result.status).toBe("AWAITING_INPUT");
  });

  it("routes BUSINESS_HOURS nodes using the configured service window", async () => {
    const currentHour = new Date().getUTCHours();
    const previousStart = process.env.HUMAN_TRANSFER_START_HOUR;
    const previousEnd = process.env.HUMAN_TRANSFER_END_HOUR;
    const previousTimezone = process.env.HUMAN_TRANSFER_TIMEZONE;

    process.env.HUMAN_TRANSFER_TIMEZONE = "UTC";
    process.env.HUMAN_TRANSFER_START_HOUR = String(currentHour);
    process.env.HUMAN_TRANSFER_END_HOUR = String((currentHour + 1) % 24);

    try {
      const version = buildVersion(
        [
          baseNodes.start,
        {
          id: "hours",
          data: {
            nodeKind: "BUSINESS_HOURS",
            timezone: "UTC",
          } as never,
        },
          baseNodes.menu,
        ],
        [
          { source: "start", target: "hours", data: { trigger: "DEFAULT" } },
          { source: "hours", target: "menu", data: { trigger: "OPEN" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));

      const result = await startIVRGraphExecution("call-1");

      expect(result.currentNodeId).toBe("menu");
      expect(result.status).toBe("AWAITING_INPUT");
    } finally {
      process.env.HUMAN_TRANSFER_START_HOUR = previousStart;
      process.env.HUMAN_TRANSFER_END_HOUR = previousEnd;
      process.env.HUMAN_TRANSFER_TIMEZONE = previousTimezone;
    }
  });

  it("executes SEND_INFORMATION nodes through the action gateway", async () => {
    const version = buildVersion(
      [baseNodes.start, { id: "info", data: { nodeKind: "SEND_INFORMATION" } }, baseNodes.menu],
      [
        { source: "start", target: "info", data: { trigger: "DEFAULT" } },
        { source: "info", target: "menu", data: { trigger: "ACTION_SUCCESS" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(mocks.triggerCampaignActionForVoiceOutcome).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({
        intent: "SEND_INFORMATION",
        requestedAction: "SEND_INFORMATION",
      })
    );
    expect(result.currentNodeId).toBe("menu");
    expect(result.status).toBe("AWAITING_INPUT");
  });

  it("treats AI_CONVERSATION as a listening node", async () => {
    const version = buildVersion(
      [
        baseNodes.start,
        {
          id: "ai",
          data: {
            nodeKind: "AI_CONVERSATION",
            prompt: "How can I help you today?",
          },
        },
      ],
      [{ source: "start", target: "ai", data: { trigger: "DEFAULT" } }]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));

    const result = await startIVRGraphExecution("call-1");

    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "ai",
      speechText: "How can I help you today?",
      awaitInput: true,
    });
  });
});
