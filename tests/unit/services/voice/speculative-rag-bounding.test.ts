import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(), getSession: vi.fn(), scope: vi.fn(), mark: vi.fn(), info: vi.fn(), debug: vi.fn(),
}));
vi.mock("@/services/knowledge/retrieval.service", () => ({ retrieveKnowledge: mocks.retrieve }));
vi.mock("@/providers/telephony/audio-session.service", () => ({ AudioSessionService: { getByCallId: mocks.getSession } }));
vi.mock("@/services/conversations/prompt-builder.service", () => ({
  resolveStandardKnowledgeScope: mocks.scope,
  buildStandardKnowledgeScopeFingerprint: scopeFingerprint,
}));
vi.mock("@/services/conversations/local-intent-router.service", () => ({ routeLocalIntent: () => ({ type: "NONE" }) }));
vi.mock("@/services/voice-runtime/cascaded-turn-latency.service", () => ({ CascadedTurnLatency: { markPrefetchStarted: mocks.mark, markPrefetchReady: mocks.mark, markPrefetchReused: mocks.mark, markPrefetchDiscarded: mocks.mark } }));
vi.mock("@/lib/logger", () => ({ createCallLogger: () => ({ info: mocks.info, debug: mocks.debug }) }));

import { StandardPartialPrefetchService } from "@/services/voice-runtime/standard-partial-prefetch.service";

const call = "call-speculative";

function scopeFingerprint(scope: {
  tenantId: string | null;
  knowledgeDocumentIds: string[];
  ownerUserId: string | null;
  callAuthenticationLevel: string | null;
}): string {
  return JSON.stringify({
    tenantId: scope.tenantId?.trim() || null,
    knowledgeDocumentIds: [...new Set(
      scope.knowledgeDocumentIds.map(id => id.trim()).filter(Boolean)
    )].sort(),
    ownerUserId: scope.ownerUserId?.trim() || null,
    callAuthenticationLevel: scope.callAuthenticationLevel ?? null,
  });
}

describe("speculative RAG debounce and bounding", () => {
  let service: StandardPartialPrefetchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StandardPartialPrefetchService();
    service.debounceDelayMs = 150;
    service.maxPrefetchAttempts = 3;

    mocks.getSession.mockReturnValue({ streamSid: "session-s" });
    mocks.scope.mockResolvedValue({ tenantId: "tenant-s", knowledgeDocumentIds: [], ownerUserId: null, callAuthenticationLevel: null });
    mocks.retrieve.mockResolvedValue([]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    service.clear(call);
    vi.useRealTimers();
  });

  it("rapid partial changes do not trigger one retrieval per partial", async () => {
    service.observePartial(call, "I need information about a personal loan");
    await vi.advanceTimersByTimeAsync(50);
    service.observePartial(call, "I need information about a personal loan documents");
    await vi.advanceTimersByTimeAsync(50);
    service.observePartial(call, "I need information about a personal loan document requirements");
    
    // Total elapsed: 100ms, debounce is 150ms. No prefetch should have started yet.
    expect(mocks.retrieve).not.toHaveBeenCalled();

    // Advance past remaining debounce
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.retrieve).toHaveBeenCalledTimes(1);
  });

  it("stable partial triggers prefetch after debounce", async () => {
    service.observePartial(call, "I need information about a personal loan");
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.retrieve).toHaveBeenCalledTimes(1);
  });

  it("insignificant text change does not restart", async () => {
    service.observePartial(call, "I need information about a personal loan");
    await vi.advanceTimersByTimeAsync(150); // triggered 1st prefetch
    expect(mocks.retrieve).toHaveBeenCalledTimes(1);

    // Insignificant text change (less than 3 chars growth, no new words)
    service.observePartial(call, "I need information about a personal loan.");
    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.retrieve).toHaveBeenCalledTimes(1); // Still 1
  });

  it("maximum speculative attempts enforced", async () => {
    // Attempt 1
    service.observePartial(call, "I need information about a personal loan");
    await vi.advanceTimersByTimeAsync(150);
    
    // Attempt 2
    service.observePartial(call, "I need information about a personal loan rates");
    await vi.advanceTimersByTimeAsync(150);

    // Attempt 3
    service.observePartial(call, "I need information about a personal loan document requirements");
    await vi.advanceTimersByTimeAsync(150);

    expect(mocks.retrieve).toHaveBeenCalledTimes(3);

    // Attempt 4 should be blocked
    service.observePartial(call, "I need information about a personal loan document requirements processing fee");
    await vi.advanceTimersByTimeAsync(150);

    expect(mocks.retrieve).toHaveBeenCalledTimes(3); // Still 3
  });

  it("newer partial cancels/supersedes older work", async () => {
    const signals: AbortSignal[] = [];
    mocks.retrieve.mockImplementation((_q: string, _limit: number, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      return new Promise(() => {});
    });

    service.observePartial(call, "I need information about a personal loan");
    await vi.advanceTimersByTimeAsync(150);
    expect(signals[0]).toBeDefined();
    expect(signals[0].aborted).toBe(false);

    // Newer partial triggers prefetch
    service.observePartial(call, "I need information about a personal loan documents");
    await vi.advanceTimersByTimeAsync(150);

    // Older work is cancelled
    expect(signals[0].aborted).toBe(true);
  });

  it("final transcript remains authoritative and discards prefetch if wrong scope/tenant", async () => {
    service.observePartial(call, "I need information about a personal loan");
    await vi.advanceTimersByTimeAsync(150);

    expect(service.claimFinal(call, "I need information about a personal loan", 1, "generation-s")).toBe("REUSE");
    
    // Try to claim with mismatched scope fingerprint
    const reusable = await service.takeReusableKnowledge(
      call,
      "I need information about a personal loan",
      "generation-s",
      scopeFingerprint({
        tenantId: "different-tenant",
        knowledgeDocumentIds: [],
        ownerUserId: null,
        callAuthenticationLevel: null,
      })
    );
    expect(reusable).toBeNull();
  });
});
