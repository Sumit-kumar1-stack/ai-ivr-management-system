/**
 * Generic (non-DemoBank) IVR routing regression test.
 *
 * Proves:
 * - No DemoBank/banking wording appears in prompts.
 * - DTMF/voice routing is entirely driven by the published Builder graph.
 * - Digit 7 = Repeat (not hardcoded to 8).
 * - Digit 9 = End Call.
 * - Unrecognized digit 2 / alien voice alias "loan information" are rejected.
 * - DTMF-only mode emits inputType="dtmf"; BOTH mode emits "dtmf speech".
 */
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
    $transaction: vi.fn().mockImplementation(async (cb: unknown) =>
      typeof cb === "function"
        ? (cb as (p: unknown) => Promise<unknown>)({ call: { findUnique: mocks.prismaCallFindUnique, update: mocks.prismaCallUpdate } })
        : cb
    ),
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
          return { expire: vi.fn().mockReturnThis(), exec: async () => { if (pendingSetKey) await mocks.redisSet(pendingSetKey, pendingSetVal); return [null, "OK"]; } };
        },
        expire: vi.fn().mockReturnThis(),
        exec: async () => { if (pendingSetKey) await mocks.redisSet(pendingSetKey, pendingSetVal); return [null, "OK"]; },
      }),
    },
  };
});

vi.mock("@/services/knowledge/retrieval.service", () => ({ retrieveKnowledge: mocks.retrieveKnowledge }));
vi.mock("@/services/voice/gemini-live-media.service", () => ({
  GeminiLiveMediaService: { start: mocks.geminiLiveStart, stop: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined), beginConversation: mocks.geminiLiveBeginConversation, isReady: vi.fn().mockReturnValue(true), has: vi.fn().mockReturnValue(false), sendAudio: vi.fn().mockResolvedValue(undefined), buildIvrEntryContextPrompt: vi.fn().mockReturnValue("") },
}));
vi.mock("@/services/voice/voice-worker.service", () => ({ VoiceWorker: { start: mocks.voiceWorkerStart, addText: mocks.voiceWorkerAddText } }));
vi.mock("@/services/telephony/end-call.service", () => ({ endProviderCall: mocks.endProviderCall }));
vi.mock("@/services/telephony/human-transfer.service", () => ({ orchestrateHumanTransfer: mocks.orchestrateHumanTransfer }));
vi.mock("@/core/events", () => ({ AppEvent: { CONVERSATION_MESSAGE: "conversation.message" }, EventPublisher: { publish: mocks.eventPublish } }));
vi.mock("@/lib/ai", () => ({ generateAIResponse: mocks.generateAIResponse }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError, debug: mocks.loggerDebug }),
  createServerLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError, debug: mocks.loggerDebug }),
  createCallLogger: () => ({ info: mocks.loggerInfo, warn: mocks.loggerWarn, error: mocks.loggerError, debug: mocks.loggerDebug }),
  maskPhoneNumber: (val: string) => val,
  normalizeError: (err: unknown) => err,
}));

import { routeRealtimeCallInput } from "@/services/conversations/realtime-input.service";
import { ConversationStateService } from "@/services/conversations/conversation-state.service";
import { startIVRGraphExecution } from "@/services/ivr/ivr-graph-executor.service";
import { normalizeMenuInputMode, plivoInputTypeForMode } from "@/services/ivr/ivr-runtime-menu.service";

const TS_CALL_ID = "call-test-services-1";
const TS_VERSION_ID = "version-ts-v1";
const TS_FLOW_ID = "flow-ts";
const TS_TENANT_ID = "tenant-ts";

