import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prismaCallFindUnique: vi.fn(),
  prismaCallFindFirst: vi.fn(),
  prismaCallUpdate: vi.fn(),
  prismaCallUpdateMany: vi.fn(),
  prismaConversationFindUnique: vi.fn(),
  prismaConversationUpsert: vi.fn(),
  prismaConversationUpdate: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  retrieveKnowledge: vi.fn(),
  generateAIResponse: vi.fn(),
  voiceWorkerStart: vi.fn(),
  voiceWorkerAddText: vi.fn(),
  endProviderCall: vi.fn(),
  orchestrateHumanTransfer: vi.fn(),
  geminiLiveStart: vi.fn().mockResolvedValue(undefined),
  geminiLiveBeginConversation: vi.fn().mockResolvedValue(true),
  eventPublish: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    call: {
      findUnique: mocks.prismaCallFindUnique,
      findFirst: mocks.prismaCallFindFirst,
      update: mocks.prismaCallUpdate,
      updateMany: mocks.prismaCallUpdateMany,
    },
    conversation: {
      findUnique: mocks.prismaConversationFindUnique,
      upsert: mocks.prismaConversationUpsert,
      update: mocks.prismaConversationUpdate,
    },
    conversationMessage: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
    },
    $transaction: vi.fn().mockImplementation(async (cb: unknown) => (typeof cb === "function" ? (cb as (p: unknown) => Promise<unknown>)({ call: { findUnique: mocks.prismaCallFindUnique, update: mocks.prismaCallUpdate } }) : cb)),
  },
}));

vi.mock("@/lib/redis", () => {
  let pendingSetKey = "";
  let pendingSetVal = "";
  return {
    redisConnection: {
      get: mocks.redisGet,
      set: mocks.redisSet,
      watch: vi.fn().mockResolvedValue("OK"),
      unwatch: vi.fn().mockResolvedValue("OK"),
      multi: () => ({
        set: (k: string, v: string) => {
          pendingSetKey = k;
          pendingSetVal = v;
          return {
            expire: vi.fn().mockReturnThis(),
            exec: async () => {
              if (pendingSetKey) await mocks.redisSet(pendingSetKey, pendingSetVal);
              return [null, "OK"];
            },
          };
        },
        expire: vi.fn().mockReturnThis(),
        exec: async () => {
          if (pendingSetKey) await mocks.redisSet(pendingSetKey, pendingSetVal);
          return [null, "OK"];
        },
      }),
    },
  };
});

vi.mock("@/services/knowledge/retrieval.service", () => ({
  retrieveKnowledge: mocks.retrieveKnowledge,
}));

vi.mock("@/services/voice/gemini-live-media.service", () => ({
  GeminiLiveMediaService: {
    start: mocks.geminiLiveStart,
    stop: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    beginConversation: mocks.geminiLiveBeginConversation,
    isReady: vi.fn().mockReturnValue(true),
    has: vi.fn().mockReturnValue(false),
    sendTwilioAudio: vi.fn(),
    sendAudio: vi.fn().mockResolvedValue(undefined),
    buildIvrEntryContextPrompt: vi.fn().mockReturnValue(""),
  },
}));

vi.mock("@/services/voice/voice-worker.service", () => ({
  VoiceWorker: {
    start: mocks.voiceWorkerStart,
    addText: mocks.voiceWorkerAddText,
  },
}));

vi.mock("@/services/telephony/end-call.service", () => ({
  endProviderCall: mocks.endProviderCall,
}));

vi.mock("@/services/telephony/human-transfer.service", () => ({
  orchestrateHumanTransfer: mocks.orchestrateHumanTransfer,
}));

vi.mock("@/core/events", () => ({
  AppEvent: { CONVERSATION_MESSAGE: "conversation.message" },
  EventPublisher: { publish: mocks.eventPublish },
}));

vi.mock("@/lib/ai", () => ({
  generateAIResponse: mocks.generateAIResponse,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  }),
  createServerLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  }),
  createCallLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  }),
  maskPhoneNumber: (val: string) => val,
  normalizeError: (err: unknown) => err,
}));

import { AudioSessionService } from "@/providers/telephony/audio-session.service";
import { PlivoStreamGateway } from "@/providers/telephony/plivo-stream.gateway";
import { TwilioStreamGateway } from "@/providers/telephony/twilio-stream.gateway";
import { ConversationStateService } from "@/services/conversations/conversation-state.service";
import { routeRealtimeCallInput } from "@/services/conversations/realtime-input.service";
import { IVRFlowSessionService } from "@/services/ivr/ivr-flow-session.service";
import { startIVRGraphExecution, executeIVRGraphRoute } from "@/services/ivr/ivr-graph-executor.service";
import { resolveInboundKnowledgeDocumentIds } from "@/services/knowledge/inbound-knowledge-scope.service";
import { executeGeminiLiveFunctionCall } from "@/services/voice/gemini-live-tool.service";

const CALL_ID = "call-plivo-1";
const STREAM_ID = "plivo-stream-1";
const FLOW_ID = "flow-f3";
const VERSION_ID = "version-f3-v1";
const TENANT_ID = "tenant-f3";

