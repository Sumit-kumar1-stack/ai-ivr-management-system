import { afterEach, describe, expect, it, vi } from "vitest";

const rerank = vi.hoisted(() => vi.fn());
vi.mock("@/services/knowledge/reranker.service", () => ({ rerankKnowledge: rerank }));
vi.mock("@/services/voice-runtime/standard-runtime-usage.service", () => ({ StandardRuntimeUsage: { recordRerankerTimeout: vi.fn() } }));
vi.mock("@/services/voice-runtime/cascaded-turn-latency.service", () => ({ CascadedTurnLatency: {} }));

import { rerankWithTimeoutForTesting } from "@/services/knowledge/retrieval.service";

const candidates = [{ content: "BM25 first", score: 1, documentId: "d1", chunkIndex: 0, classification: "PUBLIC_PRODUCT_INFO" }];

describe("reranker cancellation matrix", () => {
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("completes inside budget", async () => {
    rerank.mockResolvedValue(candidates);
    await expect(rerankWithTimeoutForTesting("question", candidates)).resolves.toEqual(candidates);
  });

  it("aborts and rejects at the realtime budget while ignored late completion is discarded", async () => {
    vi.useFakeTimers();
    let resolveLate: ((value: typeof candidates) => void) | undefined;
    rerank.mockImplementation((_q: string, _c: unknown, signal: AbortSignal) => new Promise(resolve => { resolveLate = resolve; expect(signal.aborted).toBe(false); }));
    const pending = rerankWithTimeoutForTesting("question", candidates);
    const settled = pending.then(() => null, error => error);
    await vi.advanceTimersByTimeAsync(400);
    await expect(settled).resolves.toMatchObject({ name: "KnowledgeRerankTimeoutError" });
    resolveLate?.([{ ...candidates[0], content: "late provider result" }]);
    await Promise.resolve();
  });

  it("propagates caller cancellation to a provider that honors AbortSignal", async () => {
    let observedAbort = false;
    rerank.mockImplementation((_q: string, _c: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => { observedAbort = true; reject(new DOMException("aborted", "AbortError")); })));
    const controller = new AbortController();
    const pending = rerankWithTimeoutForTesting("question", candidates, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(observedAbort).toBe(true);
  });
});
