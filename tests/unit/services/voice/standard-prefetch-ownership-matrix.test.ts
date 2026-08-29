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

const call = "call-a";
const partial = "I need information about a personal loan";

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

describe("speculative RAG ownership matrix", () => {
  let service: StandardPartialPrefetchService;
  let resolveRetrieval: ((value: never[]) => void) | undefined;

  beforeEach(() => {
    service = new StandardPartialPrefetchService();
    service.debounceDelayMs = 0;
    mocks.getSession.mockReturnValue({ streamSid: "session-a" });
    mocks.scope.mockResolvedValue({
      tenantId: "tenant-a",
      knowledgeDocumentIds: [],
      ownerUserId: null,
      callAuthenticationLevel: null,
    });
    mocks.retrieve.mockImplementation((_q: string, _limit: number, options: { signal: AbortSignal }) => new Promise(resolve => {
      resolveRetrieval = resolve;
      options.signal.addEventListener("abort", () => resolve([]), { once: true });
    }));
  });
  afterEach(() => service.clear(call));

  it("reuses a compatible final and rejects wrong call/generation ownership", async () => {
    service.observePartial(call, partial);
    await Promise.resolve();
    const prefetchScope = {
      tenantId: "tenant-a",
      knowledgeDocumentIds: [],
      ownerUserId: null,
      callAuthenticationLevel: null,
    };
    expect(service.claimFinal(call, `${partial} documents`, 1, "call-a:1")).toBe("REUSE");
    expect(await service.takeReusableKnowledge(call, `${partial} documents`, "call-a:2", scopeFingerprint(prefetchScope))).toBeNull();
    const pending = service.takeReusableKnowledge(call, `${partial} documents`, "call-a:1", scopeFingerprint(prefetchScope));
    resolveRetrieval?.([]);
    expect(await pending).toEqual([]);
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
    await vi.waitFor(() => expect(mocks.retrieve).toHaveBeenCalledTimes(1));
    const pending = service.takeReusableKnowledge(call, partial, "call-a:1", scopeFingerprint({
      tenantId: "tenant-a",
      knowledgeDocumentIds: [],
      ownerUserId: null,
      callAuthenticationLevel: null,
    }));
    service.cancel(call, "generation_invalidated");
    expect(await pending).toBeNull();
  });

  it("is read-only: it invokes retrieval only, never a tool, transfer, callback, or auth mutation", async () => {
    service.observePartial(call, partial); await Promise.resolve();
    await vi.waitFor(() => expect(mocks.retrieve).toHaveBeenCalledTimes(1));
    expect(mocks.retrieve).toHaveBeenCalledWith(partial, 4, expect.objectContaining({ callId: call, tenantId: "tenant-a" }));
    expect(JSON.stringify(mocks.retrieve.mock.calls)).not.toContain("transfer");
    expect(JSON.stringify(mocks.retrieve.mock.calls)).not.toContain("callback");
    expect(JSON.stringify(mocks.retrieve.mock.calls)).not.toContain("auth");
  });

  it("discards speculative reuse when the knowledgeDocumentIds change", async () => {
    mocks.scope
      .mockResolvedValueOnce({
        tenantId: "tenant-a",
        knowledgeDocumentIds: ["doc-a"],
        ownerUserId: null,
        callAuthenticationLevel: null,
      })
      .mockResolvedValueOnce({
        tenantId: "tenant-a",
        knowledgeDocumentIds: ["doc-a", "doc-b"],
        ownerUserId: null,
        callAuthenticationLevel: null,
      });

    service.observePartial(call, partial);
    await Promise.resolve();
    expect(service.claimFinal(call, `${partial} documents`, 1, "call-a:1")).toBe("REUSE");
    expect(
      await service.takeReusableKnowledge(
        call,
        `${partial} documents`,
        "call-a:1",
        scopeFingerprint({
          tenantId: "tenant-a",
          knowledgeDocumentIds: ["doc-a", "doc-b"],
          ownerUserId: null,
          callAuthenticationLevel: null,
        })
      )
    ).toBeNull();
    resolveRetrieval?.([]);
  });

  it("discards speculative reuse when the tenant changes", async () => {
    mocks.scope
      .mockResolvedValueOnce({
        tenantId: "tenant-a",
        knowledgeDocumentIds: ["doc-a"],
        ownerUserId: null,
        callAuthenticationLevel: null,
      })
      .mockResolvedValueOnce({
        tenantId: "tenant-b",
        knowledgeDocumentIds: ["doc-a"],
        ownerUserId: null,
        callAuthenticationLevel: null,
      });

    service.observePartial(call, partial);
    await Promise.resolve();
    expect(service.claimFinal(call, `${partial} documents`, 1, "call-a:1")).toBe("REUSE");
    expect(
      await service.takeReusableKnowledge(
        call,
        `${partial} documents`,
        "call-a:1",
        scopeFingerprint({
          tenantId: "tenant-b",
          knowledgeDocumentIds: ["doc-a"],
          ownerUserId: null,
          callAuthenticationLevel: null,
        })
      )
    ).toBeNull();
    resolveRetrieval?.([]);
  });

  it("discards speculative reuse when auth or owner scope changes", async () => {
    mocks.scope
      .mockResolvedValueOnce({
        tenantId: "tenant-a",
        knowledgeDocumentIds: ["doc-a"],
        ownerUserId: "owner-a",
        callAuthenticationLevel: "AUTH_LEVEL_0",
      })
      .mockResolvedValueOnce({
        tenantId: "tenant-a",
        knowledgeDocumentIds: ["doc-a"],
        ownerUserId: "owner-b",
        callAuthenticationLevel: "AUTH_LEVEL_1",
      });

    service.observePartial(call, partial);
    await Promise.resolve();
    expect(service.claimFinal(call, `${partial} documents`, 1, "call-a:1")).toBe("REUSE");
    expect(
      await service.takeReusableKnowledge(
        call,
        `${partial} documents`,
        "call-a:1",
        scopeFingerprint({
          tenantId: "tenant-a",
          knowledgeDocumentIds: ["doc-a"],
          ownerUserId: "owner-b",
          callAuthenticationLevel: "AUTH_LEVEL_1",
        })
      )
    ).toBeNull();
    resolveRetrieval?.([]);
  });
});