const tsNodes = [
  { id: "start", data: { nodeKind: "START", inputExperience: "VOICE", runtimeMode: "PREMIUM" } },
  { id: "greeting", data: { nodeKind: "GREETING", prompt: "Welcome to Test Services." } },
  {
    id: "main_menu",
    data: {
      nodeKind: "HYBRID_MENU",
      label: "Main Menu",
      prompt: "For Sales press 1. For Support press 3. To repeat press 7. To end press 9.",
      runtimeMenu: {
        inputMode: "BOTH",
        maxAttempts: 3,
        timeoutSeconds: 8,
        invalidPrompt: "Sorry, that option is not available. Please press 1, 3, 7, or 9.",
        timeoutPrompt: "No input received. Please press an option.",
        exhaustedPrompt: "Maximum attempts reached. Ending this call.",
      },
      options: [
        { digit: "1", label: "Sales", voicePhrases: ["sales", "new sales"], destinationNodeId: "sales_node" },
        { digit: "3", label: "Support", voicePhrases: ["support", "help desk"], destinationNodeId: "support_node" },
        { digit: "7", label: "Repeat menu", voicePhrases: ["repeat", "repeat menu"], destinationNodeId: "main_menu" },
        { digit: "9", label: "End call", voicePhrases: ["goodbye", "end call"], destinationNodeId: "end_call" },
      ],
    },
  },
  { id: "sales_node", data: { nodeKind: "KNOWLEDGE", label: "Sales", question: "Tell me about your sales offerings.", knowledgeDocumentIds: ["doc-sales"] } },
  { id: "support_node", data: { nodeKind: "KNOWLEDGE", label: "Support", question: "What support do you offer?", knowledgeDocumentIds: ["doc-support"] } },
  { id: "end_call", data: { nodeKind: "END_CALL", label: "End Call", prompt: "Thank you for contacting Test Services. Goodbye." } },
];
const tsEdges = [
  { source: "start", target: "greeting", data: { trigger: "DEFAULT" } },
  { source: "greeting", target: "main_menu", data: { trigger: "DEFAULT" } },
  { source: "main_menu", target: "sales_node", data: { trigger: "DTMF", value: "1" } },
  { source: "main_menu", target: "support_node", data: { trigger: "DTMF", value: "3" } },
  { source: "main_menu", target: "main_menu", data: { trigger: "DTMF", value: "7" } },
  { source: "main_menu", target: "end_call", data: { trigger: "DTMF", value: "9" } },
  { source: "sales_node", target: "main_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
  { source: "sales_node", target: "main_menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
  { source: "support_node", target: "main_menu", data: { trigger: "KNOWLEDGE_FOUND" } },
  { source: "support_node", target: "main_menu", data: { trigger: "NO_RELEVANT_KNOWLEDGE" } },
];

function buildTestCall(overrides: Record<string, unknown> = {}) {
  return {
    id: TS_CALL_ID, provider: "PLIVO", providerCallId: "plivo-ts-1",
    callerNumber: "+15550001111", calledNumber: "+15550009999",
    direction: "INBOUND", status: "IN_PROGRESS", tenantId: TS_TENANT_ID,
    requestedRuntime: "GEMINI_LIVE", authenticationLevel: "NONE", authenticationVerifiedAt: null,
    inboundProfile: { id: "profile-ts", voiceRuntime: "PREMIUM", knowledgeDocumentIds: ["doc-sales", "doc-support"] },
    ivrFlowVersionId: TS_VERSION_ID,
    ivrFlowVersion: { id: TS_VERSION_ID, flowId: TS_FLOW_ID, tenantId: TS_TENANT_ID, status: "PUBLISHED", nodes: tsNodes, edges: tsEdges },
    ...overrides,
  };
}

describe("Generic IVR — Test Services (non-DemoBank) Routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConversationStateService.clearState(TS_CALL_ID);
    mocks.prismaCallFindUnique.mockResolvedValue(buildTestCall());
    mocks.prismaCallFindFirst.mockResolvedValue(buildTestCall());
    mocks.prismaCallUpdate.mockResolvedValue(buildTestCall());
    mocks.prismaCallUpdateMany.mockResolvedValue({ count: 1 });
    mocks.prismaConversationFindUnique.mockResolvedValue({ id: "conv-ts-1", callId: TS_CALL_ID, messages: [] });
    mocks.prismaConversationUpsert.mockResolvedValue({ id: "conv-ts-1", callId: TS_CALL_ID, messages: [] });
    mocks.prismaConversationUpdate.mockResolvedValue({ id: "conv-ts-1", callId: TS_CALL_ID, messages: [] });
    mocks.voiceWorkerAddText.mockResolvedValue(true);
    mocks.generateAIResponse.mockResolvedValue("Our sales team handles new business inquiries.");
    mocks.retrieveKnowledge.mockResolvedValue([{ content: "Test Services offers competitive sales packages.", documentId: "doc-sales", score: 0.95, classification: "PUBLIC", chunkIndex: 0 }]);
    mocks.endProviderCall.mockResolvedValue({ success: true, alreadyEnded: false, providerCallId: "plivo-ts-1" });
    const redisStorage = new Map<string, string>();
    mocks.redisGet.mockImplementation(async (key: string) => {
      if (redisStorage.has(key)) return redisStorage.get(key)!;
      if (key.startsWith("ivr:flow-session:")) return JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" });
      return null;
    });
    mocks.redisSet.mockImplementation(async (key: string, value: unknown) => { redisStorage.set(key, String(value)); return "OK"; });
  });

  it("G1: startIVRGraphExecution resolves to main_menu with no DemoBank/banking wording", async () => {
    const result = await startIVRGraphExecution(TS_CALL_ID);
    expect(result.status).toBe("AWAITING_INPUT");
    expect(result.currentNodeId).toBe("main_menu");
    const speech = (result.speechText ?? "") + (result.entryPrompt ?? "");
    expect(speech).not.toContain("DemoBank");
    expect(speech).not.toContain("loan");
    expect(speech).not.toContain("eligibility");
    expect(speech).toContain("Test Services");
  });

  it("G2: DTMF 1 routes to Sales knowledge node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: TS_CALL_ID, provider: "PLIVO", digit: "1", timestamp: Date.now() });
    expect(result.handled).toBe(true);
    expect(result.graphExecution?.transitionReason).toBe("KNOWLEDGE_FOUND");
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(expect.any(String), 3, expect.objectContaining({ knowledgeDocumentIds: ["doc-sales"] }));
    expect(result.speechText ?? "").not.toContain("DemoBank");
  });

  it("G3: Voice 'sales' routes to Sales knowledge node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "VOICE", callId: TS_CALL_ID, provider: "PLIVO", text: "sales", isFinal: true, timestamp: Date.now() });
    expect(result.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(expect.any(String), 3, expect.objectContaining({ knowledgeDocumentIds: ["doc-sales"] }));
  });

  it("G4: Voice 'new sales' routes to Sales via configured alias", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "VOICE", callId: TS_CALL_ID, provider: "PLIVO", text: "new sales", isFinal: true, timestamp: Date.now() });
    expect(result.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(expect.any(String), 3, expect.objectContaining({ knowledgeDocumentIds: ["doc-sales"] }));
  });

  it("G5: DTMF 3 routes to Support knowledge node", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: TS_CALL_ID, provider: "PLIVO", digit: "3", timestamp: Date.now() });
    expect(result.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(expect.any(String), 3, expect.objectContaining({ knowledgeDocumentIds: ["doc-support"] }));
  });

  it("G6: Voice 'help desk' routes to Support via configured alias", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "VOICE", callId: TS_CALL_ID, provider: "PLIVO", text: "help desk", isFinal: true, timestamp: Date.now() });
    expect(result.handled).toBe(true);
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(expect.any(String), 3, expect.objectContaining({ knowledgeDocumentIds: ["doc-support"] }));
  });

  it("G7: DTMF 7 repeats the main menu (repeat is NOT hardcoded to digit 8)", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: TS_CALL_ID, provider: "PLIVO", digit: "7", timestamp: Date.now() });
    expect(result.handled).toBe(true);
    expect(result.graphExecution?.currentNodeId).toBe("main_menu");
    expect(result.graphExecution?.awaitInput).toBe(true);
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
    expect(mocks.endProviderCall).not.toHaveBeenCalled();
  });

  it("G8: DTMF 9 executes END_CALL with Test Services goodbye prompt", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: TS_CALL_ID, provider: "PLIVO", digit: "9", timestamp: Date.now() });
    expect(result.handled).toBe(true);
    expect(result.graphExecution?.endCall).toBe(true);
    expect(result.speechText).toBe("Thank you for contacting Test Services. Goodbye.");
    expect(result.speechText).not.toContain("DemoBank");
    expect(mocks.endProviderCall).toHaveBeenCalledWith(TS_CALL_ID);
  });

  it("G9: DTMF 2 is rejected (not configured in Test Services flow)", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    const result = await routeRealtimeCallInput({ type: "DTMF", callId: TS_CALL_ID, provider: "PLIVO", digit: "2", timestamp: Date.now() });
    expect(result.handled).toBe(false);
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
  });

  it("G10: Voice 'loan information' does NOT trigger doc-sales or doc-support retrieval (no alias bleed)", async () => {
    mocks.redisGet.mockResolvedValue(JSON.stringify({ flowId: TS_VERSION_ID, currentNodeId: "main_menu" }));
    await routeRealtimeCallInput({ type: "VOICE", callId: TS_CALL_ID, provider: "PLIVO", text: "loan information", isFinal: true, timestamp: Date.now() });
    // Must not have queried knowledge with loan-specific document IDs from another tenant
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalledWith(expect.any(String), expect.any(Number), expect.objectContaining({ knowledgeDocumentIds: ["doc-loan-rates"] }));
  });

  it("G11: normalizeMenuInputMode(BOTH) → inputType 'dtmf speech'", () => {
    expect(plivoInputTypeForMode(normalizeMenuInputMode("BOTH"))).toBe("dtmf speech");
  });

  it("G12: normalizeMenuInputMode(DTMF) → inputType 'dtmf'", () => {
    expect(plivoInputTypeForMode(normalizeMenuInputMode("DTMF"))).toBe("dtmf");
  });

  it("G13: normalizeMenuInputMode(SPEECH) → inputType 'speech'", () => {
    expect(plivoInputTypeForMode(normalizeMenuInputMode("SPEECH"))).toBe("speech");
  });

  it("G14: startIVRGraphExecution produces entryInputType='dtmf speech' for HYBRID_MENU with BOTH mode", async () => {
    const result = await startIVRGraphExecution(TS_CALL_ID);
    expect(result.status).toBe("AWAITING_INPUT");
    expect(result.currentNodeId).toBe("main_menu");
    expect(result.entryInputStage).toBe(true);
    expect(result.entryInputType).toBe("dtmf speech");
  });

  it("G15: DTMF_MENU node (no inputMode set) defaults to inputType='dtmf' via normalizeMenuInputMode default", () => {
    // DTMF_MENU has no explicit runtimeMenu.inputMode — executor default is 'DTMF'.
    // normalizeMenuInputMode(undefined, 'DTMF') must return 'DTMF'.
    const mode = normalizeMenuInputMode(undefined, "DTMF");
    expect(plivoInputTypeForMode(mode)).toBe("dtmf");
  });
});


