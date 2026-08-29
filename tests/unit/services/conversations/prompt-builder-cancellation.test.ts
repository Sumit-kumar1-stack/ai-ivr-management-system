import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getCall: vi.fn(),
  getConversationMemory: vi.fn(),
  getConversation: vi.fn(),
  resolveOutboundConversationContext: vi.fn(),
  buildOutboundContextPrompt: vi.fn(),
  routeConversationMessage: vi.fn(),
  retrieveKnowledge: vi.fn(),
  rewriteQuery: vi.fn(),
  takeReusableKnowledge: vi.fn(),
}));

vi.mock("@/services/calls/call.service", () => ({ getCall: mocks.getCall }));
vi.mock("@/services/conversations/memory.service", () => ({ getConversationMemory: mocks.getConversationMemory }));
vi.mock("@/services/conversations/conversation.service", () => ({ ConversationService: { getConversation: mocks.getConversation } }));
vi.mock("@/services/campaigns/outbound-conversation-context.service", () => ({
  resolveOutboundConversationContext: mocks.resolveOutboundConversationContext,
  buildOutboundContextPrompt: mocks.buildOutboundContextPrompt,
}));
vi.mock("@/services/conversations/conversation-route.service", () => ({ routeConversationMessage: mocks.routeConversationMessage }));
vi.mock("@/services/knowledge/retrieval.service", () => ({ retrieveKnowledge: mocks.retrieveKnowledge }));
vi.mock("@/services/knowledge/query-rewriter.service", () => ({ rewriteQuery: mocks.rewriteQuery }));
vi.mock("@/services/voice-runtime/cascaded-turn-latency.service", () => ({
  CascadedTurnLatency: {
    startRag: vi.fn(),
    startQueryRewrite: vi.fn(),
    completeQueryRewrite: vi.fn(),
    startRetrieval: vi.fn(),
    completeRetrieval: vi.fn(),
    completeRag: vi.fn(),
    fail: vi.fn(),
  },
}));
vi.mock("@/services/voice-runtime/standard-partial-prefetch.service", () => ({
  StandardPartialPrefetch: { takeReusableKnowledge: mocks.takeReusableKnowledge },
}));

import { buildPrompt } from "@/services/conversations/prompt-builder.service";

describe("final RAG prompt cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getCall.mockResolvedValue({
      direction: "INBOUND",
      tenantId: "tenant-1",
      authenticationLevel: "AUTH_LEVEL_1",
    });
    mocks.getConversationMemory.mockResolvedValue("");
    mocks.getConversation.mockResolvedValue({ messages: [{ role: "ASSISTANT", content: "Personal loans are available." }] });
    mocks.resolveOutboundConversationContext.mockResolvedValue({ outbound: false, campaignId: null, purpose: null });
    mocks.buildOutboundContextPrompt.mockReturnValue("");
    mocks.routeConversationMessage.mockReturnValue({ route: "FOLLOW_UP_KNOWLEDGE", reason: "contextual_follow_up" });
    mocks.takeReusableKnowledge.mockResolvedValue(null);
    mocks.rewriteQuery.mockResolvedValue("What are the personal loan rates?");
    mocks.retrieveKnowledge.mockResolvedValue([]);
  });

  it("does not begin rewrite, retrieval, or reranking work when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(buildPrompt("call-1", "What about its rate?", undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });

    expect(mocks.rewriteQuery).not.toHaveBeenCalled();
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
  });

  it("does not retrieve after cancellation during query rewrite", async () => {
    const controller = new AbortController();
    let startRewrite: (() => void) | undefined;
    const rewriting = new Promise<void>(resolve => { startRewrite = resolve; });

    mocks.rewriteQuery.mockImplementation((_history: string, _question: string, signal: AbortSignal) => {
      startRewrite?.();
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    });

    const pending = buildPrompt("call-1", "What about its rate?", undefined, controller.signal);
    await rewriting;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.retrieveKnowledge).not.toHaveBeenCalled();
  });

  it("uses the turn signal on the unchanged non-aborted final RAG path", async () => {
    const controller = new AbortController();

    await expect(buildPrompt("call-1", "What about its rate?", undefined, controller.signal)).resolves.toBe("NO_RELEVANT_KNOWLEDGE");

    expect(mocks.rewriteQuery).toHaveBeenCalledWith(
      expect.any(String),
      "What about its rate?",
      controller.signal
    );
    expect(mocks.retrieveKnowledge).toHaveBeenCalledWith(
      "What are the personal loan rates?",
      4,
      expect.objectContaining({ signal: controller.signal })
    );
  });
});