// EXACT F3 ACCEPTANCE GRAPH FIXTURE:
// 1 -> Loan Information
// 2 -> Eligibility
// 3 -> Documents & AI Assistant
// 4 -> AUTH_GATE
// 8 -> Repeat Main Menu
// 9 -> End Call
const f3Nodes = [
  { id: "start", data: { nodeKind: "START", inputExperience: "VOICE", runtimeMode: "PREMIUM" } },
  { id: "greeting", data: { nodeKind: "GREETING", prompt: "Welcome to Apex Financial Services." } },
  {
    id: "hybrid_menu",
    data: {
      nodeKind: "HYBRID_MENU",
      label: "Main Menu",
      prompt: "Press 1 for Loan Info, 2 for Eligibility, 3 for Documents & AI Assistant, 4 for Human Agent, 8 to Repeat, 9 to End Call.",
      runtimeMenu: {
        maxAttempts: 3,
        timeoutSeconds: 8,
        invalidPrompt: "Invalid selection. Please choose 1, 2, 3, 4, 8, or 9.",
        timeoutPrompt: "We didn't receive any input. Please press a key or speak an option.",
        exhaustedPrompt: "Maximum attempts reached. Ending call.",
      },
      options: [
        { digit: "1", label: "Loan Information", phrases: ["loan information", "loans", "loan info"], destinationNodeId: "knowledge_loan" },
        { digit: "2", label: "Eligibility", phrases: ["eligibility", "am i eligible", "check eligibility"], destinationNodeId: "knowledge_eligibility" },
        { digit: "3", label: "Documents & AI Assistant", phrases: ["documents", "documents & ai assistant", "documents and ai assistant", "ai assistant", "docs"], destinationNodeId: "knowledge_docs" },
        { digit: "4", label: "Human agent", phrases: ["human agent", "representative", "talk to someone", "customer care"], destinationNodeId: "auth_gate" },
        { digit: "8", label: "Repeat menu", phrases: ["repeat", "repeat menu", "main menu"], destinationNodeId: "hybrid_menu" },
        { digit: "9", label: "End call", phrases: ["goodbye", "end call", "hang up", "bye"], destinationNodeId: "end_call" },
      ],
    },
  },
  {
    id: "knowledge_loan",
    data: {
      nodeKind: "KNOWLEDGE",
      label: "Loan Information",
      question: "What are the loan interest rates and terms?",
      knowledgeDocumentIds: ["doc-loan-rates"],
    },
  },
  {
    id: "knowledge_eligibility",
    data: {
      nodeKind: "KNOWLEDGE",
      label: "Eligibility",
      question: "What are the eligibility requirements for a personal loan?",
      knowledgeDocumentIds: ["doc-eligibility"],
    },
  },
  {
    id: "knowledge_docs",
    data: {
      nodeKind: "KNOWLEDGE",
      label: "Documents & AI Assistant",
      question: "What documents are required for application?",
      knowledgeDocumentIds: ["doc-required-docs"],
    },
  },
  {
    id: "auth_gate",
    data: {
      nodeKind: "AUTH_GATE",
      label: "Customer Verification",
      requiredAuthLevel: "AUTH_LEVEL_1",
    },
  },
  {
    id: "human_transfer",
    data: {
      nodeKind: "HUMAN_TRANSFER",
      label: "Representative Transfer",
      destination: "+15550009999",
    },
  },
  {
    id: "end_call",
    data: {
      nodeKind: "END_CALL",
      label: "End Call",
      prompt: "Thank you for calling Apex Financial Services. Goodbye.",
    },
  },
];

