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
  computeNormalizedRetrievalConfidence,
  executeIVRGraphRoute,
  startIVRGraphExecution,
} from "@/services/ivr/ivr-graph-executor.service";

type TestNodeData = {
  nodeKind: string;
  prompt?: string | null;
  greeting?: string | null;
  question?: string;
  knowledgeDocumentIds?: string[];
  actionCode?: string;
  transferDestinationId?: string;
  inputExperience?: "VOICE" | "KEYPAD" | "STAGED_HYBRID" | string;
  runtimeMode?: "STANDARD" | "PREMIUM" | "AUTO" | string;
  defaultAiNodeId?: string;
  label?: string;
  runtimeMenu?: Record<string, unknown>;
  options?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type TestNode = {
  id: string;
  data?: TestNodeData;
};

const baseNodes: Record<string, TestNode> = {
  start: {
    id: "start",
    data: { nodeKind: "START" },
  },
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
  nodes: TestNode[],
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
        skipRerank: true,
      })
    );
    expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "AWAITING_INPUT",
      currentNodeId: "menu",
      speechText: "Approved response from knowledge base.",
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
        { ...baseNodes.start, data: { nodeKind: "START", inputExperience: "STAGED_HYBRID", defaultAiNodeId: "ai" } },
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
        },
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

  // ------------------------------------------------------------------
  // REGRESSION: Real F3 HYBRID_MENU must produce entryInputStage=true
  // for any streaming runtime (GEMINI_LIVE, CASCADED) even when the
  // START node has inputExperience: "VOICE" (not "STAGED_HYBRID").
  // Previously isStagedHybridEntry only checked START.inputExperience
  // which caused STREAM mode instead of STAGED_ENTRY on every real call.
  // ------------------------------------------------------------------

  it("F3-REG-1: HYBRID_MENU with requestedRuntime=GEMINI_LIVE and START.inputExperience=VOICE produces entryInputStage=true", async () => {
    // This is the EXACT real F3 shape:
    // START.data.inputExperience = "VOICE" (NOT "STAGED_HYBRID")
    // call.requestedRuntime = "GEMINI_LIVE"
    // Graph: START -> GREETING -> HYBRID_MENU
    const f3StartNode = {
      id: "start",
      data: { nodeKind: "START", inputExperience: "VOICE", runtimeMode: "PREMIUM" },
    };
    const f3GreetingNode = {
      id: "greeting",
      data: { nodeKind: "GREETING", prompt: "Welcome to Apex Financial Services." },
    };
    const f3MenuNode = {
      id: "hybrid_menu",
      data: {
        nodeKind: "HYBRID_MENU",
        label: "Main Menu",
        prompt: "Press 1 for Loan Info, 2 for Eligibility, 3 for Documents, 4 for Human Agent, 8 to Repeat, 9 to End.",
        runtimeMenu: { maxAttempts: 3, timeoutSeconds: 8, timeoutPrompt: "We didn't receive any input.", exhaustedPrompt: "Maximum attempts reached." },
        options: [
          { digit: "1", label: "Loan Information", destinationNodeId: "knowledge_loan" },
          { digit: "2", label: "Eligibility", destinationNodeId: "knowledge_eligibility" },
          { digit: "3", label: "Documents", destinationNodeId: "knowledge_docs" },
          { digit: "4", label: "Human Agent", destinationNodeId: "auth_gate" },
          { digit: "8", label: "Repeat", destinationNodeId: "hybrid_menu" },
          { digit: "9", label: "End Call", destinationNodeId: "end_call" },
        ],
      },
    };

    const version = buildVersion(
      [f3StartNode, f3GreetingNode, f3MenuNode],
      [
        { source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
        { source: "greeting", target: "hybrid_menu", data: { trigger: "DEFAULT" } },
      ]
    );

    mocks.getCall.mockResolvedValue(buildCall(version, { requestedRuntime: "GEMINI_LIVE" }));

    const result = await startIVRGraphExecution("call-1");

    expect(result.status).toBe("AWAITING_INPUT");
    expect(result.currentNodeId).toBe("hybrid_menu");
    expect(result.awaitInput).toBe(true);
    expect(result.endCall).toBe(false);
    // This is the key assertion that was previously failing:
    expect(result.entryInputStage).toBe(true);
    expect(result.entryPrompt).toBeTruthy();
    expect(result.entryTimeoutSeconds).toBe(8);
  });

  it("F3-REG-2: AI_CONVERSATION node with GEMINI_LIVE runtime produces entryInputStage=false (should open streaming)", async () => {
    const aiNode = {
      id: "ai_node",
      data: { nodeKind: "AI_CONVERSATION", prompt: "How can I help you today?" },
    };
    const version = buildVersion(
      [{ id: "start", data: { nodeKind: "START", inputExperience: "VOICE" } }, aiNode],
      [{ source: "start", target: "ai_node", data: { trigger: "DEFAULT" } }]
    );

    mocks.getCall.mockResolvedValue(buildCall(version, { requestedRuntime: "GEMINI_LIVE" }));

    const result = await startIVRGraphExecution("call-1");

    expect(result.status).toBe("AWAITING_INPUT");
    expect(result.currentNodeId).toBe("ai_node");
    // AI_CONVERSATION should NOT trigger staged entry (must open stream)
    expect(result.entryInputStage).toBe(false);
  });

  it("LAT-1: Menu-driven navigation into KNOWLEDGE node uses fast-path BM25 and NEVER calls Gemini LLM or AI reranker", async () => {
    const knowledgeNode = {
      id: "knowledge_loan",
      data: {
        nodeKind: "KNOWLEDGE",
        label: "Loan Information",
        prompt: "Tell me about personal loan options.",
        knowledgeDocumentIds: ["doc-1"],
      },
    };
    const version = buildVersion(
      [{ id: "start", data: { nodeKind: "START" } }, knowledgeNode],
      [{ source: "start", target: "knowledge_loan", data: { trigger: "DEFAULT" } }]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));
    mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
    mocks.retrieveKnowledge.mockResolvedValue([
      { content: "Personal loans start at 8.5% APR up to $50,000.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
    ]);

    const result = await executeIVRGraphRoute(
      "call-1",
      {
        matched: true,
        confidence: 1,
        resultingNodeId: "knowledge_loan",
        transition: "DTMF_1",
        action: "NAVIGATE",
        optionLabel: "Loan Information",
      },
      { mode: "DTMF", value: "1" }
    );

    expect(result.transitionReason).toBe("KNOWLEDGE_FOUND");
    expect(result.speechText).toContain("Personal loans start at 8.5% APR");
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      "Tell me about personal loan options.",
      3,
      expect.objectContaining({
        skipRerank: true,
        knowledgeDocumentIds: ["doc-1"],
      })
    );
    expect(mocks.generateAIResponse).not.toHaveBeenCalled();
  });

  it("LAT-2: Free-form conversational user query into KNOWLEDGE node uses AI generation", async () => {
    const knowledgeNode = {
      id: "knowledge_docs",
      data: {
        nodeKind: "KNOWLEDGE",
        querySource: "TRANSCRIPT",
        knowledgeDocumentIds: ["doc-2"],
      },
    };
    const version = buildVersion(
      [{ id: "start", data: { nodeKind: "START" } }, knowledgeNode],
      [{ source: "start", target: "knowledge_docs", data: { trigger: "DEFAULT" } }]
    );

    mocks.getCall.mockResolvedValue(buildCall(version));
    mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
    mocks.getConversation.mockResolvedValue({
      messages: [{ role: "USER", content: "What documents do I need to bring?" }],
    });
    mocks.retrieveKnowledge.mockResolvedValue([
      { content: "You need government ID, 2 pay stubs, and proof of address.", documentId: "doc-2", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
    ]);
    mocks.generateAIResponse.mockResolvedValue("You will need a government ID, two pay stubs, and proof of address.");

    const result = await executeIVRGraphRoute(
      "call-1",
      {
        matched: true,
        confidence: 1,
        resultingNodeId: "knowledge_docs",
        transition: "VOICE_QUERY",
        action: "NAVIGATE",
        optionLabel: "Documents",
      },
      { mode: "VOICE", value: "What documents do I need to bring?" }
    );

    expect(result.transitionReason).toBe("KNOWLEDGE_FOUND");
    expect(result.speechText).toBe("You will need a government ID, two pay stubs, and proof of address.");
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      "What documents do I need to bring?",
      3,
      expect.objectContaining({
        skipRerank: false,
        knowledgeDocumentIds: ["doc-2"],
      })
    );
    expect(mocks.generateAIResponse).toHaveBeenCalledTimes(1);
  });

  describe("Phase 1: Adaptive Navigation Execution", () => {
    it("HOME does not replay START greeting when a configured mainMenuNodeId exists and invokes 0 AI calls", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", prompt: "Welcome to Acme Corp.", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu. Press 1 for sales, 2 for support." } },
          { id: "sub_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Sub menu." } },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "sub_menu", data: { trigger: "DTMF", value: "1" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "sub_menu",
        previousNodeId: "main_menu",
      });

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "main_menu",
          transition: "HOME",
          action: "MAIN_MENU",
          optionLabel: "Home",
        },
        { mode: "DTMF", value: "0" }
      );

      expect(result.currentNodeId).toBe("main_menu");
      expect(result.speechText).toBe("Main menu. Press 1 for sales, 2 for support.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
      expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
    });

    it("BACK uses existing previousNodeId and invokes 0 AI calls", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu." } },
          { id: "sub_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Sub menu." } },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "sub_menu", data: { trigger: "DTMF", value: "1" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "sub_menu",
        previousNodeId: "main_menu",
      });

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "main_menu",
          transition: "GO_BACK",
          action: "GO_BACK",
          optionLabel: "Back",
        },
        { mode: "DTMF", value: "*" }
      );

      expect(result.currentNodeId).toBe("main_menu");
      expect(result.speechText).toBe("Main menu.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
      expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
    });

    it("HOME / BACK cannot bypass AUTH_GATE", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          { id: "auth_gate", data: { nodeKind: "AUTH_GATE", requiredAuthLevel: "AUTH_LEVEL_2" } },
          { id: "secure_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Secure accounts menu." } },
          { id: "auth_fail_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Authentication required." } },
        ],
        [
          { source: "start", target: "auth_gate", data: { trigger: "DEFAULT" } },
          { source: "auth_gate", target: "secure_menu", data: { trigger: "PASS" } },
          { source: "auth_gate", target: "auth_fail_menu", data: { trigger: "FAIL" } },
        ]
      );

      mocks.getCall.mockResolvedValue(
        buildCall(version, {
          authenticationLevel: "AUTH_LEVEL_0",
        })
      );
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "start",
      });

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "auth_gate",
          transition: "HOME",
          action: "MAIN_MENU",
          optionLabel: "Home",
        },
        { mode: "DTMF", value: "0" }
      );

      // Gate evaluates unauthenticated caller and routes to auth_fail_menu, preventing access to secure_menu
      expect(result.currentNodeId).toBe("auth_fail_menu");
      expect(result.speechText).toBe("Before I connect you with a representative, I need to complete verification.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });
  });

  describe("Phase 2: Configurable Post-Action Behavior", () => {
    it("RETURN_HOME policy routes to configured home node after knowledge execution with 0 AI calls", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu. Press 1 for loans." } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              question: "What are your hours?",
              knowledgeDocumentIds: ["doc-1"],
              postAction: { mode: "RETURN_HOME" },
            },
          },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "knowledge_node", data: { trigger: "DTMF", value: "1" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "main_menu",
        previousNodeId: "start",
      });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "We are open 9am to 5pm Monday to Friday.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "knowledge_node",
          transition: "MENU_OPTION",
          action: "NAVIGATE",
          optionLabel: "Hours",
        },
        { mode: "DTMF", value: "1" }
      );

      // Successfully answered knowledge and automatically transitioned to main_menu
      expect(result.currentNodeId).toBe("main_menu");
      expect(result.speechText).toContain("We are open 9am to 5pm Monday to Friday.");
      expect(result.status).toBe("AWAITING_INPUT");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("RETURN_PREVIOUS policy returns to session.previousNodeId with 0 AI calls", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu." } },
          { id: "sub_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Sub menu." } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              question: "What are interest rates?",
              knowledgeDocumentIds: ["doc-1"],
              postAction: { mode: "RETURN_PREVIOUS" },
            },
          },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "sub_menu", data: { trigger: "DTMF", value: "1" } },
          { source: "sub_menu", target: "knowledge_node", data: { trigger: "DTMF", value: "2" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "sub_menu",
        previousNodeId: "main_menu",
      });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Interest rate is 5.5% fixed.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "knowledge_node",
          transition: "MENU_OPTION",
          action: "NAVIGATE",
          optionLabel: "Rates",
        },
        { mode: "DTMF", value: "2" }
      );

      // Returns to previousNodeId (sub_menu)
      expect(result.currentNodeId).toBe("sub_menu");
      expect(result.speechText).toContain("Interest rate is 5.5% fixed.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("STAY_CURRENT policy remains on current node awaiting input", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              question: "FAQ item",
              knowledgeDocumentIds: ["doc-1"],
              postAction: { mode: "STAY_CURRENT" },
            },
          },
        ],
        [{ source: "start", target: "knowledge_node", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "FAQ answer content.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "knowledge_node",
          transition: "DEFAULT",
          action: "NAVIGATE",
          optionLabel: "FAQ",
        },
        { mode: "VOICE", value: "FAQ" }
      );

      expect(result.currentNodeId).toBe("knowledge_node");
      expect(result.status).toBe("AWAITING_INPUT");
      expect(result.transitionReason).toBe("STAY_CURRENT");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("CONTINUE_TO_NODE policy routes to configured destination target node", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "info_node",
            data: {
              nodeKind: "SEND_INFORMATION",
              prompt: "We sent the SMS link to your mobile.",
              postAction: { mode: "CONTINUE_TO_NODE", targetNodeId: "feedback_menu" },
            },
          },
          { id: "feedback_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Was this helpful? Press 1 for yes, 2 for no." } },
        ],
        [{ source: "start", target: "info_node", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.triggerCampaignActionForVoiceOutcome.mockResolvedValue({ executed: true, matched: true });

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "info_node",
          transition: "DEFAULT",
          action: "NAVIGATE",
          optionLabel: "Send Info",
        },
        { mode: "DTMF", value: "1" }
      );

      expect(result.currentNodeId).toBe("feedback_menu");
      expect(result.status).toBe("AWAITING_INPUT");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("END_CALL policy terminates with audible goodbye prompt", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "action_node",
            data: {
              nodeKind: "ACTION",
              actionCode: "REGISTER_CALLBACK",
              prompt: "Your request has been registered.",
              postAction: { mode: "END_CALL" },
            },
          },
          { id: "end", data: { nodeKind: "END_CALL", prompt: "Thank you for calling Acme. Goodbye." } },
        ],
        [{ source: "start", target: "action_node", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.triggerCampaignActionForVoiceOutcome.mockResolvedValue({ executed: true, matched: true });

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "action_node",
          transition: "DEFAULT",
          action: "NAVIGATE",
          optionLabel: "Register",
        },
        { mode: "DTMF", value: "1" }
      );

      expect(result.endCall).toBe(true);
      expect(result.status).toBe("ENDED");
      expect(result.speechText).toContain("Your request has been registered.");
      expect(result.speechText).toContain("Thank you for calling Acme. Goodbye.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("ASK_NEXT_ACTION policy uses configured deterministic prompt and invokes 0 AI calls", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              question: "Hospital visiting hours",
              knowledgeDocumentIds: ["doc-1"],
              postAction: {
                mode: "ASK_NEXT_ACTION",
                prompt: "Would you like to hear department extensions, return to the main menu, or speak with an operator?",
              },
            },
          },
        ],
        [{ source: "start", target: "knowledge_node", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Visiting hours are from 10am to 8pm daily in all standard wards.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "knowledge_node",
          transition: "DEFAULT",
          action: "NAVIGATE",
          optionLabel: "Visiting Hours",
        },
        { mode: "VOICE", value: "visiting hours" }
      );

      expect(result.status).toBe("AWAITING_INPUT");
      expect(result.transitionReason).toBe("ASK_NEXT_ACTION");
      expect(result.speechText).toContain("Visiting hours are from 10am to 8pm daily in all standard wards.");
      expect(result.speechText).toContain("Would you like to hear department extensions, return to the main menu, or speak with an operator?");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("CONTINUE_TO_NODE cannot bypass AUTH_GATE when unauthenticated", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              question: "Account tier",
              knowledgeDocumentIds: ["doc-1"],
              postAction: { mode: "CONTINUE_TO_NODE", targetNodeId: "auth_gate" },
            },
          },
          { id: "auth_gate", data: { nodeKind: "AUTH_GATE", requiredAuthLevel: "AUTH_LEVEL_2" } },
          { id: "secure_menu", data: { nodeKind: "HYBRID_MENU", prompt: "VIP Banking menu." } },
          { id: "auth_fail_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Please authenticate first." } },
        ],
        [
          { source: "start", target: "knowledge_node", data: { trigger: "DEFAULT" } },
          { source: "auth_gate", target: "secure_menu", data: { trigger: "PASS" } },
          { source: "auth_gate", target: "auth_fail_menu", data: { trigger: "FAIL" } },
        ]
      );

      mocks.getCall.mockResolvedValue(
        buildCall(version, {
          authenticationLevel: "AUTH_LEVEL_0",
        })
      );
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "You are an Elite member.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 1,
          resultingNodeId: "knowledge_node",
          transition: "DEFAULT",
          action: "NAVIGATE",
          optionLabel: "Tier",
        },
        { mode: "DTMF", value: "1" }
      );

      // Gate blocks transition to secure_menu and redirects to auth_fail_menu
      expect(result.currentNodeId).toBe("auth_fail_menu");
      expect(result.status).toBe("AWAITING_INPUT");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });
  });

  describe("Phase 3: Return-to-Context & Full Navigation Stack", () => {
    it("manages full nested traversal: Main -> Loans -> Eligibility -> Documents and unwinds via BACK then HOME", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu. 1 for loans." } },
          { id: "loans_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Loans menu. 1 for eligibility." } },
          { id: "eligibility_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Eligibility menu. 1 for documents." } },
          { id: "documents_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Documents menu." } },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "loans_menu", data: { trigger: "DTMF", value: "1" } },
          { source: "loans_menu", target: "eligibility_menu", data: { trigger: "DTMF", value: "1" } },
          { source: "eligibility_menu", target: "documents_menu", data: { trigger: "DTMF", value: "1" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));

      // 1. Step: main_menu -> loans_menu
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "main_menu",
        navigationHistory: [],
      });
      const step1 = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "loans_menu", transition: "DTMF", action: "NAVIGATE", optionLabel: "Loans" },
        { mode: "DTMF", value: "1" }
      );
      expect(step1.currentNodeId).toBe("loans_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "loans_menu",
          navigationHistory: ["main_menu"],
        })
      );

      // 2. Step: loans_menu -> eligibility_menu
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "loans_menu",
        navigationHistory: ["main_menu"],
      });
      const step2 = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "eligibility_menu", transition: "DTMF", action: "NAVIGATE", optionLabel: "Eligibility" },
        { mode: "DTMF", value: "1" }
      );
      expect(step2.currentNodeId).toBe("eligibility_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "eligibility_menu",
          navigationHistory: ["main_menu", "loans_menu"],
        })
      );

      // 3. Step: eligibility_menu -> documents_menu
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "eligibility_menu",
        navigationHistory: ["main_menu", "loans_menu"],
      });
      const step3 = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "documents_menu", transition: "DTMF", action: "NAVIGATE", optionLabel: "Documents" },
        { mode: "DTMF", value: "1" }
      );
      expect(step3.currentNodeId).toBe("documents_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "documents_menu",
          navigationHistory: ["main_menu", "loans_menu", "eligibility_menu"],
        })
      );

      // 4. BACK from documents_menu -> eligibility_menu (stack pop)
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "documents_menu",
        navigationHistory: ["main_menu", "loans_menu", "eligibility_menu"],
      });
      const stepBack1 = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "eligibility_menu", transition: "GO_BACK", action: "GO_BACK", optionLabel: "Back" },
        { mode: "DTMF", value: "*" }
      );
      expect(stepBack1.currentNodeId).toBe("eligibility_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "eligibility_menu",
          navigationHistory: ["main_menu", "loans_menu"],
        })
      );

      // 5. BACK from eligibility_menu -> loans_menu (stack pop)
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "eligibility_menu",
        navigationHistory: ["main_menu", "loans_menu"],
      });
      const stepBack2 = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "loans_menu", transition: "GO_BACK", action: "GO_BACK", optionLabel: "Back" },
        { mode: "DTMF", value: "*" }
      );
      expect(stepBack2.currentNodeId).toBe("loans_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "loans_menu",
          navigationHistory: ["main_menu"],
        })
      );

      // 6. HOME from loans_menu -> main_menu (clears history to [])
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "loans_menu",
        navigationHistory: ["main_menu"],
      });
      const stepHome = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "main_menu", transition: "HOME", action: "MAIN_MENU", optionLabel: "Home" },
        { mode: "DTMF", value: "0" }
      );
      expect(stepHome.currentNodeId).toBe("main_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "main_menu",
          navigationHistory: [],
        })
      );
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("skips stale/non-existent node IDs in history safely during BACK", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu." } },
          { id: "active_sub_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Active sub menu." } },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "active_sub_menu", data: { trigger: "DEFAULT" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      // History has deleted/stale node IDs: "deleted_node_1", "deleted_node_2"
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "active_sub_menu",
        navigationHistory: ["main_menu", "deleted_node_1", "deleted_node_2"],
      });

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: null, transition: "GO_BACK", action: "GO_BACK", optionLabel: "Back" },
        { mode: "VOICE", value: "go back" }
      );

      // Successfully skipped deleted nodes and returned to main_menu
      expect(result.currentNodeId).toBe("main_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "main_menu",
          navigationHistory: [],
        })
      );
    });

    it("BACK with empty history resolves HOME safely without error", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu." } },
        ],
        [{ source: "start", target: "main_menu", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "main_menu",
        navigationHistory: [],
      });

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: null, transition: "GO_BACK", action: "GO_BACK", optionLabel: "Back" },
        { mode: "DTMF", value: "*" }
      );

      expect(result.currentNodeId).toBe("main_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "main_menu",
          navigationHistory: [],
        })
      );
    });

    it("REPEAT preserves exact history and current node without changes", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu." } },
          { id: "support_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Support menu." } },
        ],
        [{ source: "start", target: "main_menu", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "support_menu",
        navigationHistory: ["main_menu"],
      });

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "support_menu", transition: "REPEAT", action: "REPEAT", optionLabel: "Repeat" },
        { mode: "VOICE", value: "repeat" }
      );

      expect(result.currentNodeId).toBe("support_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "support_menu",
          navigationHistory: ["main_menu"],
        })
      );
    });

    it("RETURN_PREVIOUS post-action unwinds stack identically to BACK", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu." } },
          { id: "loans_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Loans menu." } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              question: "Loan requirements",
              knowledgeDocumentIds: ["doc-1"],
              postAction: { mode: "RETURN_PREVIOUS" },
            },
          },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "loans_menu", data: { trigger: "DTMF", value: "1" } },
          { source: "loans_menu", target: "knowledge_node", data: { trigger: "DTMF", value: "2" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "loans_menu",
        navigationHistory: ["main_menu"],
      });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Requires government ID and proof of income.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0 },
      ]);

      // Caller on loans_menu selects knowledge_node (pushes loans_menu into history -> [main_menu, loans_menu])
      // knowledge_node completes with RETURN_PREVIOUS post-action (pops loans_menu -> returns to loans_menu, leaves [main_menu])
      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_node", transition: "DTMF", action: "NAVIGATE", optionLabel: "Requirements" },
        { mode: "DTMF", value: "2" }
      );

      expect(result.currentNodeId).toBe("loans_menu");
      expect(result.speechText).toContain("Requires government ID and proof of income.");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "loans_menu",
          navigationHistory: ["main_menu"],
        })
      );
    });

    it("internal AUTH_GATE and CONDITION evaluation hops do not enter navigationHistory", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START", mainMenuNodeId: "main_menu" } },
          { id: "main_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Main menu. 1 for VIP." } },
          { id: "auth_gate", data: { nodeKind: "AUTH_GATE", requiredAuthLevel: "AUTH_LEVEL_1" } },
          { id: "vip_menu", data: { nodeKind: "HYBRID_MENU", prompt: "Welcome VIP caller." } },
        ],
        [
          { source: "start", target: "main_menu", data: { trigger: "DEFAULT" } },
          { source: "main_menu", target: "auth_gate", data: { trigger: "DTMF", value: "1" } },
          { source: "auth_gate", target: "vip_menu", data: { trigger: "PASS" } },
        ]
      );

      mocks.getCall.mockResolvedValue(
        buildCall(version, {
          authenticationLevel: "AUTH_LEVEL_1",
        })
      );
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "main_menu",
        navigationHistory: [],
      });

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "auth_gate", transition: "DTMF", action: "NAVIGATE", optionLabel: "VIP" },
        { mode: "DTMF", value: "1" }
      );

      // Traversed main_menu -> auth_gate -> vip_menu
      // History should only contain main_menu, NOT auth_gate
      expect(result.currentNodeId).toBe("vip_menu");
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "vip_menu",
          navigationHistory: ["main_menu"],
        })
      );
    });
  });

  describe("Phase 4: Builder-Controlled AI Policy Execution", () => {
    it("NEVER policy on KNOWLEDGE node strictly suppresses Gemini text generation and AI rerank", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_never",
            data: {
              nodeKind: "KNOWLEDGE",
              question: "What are your branches?",
              aiPolicy: { mode: "NEVER" },
            },
          },
        ],
        [{ source: "start", target: "knowledge_never", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Main branch is located at 100 Financial Ave.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 0.9 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_never", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "Branches" },
        { mode: "VOICE", value: "where are your branches?" }
      );

      expect(result.speechText).toContain("Main branch is located at 100 Financial Ave.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
      expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
        expect.any(String),
        3,
        expect.objectContaining({ skipRerank: true })
      );
    });

    it("NEVER policy on AI node blocks entering conversational AI runtime and returns fallback prompt", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "ai_node_never",
            data: {
              nodeKind: "AI",
              prompt: "AI Assistant greeting",
              fallbackPrompt: "Please use the phone keypad for options.",
              aiPolicy: { mode: "NEVER" },
            },
          },
        ],
        [{ source: "start", target: "ai_node_never", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "ai_node_never", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "AI" },
        { mode: "DTMF", value: "1" }
      );

      expect(result.transitionReason).toBe("AI_POLICY_BLOCKED");
      expect(result.speechText).toBe("Please use the phone keypad for options.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("FREE_FORM_ONLY uses local answer for menu prompt and permits AI for caller transcript", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_ff",
            data: {
              nodeKind: "KNOWLEDGE",
              prompt: "Fixed menu topic for home loans",
              aiPolicy: { mode: "FREE_FORM_ONLY" },
            },
          },
        ],
        [{ source: "start", target: "knowledge_ff", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Home loans start at 6.5% interest.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 0.95 },
      ]);

      // 1. Menu navigation (PROMPT source) -> Zero AI
      const menuResult = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_ff", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "Home Loans" },
        { mode: "DTMF", value: "1" }
      );

      expect(menuResult.speechText).toContain("Home loans start at 6.5% interest.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
      expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
        expect.any(String),
        3,
        expect.objectContaining({ skipRerank: true })
      );
    });

    it("LOW_CONFIDENCE_ONLY uses local answer for high confidence score and permits AI for low score", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_lc",
            data: {
              nodeKind: "KNOWLEDGE",
              querySource: "TRANSCRIPT",
              aiPolicy: { mode: "LOW_CONFIDENCE_ONLY", confidenceThreshold: 0.8 },
            },
          },
        ],
        [{ source: "start", target: "knowledge_lc", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.getConversation.mockResolvedValue({
        messages: [{ role: "USER", content: "What is your savings interest rate?" }],
      });

      // Case A: High normalized score (18.0 / 20 = 0.90 >= 0.8) -> local answer, zero AI
      mocks.retrieveKnowledge.mockResolvedValueOnce([
        { content: "Savings account interest is 4.0% per annum.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 18.0 },
      ]);

      const highConfResult = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_lc", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "Savings" },
        { mode: "VOICE", value: "What is your savings interest rate?" }
      );

      expect(highConfResult.speechText).toContain("Savings account interest is 4.0% per annum.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();

      // Case B: Low normalized score (2.0 / 20 = 0.10 < 0.8) -> permits AI generation
      mocks.retrieveKnowledge.mockResolvedValueOnce([
        { content: "General account terms and conditions.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 2.0 },
      ]);
      mocks.generateAIResponse.mockResolvedValueOnce("Our standard savings interest is 4%, subject to balance tiers.");

      const lowConfResult = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_lc", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "Savings" },
        { mode: "VOICE", value: "What is your savings interest rate?" }
      );

      expect(mocks.generateAIResponse).toHaveBeenCalled();
      expect(lowConfResult.speechText).toContain("Our standard savings interest is 4%, subject to balance tiers.");
    });

    it("LOCAL_KB failure behavior cleanly falls back to verified scoped chunk if AI fails or times out", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_fail",
            data: {
              nodeKind: "KNOWLEDGE",
              querySource: "TRANSCRIPT",
              aiPolicy: { mode: "ALWAYS_CONVERSATIONAL", failureBehavior: "LOCAL_KB" },
            },
          },
        ],
        [{ source: "start", target: "knowledge_fail", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.getConversation.mockResolvedValue({
        messages: [{ role: "USER", content: "Tell me about interest rates." }],
      });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Interest rate is 5.5% for 1 year fixed deposit.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 0.88 },
      ]);
      mocks.generateAIResponse.mockRejectedValue(new Error("AI generation timeout"));

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_fail", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "Rates" },
        { mode: "VOICE", value: "Tell me about interest rates." }
      );

      // Successfully fell back to verified local chunk content without breaking the call
      expect(result.speechText).toContain("Interest rate is 5.5% for 1 year fixed deposit.");
    });

    it("computeNormalizedRetrievalConfidence computes mathematically bounded [0, 1] confidence", () => {
      // 2 terms query -> S_max = 2*2.5 + 5 = 10
      // Perfect raw score = 7.0 -> normalized = 0.70
      const normHigh = computeNormalizedRetrievalConfidence("Sunday hours", 7.0);
      expect(normHigh).toBe(0.7);

      // Low raw score = 1.0 -> normalized = 0.10
      const normLow = computeNormalizedRetrievalConfidence("Sunday hours", 1.0);
      expect(normLow).toBe(0.1);

      // Bounded safely
      expect(computeNormalizedRetrievalConfidence("", 5.0)).toBe(0);
      expect(computeNormalizedRetrievalConfidence("query", 0)).toBe(0);
      expect(computeNormalizedRetrievalConfidence("query", 100)).toBe(1);
    });

    it("LOW_CONFIDENCE_ONLY uses local KB when normalized confidence satisfies threshold (0 AI calls)", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              querySource: "TRANSCRIPT",
              aiPolicy: { mode: "LOW_CONFIDENCE_ONLY", confidenceThreshold: 0.6 },
            },
          },
        ],
        [{ source: "start", target: "knowledge_node", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.getConversation.mockResolvedValue({
        messages: [{ role: "USER", content: "Sunday hours" }],
      });
      // 2 terms -> max score 10. Raw score 7.0 -> normalized 0.70 >= threshold 0.60
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Open 10am to 4pm on Sundays.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 7.0 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_node", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "Hours" },
        { mode: "VOICE", value: "Sunday hours" }
      );

      // Local answer used directly without invoking AI generation
      expect(result.speechText).toContain("Open 10am to 4pm on Sundays.");
      expect(mocks.generateAIResponse).not.toHaveBeenCalled();
    });

    it("LOW_CONFIDENCE_ONLY invokes AI when normalized confidence is below threshold", async () => {
      const version = buildVersion(
        [
          { id: "start", data: { nodeKind: "START" } },
          {
            id: "knowledge_node",
            data: {
              nodeKind: "KNOWLEDGE",
              querySource: "TRANSCRIPT",
              aiPolicy: { mode: "LOW_CONFIDENCE_ONLY", confidenceThreshold: 0.6 },
            },
          },
        ],
        [{ source: "start", target: "knowledge_node", data: { trigger: "DEFAULT" } }]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({ flowId: version.id, currentNodeId: "start" });
      mocks.getConversation.mockResolvedValue({
        messages: [{ role: "USER", content: "Sunday hours" }],
      });
      // 2 terms -> max score 10. Raw score 1.0 -> normalized 0.10 < threshold 0.60
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Some vague information.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 1.0 },
      ]);
      mocks.generateAIResponse.mockResolvedValue(
        "We are open on Sundays from 10 AM to 4 PM."
      );

      const result = await executeIVRGraphRoute(
        "call-1",
        { matched: true, confidence: 1, resultingNodeId: "knowledge_node", transition: "DEFAULT", action: "NAVIGATE", optionLabel: "Hours" },
        { mode: "VOICE", value: "Sunday hours" }
      );

      // AI generation invoked due to low normalized confidence
      expect(mocks.generateAIResponse).toHaveBeenCalled();
      expect(result.speechText).toBe("We are open on Sundays from 10 AM to 4 PM.");
    });
  });

  describe("Phase 5: Conversational Escape Execution & Return-to-Context", () => {
    it("executes side-turn to target knowledge node and returns caller to menu context (RETURN_CONTEXT) without history pollution", async () => {
      const version = buildVersion(
        [
          { ...baseNodes.start, data: { nodeKind: "START" } },
          {
            ...baseNodes.menu,
            id: "menu_node",
            data: {
              nodeKind: "HYBRID_MENU",
              prompt: "Press 1 for Sales, 2 for Support.",
              conversationalEscape: {
                enabled: true,
                targetNodeId: "faq_assistant",
                returnBehavior: "RETURN_CONTEXT",
              },
            },
          },
          {
            id: "faq_assistant",
            data: {
              nodeKind: "KNOWLEDGE",
              knowledgeDocumentIds: ["doc-1"],
              aiPolicy: { mode: "NEVER" },
            },
          },
        ],
        [
          { source: "start", target: "menu_node", data: { trigger: "DEFAULT" } },
          { source: "menu_node", target: "faq_assistant", data: { trigger: "DEFAULT" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "menu_node",
        previousNodeId: "start",
        navigationHistory: ["start"],
      });
      mocks.getConversation.mockResolvedValue({
        messages: [{ role: "USER", content: "What are your business hours on Sunday?" }],
      });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "We are open 10am to 4pm on Sundays.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 0.95 },
      ]);

      const result = await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 0.85,
          resultingNodeId: "faq_assistant",
          transition: "CONVERSATIONAL_ESCAPE",
          action: "NAVIGATE",
          optionLabel: "Conversational Escape",
        },
        { mode: "VOICE", value: "What are your business hours on Sunday?" }
      );

      // Successfully answered question
      expect(result.speechText).toContain("We are open 10am to 4pm on Sundays.");
      // Returned caller to menu context
      expect(result.currentNodeId).toBe("menu_node");
      expect(result.status).toBe("AWAITING_INPUT");

      // Verify session state was restored to menu_node and history was NOT polluted
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "menu_node",
          previousNodeId: "faq_assistant",
          navigationHistory: ["start"],
        })
      );
    });

    it("transitions to target assistant and preserves prior menu in history when STAY_CONVERSATIONAL is selected", async () => {
      const version = buildVersion(
        [
          { ...baseNodes.start, data: { nodeKind: "START" } },
          {
            ...baseNodes.menu,
            id: "menu_node",
            data: {
              nodeKind: "HYBRID_MENU",
              conversationalEscape: {
                enabled: true,
                targetNodeId: "faq_assistant",
                returnBehavior: "STAY_CONVERSATIONAL",
              },
            },
          },
          {
            id: "faq_assistant",
            data: {
              nodeKind: "KNOWLEDGE",
              knowledgeDocumentIds: ["doc-1"],
              aiPolicy: { mode: "NEVER" },
            },
          },
        ],
        [
          { source: "start", target: "menu_node", data: { trigger: "DEFAULT" } },
          { source: "menu_node", target: "faq_assistant", data: { trigger: "DEFAULT" } },
        ]
      );

      mocks.getCall.mockResolvedValue(buildCall(version));
      mocks.getSession.mockResolvedValue({
        flowId: version.id,
        currentNodeId: "menu_node",
        previousNodeId: "start",
        navigationHistory: ["start"],
      });
      mocks.getConversation.mockResolvedValue({
        messages: [{ role: "USER", content: "Tell me about interest rates." }],
      });
      mocks.retrieveKnowledge.mockResolvedValue([
        { content: "Interest rate is 5%.", documentId: "doc-1", classification: "PUBLIC_PRODUCT_INFO", chunkIndex: 0, score: 0.95 },
      ]);

      await executeIVRGraphRoute(
        "call-1",
        {
          matched: true,
          confidence: 0.85,
          resultingNodeId: "faq_assistant",
          transition: "CONVERSATIONAL_ESCAPE",
          action: "NAVIGATE",
          optionLabel: "Conversational Escape",
        },
        { mode: "VOICE", value: "Tell me about interest rates." }
      );

      // Verify menu_node was pushed into navigationHistory for subsequent BACK commands
      expect(mocks.setSession).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({
          currentNodeId: "faq_assistant",
          navigationHistory: ["start", "menu_node"],
        })
      );
    });
  });
});
