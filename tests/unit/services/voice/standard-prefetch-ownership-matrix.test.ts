import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(), getSession: vi.fn(), scope: vi.fn(), mark: vi.fn(), info: vi.fn(), debug: vi.fn(),
}));
vi.mock("@/services/knowledge/retrieval.service", () => ({ retrieveKnowledge: mocks.retrieve }));
vi.mock("@/providers/telephony/audio-session.service", () => ({ AudioSessionService: { getByCallId: mocks.getSession } }));
vi.mock("@/services/conversations/prompt-builder.service", () => ({ resolveStandardKnowledgeScope: mocks.scope }));
vi.mock("@/services/conversations/local-intent-router.service", () => ({ routeLocalIntent: () => ({ type: "NONE" }) }));
vi.mock("@/services/voice-runtime/cascaded-turn-latency.service", () => ({ CascadedTurnLatency: { markPrefetchStarted: mocks.mark, markPrefetchReady: mocks.mark, markPrefetchReused: mocks.mark, markPrefetchDiscarded: mocks.mark } }));
vi.mock("@/lib/logger", () => ({ createCallLogger: () => ({ info: mocks.info, debug: mocks.debug }) }));

import { StandardPartialPrefetchService } from "@/services/voice-runtime/standard-partial-prefetch.service";

const call = "call-a";
const partial = "I need information about a personal loan";

describe("speculative RAG ownership matrix", () => {
  let service: StandardPartialPrefetchService;
  let resolveRetrieval: ((value: never[]) => void) | undefined;

  beforeEach(() => {
    service = new StandardPartialPrefetchService();
    mocks.getSession.mockReturnValue({ streamSid: "session-a" });
    mocks.scope.mockResolvedValue({ tenantId: "tenant-a", knowledgeDocumentIds: [], ownerUserId: null, callAuthenticationLevel: null });
    mocks.retrieve.mockImplementation((_q: string, _limit: number, options: { signal: AbortSignal }) => new Promise(resolve => { resolveRetrieval = resolve; options.signal.addEventListener("abort", () => undefined); }));
  });
  afterEach(() => service.clear(call));

  it("reuses a compatible final and rejects wrong call/generation ownership", async () => {
    service.observePartial(call, partial);
    await Promise.resolve();
    expect(service.claimFinal(call, `${partial} documents`, 1, "call-a:1")).toBe("REUSE");
    expect(await service.takeReusableKnowledge(call, `${partial} documents`, "call-a:2")).toBeNull();
    expect(service.claimFinal("call-b", `${partial} documents`, 1, "call-b:1")).toBe("REFETCH");
  });

  it("reuses minor extensions and refetches changed intent or incompatible text", async () => {
    service.observePartial(call, partial); await Promise.resolve();
    expect(service.claimFinal(call, `${partial} please`, 1, "call-a:1")).toBe("REUSE");
    service.clear(call); service.observePartial(call, partial); await Promise.resolve();
    expect(service.claimFinal(call, "Actually transfer me to a person", 2, "call-a:2")).toBe("REFETCH");
    service.observePartial(call, partial); await Promise.resolve();
    expect(service.claimFinal(call, "What is my account balance", 3, "call-a:3")).toBe("REFETCH");
  });

  it("abandons an ignored-abort late retrieval without exposing it", async () => {
    service.observePartial(call, partial); await Promise.resolve();
    expect(service.claimFinal(call, partial, 1, "call-a:1")).toBe("REUSE");
    const pending = service.takeReusableKnowledge(call, partial, "call-a:1");
    service.cancel(call, "generation_invalidated");
    resolveRetrieval?.([]);
    expect(await pending).toBeNull();
  });

  it("is read-only: it invokes retrieval only, never a tool, transfer, callback, or auth mutation", async () => {
    service.observePartial(call, partial); await Promise.resolve();
    expect(mocks.retrieve).toHaveBeenCalledWith(partial, 4, expect.objectContaining({ callId: call, tenantId: "tenant-a" }));
    expect(JSON.stringify(mocks.retrieve.mock.calls)).not.toContain("transfer");
    expect(JSON.stringify(mocks.retrieve.mock.calls)).not.toContain("callback");
    expect(JSON.stringify(mocks.retrieve.mock.calls)).not.toContain("auth");
  });
});