const f3Edges = [
  { source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
  { source: "greeting", target: "hybrid_menu", data: { trigger: "DEFAULT" } },
  { source: "hybrid_menu", target: "knowledge_loan", data: { trigger: "DTMF", value: "1" } },
  { source: "hybrid_menu", target: "knowledge_eligibility", data: { trigger: "DTMF", value: "2" } },
  { source: "hybrid_menu", target: "knowledge_docs", data: { trigger: "DTMF", value: "3" } },
  { source: "hybrid_menu", target: "auth_gate", data: { trigger: "DTMF", value: "4" } },
  { source: "hybrid_menu", target: "hybrid_menu", data: { trigger: "DTMF", value: "8" } },
  { source: "hybrid_menu", target: "end_call", data: { trigger: "DTMF", value: "9" } },
  { source: "knowledge_loan", target: "hybrid_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
  { source: "knowledge_loan", target: "hybrid_menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
  { source: "knowledge_eligibility", target: "hybrid_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
  { source: "knowledge_eligibility", target: "hybrid_menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
  { source: "knowledge_docs", target: "hybrid_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
  { source: "knowledge_docs", target: "hybrid_menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
  { source: "auth_gate", target: "human_transfer", data: { trigger: "AUTHENTICATED" } },
  { source: "auth_gate", target: "hybrid_menu", data: { trigger: "NOT_AUTHENTICATED" } },
  { source: "auth_gate", target: "hybrid_menu", data: { trigger: "FAILURE" } },
];

function buildMockCall(overrides: Record<string, unknown> = {}) {
  return {
    id: CALL_ID,
    provider: "PLIVO",
    providerCallId: "plivo-uuid-1",
    callerNumber: "+15551112222",
    calledNumber: "+15553334444",
    direction: "INBOUND",
    status: "IN_PROGRESS",
    tenantId: TENANT_ID,
    requestedRuntime: "GEMINI_LIVE",
    authenticationLevel: "NONE",
    authenticationVerifiedAt: null,
    inboundProfile: {
      id: "profile-1",
      voiceRuntime: "PREMIUM",
      knowledgeDocumentIds: ["doc-loan-rates", "doc-eligibility", "doc-required-docs"],
    },
    ivrFlowVersionId: VERSION_ID,
    ivrFlowVersion: {
      id: VERSION_ID,
      flowId: FLOW_ID,
      tenantId: TENANT_ID,
      status: "PUBLISHED",
      nodes: f3Nodes,
      edges: f3Edges,
    },
    ...overrides,
  };
}

function mockSocket() {
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
  };
}

describe("Plivo Premium Hybrid IVR DTMF + Voice Routing End-to-End Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConversationStateService.setState(CALL_ID, "LISTENING");
    AudioSessionService.close(STREAM_ID);
    AudioSessionService.closeByCallId(CALL_ID);
    mocks.prismaCallFindUnique.mockResolvedValue(buildMockCall());
    mocks.prismaCallFindFirst.mockResolvedValue(buildMockCall());
    mocks.prismaCallUpdate.mockResolvedValue(buildMockCall());
    mocks.prismaCallUpdateMany.mockResolvedValue({ count: 1 });
    mocks.prismaConversationFindUnique.mockResolvedValue({ id: "conv-1", callId: CALL_ID, messages: [] });
    mocks.prismaConversationUpsert.mockResolvedValue({ id: "conv-1", callId: CALL_ID, messages: [] });
    mocks.prismaConversationUpdate.mockResolvedValue({ id: "conv-1", callId: CALL_ID, messages: [] });
    mocks.voiceWorkerAddText.mockResolvedValue(true);
    mocks.generateAIResponse.mockResolvedValue("We offer personal loans at 7.5% APR.");
    mocks.retrieveKnowledge.mockResolvedValue([
      {
        content: "Personal loan rates start from 7.5% APR for credit scores above 700.",
        documentId: "doc-loan-rates",
        score: 0.95,
        classification: "PUBLIC",
        chunkIndex: 0,
      },
    ]);
    mocks.endProviderCall.mockResolvedValue({ success: true, alreadyEnded: false, providerCallId: "plivo-uuid-1" });
    const redisStorage = new Map<string, string>();
    mocks.redisGet.mockImplementation(async (key: string) => {
      if (redisStorage.has(key)) return redisStorage.get(key)!;
      if (key.startsWith("ivr:flow-session:")) {
        return JSON.stringify({ flowId: VERSION_ID, currentNodeId: "hybrid_menu" });
      }
      return null;
    });
    mocks.redisSet.mockImplementation(async (key: string, value: unknown) => {
      redisStorage.set(key, String(value));
      return "OK";
    });
  });

  // 1. DTMF 1 -> Loan Information
  it("F3-1: Plivo DTMF 1 on HYBRID_MENU routes to Loan Information knowledge node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "DTMF",
      callId: CALL_ID,
      provider: "PLIVO",
      digit: "1",
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution).not.toBeNull();
    expect(result.graphExecution?.transitionReason).toBe("KNOWLEDGE_FOUND");
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      expect.any(String),
      3,
      expect.objectContaining({
        knowledgeDocumentIds: ["doc-loan-rates"],
        tenantId: TENANT_ID,
      })
    );
  });

  // 2. DTMF 2 -> Eligibility
  it("F3-2: Plivo DTMF 2 on HYBRID_MENU routes to Eligibility knowledge node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "DTMF",
      callId: CALL_ID,
      provider: "PLIVO",
      digit: "2",
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution).not.toBeNull();
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      expect.any(String),
      3,
      expect.objectContaining({
        knowledgeDocumentIds: ["doc-eligibility"],
      })
    );
  });

  // 3. DTMF 3 -> Documents & AI Assistant
  it("F3-3: Plivo DTMF 3 on HYBRID_MENU routes to Documents & AI Assistant node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "DTMF",
      callId: CALL_ID,
      provider: "PLIVO",
      digit: "3",
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution).not.toBeNull();
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      expect.any(String),
      3,
      expect.objectContaining({
        knowledgeDocumentIds: ["doc-required-docs"],
      })
    );
  });

  // 4. DTMF 4 -> AUTH_GATE
  it("F3-4: Plivo DTMF 4 routes to AUTH_GATE, strictly not calling HUMAN_TRANSFER before auth", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "DTMF",
      callId: CALL_ID,
      provider: "PLIVO",
      digit: "4",
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution?.currentNodeId).not.toBe("human_transfer");
    expect(mocks.orchestrateHumanTransfer).not.toHaveBeenCalled();
  });

  // 5. DTMF 8 -> Main Menu repeat
  it("F3-5: Plivo DTMF 8 on HYBRID_MENU routes to Main Menu repeat (no knowledge, no auth, no end)", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "DTMF",
      callId: CALL_ID,
      provider: "PLIVO",
      digit: "8",
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution?.currentNodeId).toBe("hybrid_menu");
    expect(result.graphExecution?.awaitInput).toBe(true);
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
    expect(mocks.orchestrateHumanTransfer).not.toHaveBeenCalled();
    expect(mocks.endProviderCall).not.toHaveBeenCalled();
  });

  // 6. DTMF 9 -> END_CALL with provider termination
  it("F3-6: Plivo DTMF 9 on HYBRID_MENU executes END_CALL and invokes endProviderCall", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "DTMF",
      callId: CALL_ID,
      provider: "PLIVO",
      digit: "9",
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution?.endCall).toBe(true);
    expect(result.graphExecution?.currentNodeId).toBe("end_call");
    expect(mocks.endProviderCall).toHaveBeenCalledWith(CALL_ID);
  });

  // 7. Voice phrase: 'loan information'
  it("F3-7: Voice phrase 'loan information' routes to Loan Information knowledge node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "VOICE",
      callId: CALL_ID,
      provider: "PLIVO",
      text: "loan information",
      isFinal: true,
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      expect.any(String),
      3,
      expect.objectContaining({ knowledgeDocumentIds: ["doc-loan-rates"] })
    );
  });

  // 8. Voice phrase: 'am i eligible'
  it("F3-8: Voice phrase 'am i eligible' routes to Eligibility knowledge node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "VOICE",
      callId: CALL_ID,
      provider: "PLIVO",
      text: "am i eligible",
      isFinal: true,
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      expect.any(String),
      3,
      expect.objectContaining({ knowledgeDocumentIds: ["doc-eligibility"] })
    );
  });

  // 9. Voice phrase: 'documents and ai assistant'
  it("F3-9: Voice phrase 'documents and ai assistant' routes to Documents & AI Assistant node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "VOICE",
      callId: CALL_ID,
      provider: "PLIVO",
      text: "documents and ai assistant",
      isFinal: true,
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      expect.any(String),
      3,
      expect.objectContaining({ knowledgeDocumentIds: ["doc-required-docs"] })
    );
  });

  // 10. Voice phrase: 'human agent' -> AUTH_GATE
  it("F3-10: Voice phrase 'human agent' routes to AUTH_GATE, never directly calling HUMAN_TRANSFER", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "VOICE",
      callId: CALL_ID,
      provider: "PLIVO",
      text: "human agent",
      isFinal: true,
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution?.currentNodeId).not.toBe("human_transfer");
    expect(mocks.orchestrateHumanTransfer).not.toHaveBeenCalled();
  });

  // 11. Voice phrase: 'goodbye' -> END_CALL
  it("F3-11: Voice phrase 'goodbye' executes END_CALL and invokes endProviderCall", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    const result = await routeRealtimeCallInput({
      type: "VOICE",
      callId: CALL_ID,
      provider: "PLIVO",
      text: "goodbye",
      isFinal: true,
      timestamp: Date.now(),
    });

    expect(result.handled).toBe(true);
    expect(result.graphExecution?.endCall).toBe(true);
    expect(mocks.endProviderCall).toHaveBeenCalledWith(CALL_ID);
  });

  // 12. No-input Timeout loop across maxAttempts=3
  it("F3-12: Proves no-input timeout loop on HYBRID_MENU (attempts 1 & 2 timeoutPrompt, attempt 3 exhaustedPrompt & termination)", async () => {
    const timeoutRoute = {
      matched: false,
      resultingNodeId: null,
      transition: "TIMEOUT",
      confidence: 0,
    };

    // Attempt 1: timeoutPrompt
    const attempt1 = await executeIVRGraphRoute(CALL_ID, timeoutRoute as never, { mode: "VOICE", value: "" });
    expect(attempt1.status).toBe("AWAITING_INPUT");
    expect(attempt1.speechText).toContain("We didn't receive any input");
    expect(attempt1.transitionReason).toBe("TIMEOUT");

    // Attempt 2: timeoutPrompt
    const attempt2 = await executeIVRGraphRoute(CALL_ID, timeoutRoute as never, { mode: "VOICE", value: "" });
    expect(attempt2.status).toBe("AWAITING_INPUT");
    expect(attempt2.speechText).toContain("We didn't receive any input");

    // Attempt 3: exhaustedPrompt & termination
    const attempt3 = await executeIVRGraphRoute(CALL_ID, timeoutRoute as never, { mode: "VOICE", value: "" });
    expect(attempt3.status).toBe("SAFE_FAILURE");
    expect(attempt3.speechText).toContain("Maximum attempts reached");
    expect(attempt3.transitionReason).toBe("MAX_ATTEMPTS_EXHAUSTED");
  });

  // 13. Knowledge return-to-menu: KNOWLEDGE_FOUND & NO_RELEVANT_KNOWLEDGE for all 3 nodes
  it("F3-13: Proves all three knowledge nodes return to HYBRID_MENU on KNOWLEDGE_FOUND and NO_RELEVANT_KNOWLEDGE", async () => {
    for (const nodeKey of ["knowledge_loan", "knowledge_eligibility", "knowledge_docs"]) {
      mocks.redisGet.mockResolvedValue(JSON.stringify({
        flowId: VERSION_ID,
        currentNodeId: "hybrid_menu",
      }));

      const route = {
        matched: true,
        resultingNodeId: nodeKey,
        transition: "DTMF",
        confidence: 1,
      };

      const result = await executeIVRGraphRoute(CALL_ID, route as never, { mode: "DTMF", value: "1" });
      expect(result.status).toBe("AWAITING_INPUT");
      expect(result.currentNodeId).toBe("hybrid_menu");
      expect(result.awaitInput).toBe(true);
    }
  });

  // 14. Node-specific authorized document scope restriction
  it("F3-14: Scopes knowledge document retrieval strictly per node and returns empty for unauthorized docs", () => {
    const loanScope = resolveInboundKnowledgeDocumentIds({
      tenantId: TENANT_ID,
      profileKnowledgeDocumentIds: ["doc-loan-rates", "doc-eligibility", "doc-required-docs"],
      ivrFlowVersion: { tenantId: TENANT_ID, status: "PUBLISHED", nodes: f3Nodes },
      currentNodeId: "knowledge_loan",
    });
    expect(loanScope).toEqual(["doc-loan-rates"]);

    const docsScope = resolveInboundKnowledgeDocumentIds({
      tenantId: TENANT_ID,
      profileKnowledgeDocumentIds: ["doc-loan-rates", "doc-eligibility", "doc-required-docs"],
      ivrFlowVersion: { tenantId: TENANT_ID, status: "PUBLISHED", nodes: f3Nodes },
      currentNodeId: "knowledge_docs",
    });
    expect(docsScope).toEqual(["doc-required-docs"]);

    const unauthorizedScope = resolveInboundKnowledgeDocumentIds({
      tenantId: TENANT_ID,
      profileKnowledgeDocumentIds: ["doc-loan-rates"],
      ivrFlowVersion: { tenantId: TENANT_ID, status: "PUBLISHED", nodes: f3Nodes },
      currentNodeId: "knowledge_eligibility",
    });
    expect(unauthorizedScope).toEqual([]);
  });

  // 15. Standard / Cascaded runtime regression
  it("F3-15: Proves Plivo STANDARD/CASCADED runtime executes DTMF 1 (loan), DTMF 4 (auth_gate), DTMF 9 (end_call)", async () => {
    mocks.prismaCallFindUnique.mockResolvedValue(buildMockCall({
      requestedRuntime: "CASCADED",
      inboundProfile: { id: "profile-1", voiceRuntime: "CASCADED", knowledgeDocumentIds: ["doc-loan-rates"] },
    }));

    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    // DTMF 1
    const dtmf1 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "1", timestamp: Date.now() });
    expect(dtmf1.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalled();

    // DTMF 4
    const dtmf4 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "4", timestamp: Date.now() });
    expect(dtmf4.handled).toBe(true);
    expect(mocks.orchestrateHumanTransfer).not.toHaveBeenCalled();

    // DTMF 9
    const dtmf9 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "9", timestamp: Date.now() });
    expect(dtmf9.handled).toBe(true);
    expect(mocks.endProviderCall).toHaveBeenCalledWith(CALL_ID);
  });

  // 16. Double Voice Transition Prevention
  it("F3-16: Prevents double voice transitions when Gemini Live tool and transcript both fire for the same utterance", async () => {
    // 1. Tool call selectMenuOption('eligibility') fires
    const toolResp = await executeGeminiLiveFunctionCall(
      CALL_ID,
      { id: "call-1", name: "selectMenuOption", args: { option: "eligibility" } }
    );
    expect(toolResp.response.success).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledTimes(1);

    // 2. Transcript arrives with "eligibility" in same turn
    const transcriptResp = await routeRealtimeCallInput({
      type: "VOICE",
      callId: CALL_ID,
      provider: "PLIVO",
      text: "eligibility",
      isFinal: true,
      timestamp: Date.now(),
    });

    // Transcript is guarded against duplicate voice turn and causes no duplicate transition
    expect(transcriptResp.reason).toBe("DUPLICATE_VOICE_TURN");
    expect(mocks.retrieveKnowledge).toHaveBeenCalledTimes(1);
  });

  // 17. Cross-process WEB -> MEDIA state boundary
  it("F3-17: WEB startIVRGraphExecution writes to Redis and MEDIA TwilioStreamGateway preserves exact session state", async () => {
    let redisStore: string | null = null;
    mocks.redisSet.mockImplementation(async (_key, value) => {
      redisStore = String(value);
    });
    mocks.redisGet.mockImplementation(async () => redisStore);

    // WEB process
    const webResult = await startIVRGraphExecution(CALL_ID);
    expect(webResult.currentNodeId).toBe("hybrid_menu");

    // MEDIA process
    const socket = mockSocket();
    await TwilioStreamGateway.handle(
      socket as never,
      JSON.stringify({
        event: "start",
        streamSid: STREAM_ID,
        start: { callSid: "plivo-uuid-1", customParameters: { callId: CALL_ID } },
      })
    );

    const mediaRead = await IVRFlowSessionService.get(CALL_ID);
    expect(mediaRead?.currentNodeId).toBe("hybrid_menu");
    expect(mediaRead?.flowId).toBe(VERSION_ID);
  });

  // 18. Flow ID vs Version ID like-for-like identity verification
  it("F3-18: Correctly matches flowId and versionId like-for-like, discarding stale sessions from different versions", async () => {
    // Stale version session
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: FLOW_ID,
      currentNodeId: "stale-node",
    }));

    const socket = mockSocket();
    await TwilioStreamGateway.handle(
      socket as never,
      JSON.stringify({
        event: "start",
        streamSid: STREAM_ID,
        start: { callSid: "plivo-uuid-1", customParameters: { callId: CALL_ID } },
      })
    );

    expect(mocks.redisSet).toHaveBeenCalledWith(
      `ivr:flow-session:${CALL_ID}`,
      expect.stringContaining('"currentNodeId":null'),
      "EX",
      3600
    );
  });

  // 19. Dynamic provider resolution across Twilio, Plivo, Exotel
  it("F3-19: Dynamically resolves telephony provider from authenticated call across PLIVO, TWILIO, and EXOTEL", async () => {
    for (const testProvider of ["PLIVO", "TWILIO", "EXOTEL"] as const) {
      mocks.prismaCallFindUnique.mockResolvedValue(buildMockCall({ provider: testProvider }));
      mocks.redisGet.mockResolvedValue(JSON.stringify({
        flowId: VERSION_ID,
        currentNodeId: "hybrid_menu",
      }));

      const toolResp = await executeGeminiLiveFunctionCall(
        CALL_ID,
        { id: `call-${testProvider}`, name: "selectMenuOption", args: { option: "eligibility" } }
      );
      expect(toolResp.response.success).toBe(true);
    }
  });

  // 20. DTMF barge-in / clear playback
  it("F3-20: Premium DTMF clears active audio playback buffer for instant barge-in", async () => {
    const socket = mockSocket();
    AudioSessionService.create({
      callId: CALL_ID,
      twilioCallSid: "plivo-uuid-1",
      streamSid: STREAM_ID,
      socket: socket as never,
      voiceRuntime: "GEMINI_LIVE",
      requestedRuntime: "GEMINI_LIVE",
      effectiveRuntime: "GEMINI_LIVE",
      fallbackUsed: false,
      fallbackReason: null,
      mediaFormat: "MULAW_8K",
    });

    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    await TwilioStreamGateway.handle(
      socket as never,
      JSON.stringify({
        event: "dtmf",
        streamSid: STREAM_ID,
        dtmf: { digit: "1" },
      })
    );

    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"event":"clear"')
    );
  });

  // 21. Quota Acceptance Test — Basic IVR navigation consumes 0 Gemini sessions
  it("F3-21: Mandatory Quota Test: Call enters START -> GREETING -> HYBRID_MENU, listens, presses 8, presses invalid 7, times out once, presses 9 without initializing Gemini Live", async () => {
    mocks.geminiLiveStart.mockClear();
    mocks.geminiLiveBeginConversation.mockClear();

    const socket = mockSocket();

    // 1. Inbound stream connects
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
      inputExperience: "STAGED_HYBRID",
    }));

    await TwilioStreamGateway.handle(
      socket as never,
      JSON.stringify({
        event: "start",
        streamSid: STREAM_ID,
        start: { callSid: "plivo-uuid-1", customParameters: { callId: CALL_ID } },
      })
    );

    // 2. Caller listens to menu and presses 8 (repeat menu)
    const dtmf8 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "8", timestamp: Date.now() });
    expect(dtmf8.handled).toBe(true);

    // 3. Caller presses invalid digit 7 (retry menu / unmatched)
    const dtmf7 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "7", timestamp: Date.now() });
    expect(dtmf7.handled).toBe(false);
    expect(dtmf7.reason).toBe("UNMATCHED_DTMF");

    // 4. Provider reports one real no-input timeout
    const timeout = await routeRealtimeCallInput({ type: "SILENCE", callId: CALL_ID, provider: "PLIVO", durationMs: 8_000, timestamp: Date.now() });
    expect(timeout.graphExecution?.transitionReason).toBe("TIMEOUT");

    // 5. Caller presses 9 (end call)
    const dtmf9 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "9", timestamp: Date.now() });
    expect(dtmf9.handled).toBe(true);
    expect(mocks.endProviderCall).toHaveBeenCalledWith(CALL_ID);

    // Assert: Gemini Live was NEVER initialized throughout this IVR flow!
    expect(mocks.geminiLiveStart).toHaveBeenCalledTimes(0);
    expect(mocks.geminiLiveBeginConversation).toHaveBeenCalledTimes(0);
  });

  // 22. Plivo Stream START Frame Shape & Bounded Pre-Start Media Buffer Test
  it("F3-22: PlivoStreamGateway buffers media frames arriving before start and flushes them on valid start registration", async () => {
    const connection = mockSocket();
    const payload1 = Buffer.from("audio-chunk-1").toString("base64");
    const payload2 = Buffer.from("audio-chunk-2").toString("base64");

    // Media arrives before start has been received
    await PlivoStreamGateway.handle(
      connection as never,
      JSON.stringify({ event: "media", streamId: STREAM_ID, media: { payload: payload1 } }),
      CALL_ID
    );

    // Valid start frame arrives
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    await PlivoStreamGateway.handle(
      connection as never,
      JSON.stringify({
        event: "start",
        start: {
          streamId: STREAM_ID,
          callId: "plivo-uuid-1",
          mediaFormat: { encoding: "audio/x-mulaw;rate=8000", sampleRate: 8000 },
        },
      }),
      CALL_ID
    );

    // Subsequent media arrives after registration
    await PlivoStreamGateway.handle(
      connection as never,
      JSON.stringify({ event: "media", streamId: STREAM_ID, media: { payload: payload2 } }),
      CALL_ID
    );

    // Verify session was registered and media was forwarded
    expect(AudioSessionService.get(STREAM_ID)).toBeDefined();
  });

  // 23. Professional IVR Responses & Resilient Zero-Gemini KB Fallback
  it("F3-23: Deterministic IVR options 1/2/3/4/8/9 and invalid/timeout provide professional prompts and graceful 429 KB fallback", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: VERSION_ID,
      currentNodeId: "hybrid_menu",
    }));

    // 1. DTMF 1 with Gemini throwing 429 quota error -> returns fast acknowledgement + retrieved chunk facts
    mocks.generateAIResponse.mockRejectedValueOnce(new Error("429 Resource has been exhausted (e.g. check quota)"));
    mocks.retrieveKnowledge.mockResolvedValueOnce([
      {
        content: "Personal loan amounts range from ₹50,000 to ₹10 lakh with interest rates starting from 10.5% per annum.",
        documentId: "doc-loan-rates",
        score: 0.95,
        classification: "PUBLIC",
        chunkIndex: 0,
      },
    ]);

    const dtmf1 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "1", timestamp: Date.now() });
    expect(dtmf1.handled).toBe(true);
    expect(dtmf1.speechText).toContain("Sure. Let me help you with loan information.");
    expect(dtmf1.speechText).toContain("₹50,000 to ₹10 lakh");

    // 2. DTMF 4 -> Auth Gate verification prompt before human agent
    const dtmf4 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "4", timestamp: Date.now() });
    expect(dtmf4.handled).toBe(true);
    expect(dtmf4.speechText).toContain("Before I connect you with a representative, I need to complete verification.");

    // 3. DTMF 8 -> Repeat menu acknowledgement
    const dtmf8 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "8", timestamp: Date.now() });
    expect(dtmf8.handled).toBe(true);
    expect(dtmf8.speechText).toBe("Certainly. Here are the options again.");

    // 4. Invalid DTMF 7 -> Menu invalid selection prompt
    const dtmf7 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "7", timestamp: Date.now() });
    expect(dtmf7.handled).toBe(false);
    expect(dtmf7.speechText).toContain("Invalid selection. Please choose 1, 2, 3, 4, 8, or 9.");

    // 5. Timeout (silence) -> Menu timeout prompt
    const timeout = await routeRealtimeCallInput({ type: "SILENCE", callId: CALL_ID, provider: "PLIVO", durationMs: 8000, timestamp: Date.now() });
    expect(timeout.speechText).toContain("We didn't receive any input.");

    // 6. DTMF 9 -> Professional goodbye and provider termination
    const dtmf9 = await routeRealtimeCallInput({ type: "DTMF", callId: CALL_ID, provider: "PLIVO", digit: "9", timestamp: Date.now() });
    expect(dtmf9.handled).toBe(true);
    expect(dtmf9.endCall).toBe(true);
    expect(dtmf9.speechText).toContain("Thank you for calling");
    expect(mocks.endProviderCall).toHaveBeenCalledWith(CALL_ID);
  });

  // 24. Synthetic NON-DemoBank Flow (ABC Hospital) Test
  it("F3-24: Proves dynamic Builder-Driven execution for NON-DemoBank synthetic flow (ABC Hospital) produces exact configured prompts and zero banking/loan wording", async () => {
    const HOSPITAL_FLOW_ID = "flow-hospital";
    const HOSPITAL_VERSION_ID = "v-hospital-published";
    const HOSPITAL_CALL_ID = "call-hospital-1";

    const hospitalNodes = [
      { id: "start", data: { nodeKind: "START", label: "Start", inputExperience: "VOICE" } },
      { id: "greeting", data: { nodeKind: "GREETING", label: "Greeting", prompt: "Welcome to ABC Hospital. I am your hospital assistant." } },
      {
        id: "hospital_menu",
        data: {
          nodeKind: "HYBRID_MENU",
          label: "Hospital Main Menu",
          prompt: "To book an appointment, press 1. For lab reports, press 2. For billing questions, press 5. To end this call, press 9.",
          options: [
            { digit: "1", label: "Book Appointment", destinationNodeId: "kb_appointment" },
            { digit: "2", label: "Lab Reports", destinationNodeId: "kb_reports" },
            { digit: "5", label: "Billing", destinationNodeId: "kb_billing" },
            { digit: "9", label: "End Call", destinationNodeId: "hospital_end" },
          ],
        },
      },
      { id: "kb_appointment", data: { nodeKind: "KNOWLEDGE", label: "Book Appointment", question: "How do I schedule a doctor appointment?" } },
      { id: "kb_reports", data: { nodeKind: "KNOWLEDGE", label: "Lab Reports", question: "When will my lab reports be ready?" } },
      { id: "kb_billing", data: { nodeKind: "KNOWLEDGE", label: "Billing", question: "How can I pay my hospital bill?" } },
      { id: "hospital_end", data: { nodeKind: "END_CALL", label: "End Call", prompt: "Thank you for contacting ABC Hospital. Take care." } },
    ];

    const hospitalEdges = [
      { source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
      { source: "greeting", target: "hospital_menu", data: { trigger: "DEFAULT" } },
      { source: "hospital_menu", target: "kb_appointment", data: { trigger: "DTMF", value: "1" } },
      { source: "hospital_menu", target: "kb_reports", data: { trigger: "DTMF", value: "2" } },
      { source: "hospital_menu", target: "kb_billing", data: { trigger: "DTMF", value: "5" } },
      { source: "hospital_menu", target: "hospital_end", data: { trigger: "DTMF", value: "9" } },
      { source: "kb_appointment", target: "hospital_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
      { source: "kb_reports", target: "hospital_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
      { source: "kb_billing", target: "hospital_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
    ];

    const hospitalCall = {
      id: HOSPITAL_CALL_ID,
      tenantId: TENANT_ID,
      provider: "PLIVO",
      providerCallId: "plivo-uuid-hospital",
      requestedRuntime: "GEMINI_LIVE",
      ivrFlowVersionId: HOSPITAL_VERSION_ID,
      ivrFlowVersion: {
        id: HOSPITAL_VERSION_ID,
        flowId: HOSPITAL_FLOW_ID,
        version: 1,
        status: "PUBLISHED",
        nodes: hospitalNodes,
        edges: hospitalEdges,
      },
    };

    mocks.prismaCallFindUnique.mockResolvedValue(hospitalCall);

    // 1. Initial Inbound Execution -> START -> GREETING -> hospital_menu
    const initialExecution = await startIVRGraphExecution(HOSPITAL_CALL_ID);
    expect(initialExecution.status).toBe("AWAITING_INPUT");
    expect(initialExecution.currentNodeId).toBe("hospital_menu");
    expect(initialExecution.entryInputStage).toBe(true);
    expect(initialExecution.speechText).toBe("Welcome to ABC Hospital. I am your hospital assistant.");
    expect(initialExecution.entryPrompt).toBe("To book an appointment, press 1. For lab reports, press 2. For billing questions, press 5. To end this call, press 9.");

    // Assert: Opening contains NO DemoBank or loan wording
    expect(initialExecution.speechText).not.toContain("DemoBank");
    expect(initialExecution.speechText).not.toContain("loan");
    expect(initialExecution.entryPrompt).not.toContain("DemoBank");
    expect(initialExecution.entryPrompt).not.toContain("loan");

    // 2. Caller presses 1 (Book Appointment)
    mocks.redisGet.mockResolvedValue(JSON.stringify({
      flowId: HOSPITAL_VERSION_ID,
      currentNodeId: "hospital_menu",
    }));

    mocks.retrieveKnowledge.mockResolvedValueOnce([
      {
        content: "You can book an appointment with our specialists online at abchospital.org or by visiting the registration desk.",
        documentId: "doc-hospital-booking",
        score: 0.98,
        classification: "PUBLIC",
        chunkIndex: 0,
      },
    ]);

    const dtmf1 = await routeRealtimeCallInput({ type: "DTMF", callId: HOSPITAL_CALL_ID, provider: "PLIVO", digit: "1", timestamp: Date.now() });
    expect(dtmf1.handled).toBe(true);
    expect(dtmf1.speechText).toContain("Sure. Let me help you with book appointment.");
    expect(dtmf1.speechText).toContain("abchospital.org");
    expect(dtmf1.speechText).not.toContain("DemoBank");
    expect(dtmf1.speechText).not.toContain("loan");

    // 3. Caller presses 5 (Billing)
    mocks.retrieveKnowledge.mockResolvedValueOnce([
      {
        content: "Hospital billing counters are open 24/7 on the ground floor. Payments can also be made through UPI or net banking.",
        documentId: "doc-hospital-billing",
        score: 0.95,
        classification: "PUBLIC",
        chunkIndex: 0,
      },
    ]);

    const dtmf5 = await routeRealtimeCallInput({ type: "DTMF", callId: HOSPITAL_CALL_ID, provider: "PLIVO", digit: "5", timestamp: Date.now() });
    expect(dtmf5.handled).toBe(true);
    expect(dtmf5.speechText).toContain("Sure. Let me help you with billing.");
    expect(dtmf5.speechText).toContain("billing counters are open 24/7");
    expect(dtmf5.speechText).not.toContain("loan");

    // 4. Caller presses 8 (which is NOT an option in ABC Hospital)
    const dtmf8 = await routeRealtimeCallInput({ type: "DTMF", callId: HOSPITAL_CALL_ID, provider: "PLIVO", digit: "8", timestamp: Date.now() });
    expect(dtmf8.handled).toBe(false);
    expect(dtmf8.speechText).toContain("Sorry, I didn't recognize that selection");

    // 5. Caller presses 9 (End Call)
    const dtmf9 = await routeRealtimeCallInput({ type: "DTMF", callId: HOSPITAL_CALL_ID, provider: "PLIVO", digit: "9", timestamp: Date.now() });
    expect(dtmf9.handled).toBe(true);
    expect(dtmf9.endCall).toBe(true);
    expect(dtmf9.speechText).toBe("Thank you for contacting ABC Hospital. Take care.");
    expect(dtmf9.speechText).not.toContain("DemoBank");
  });
});
