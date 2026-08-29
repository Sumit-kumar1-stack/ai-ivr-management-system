import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  rerankKnowledge: vi.fn(),
  publish: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("@/services/knowledge/reranker.service", () => ({ rerankKnowledge: mocks.rerankKnowledge }));
vi.mock("@/core/events", () => ({
  AppEvent: { RAG_QUERY: "RAG_QUERY", DOCUMENT_ACCESSED: "DOCUMENT_ACCESSED" },
  EventPublisher: { publish: mocks.publish },
}));
vi.mock("@/services/voice-runtime/cascaded-turn-latency.service", () => ({
  CascadedTurnLatency: { startRerank: vi.fn(), completeRerank: vi.fn() },
}));
vi.mock("@/services/voice-runtime/standard-runtime-usage.service", () => ({
  StandardRuntimeUsage: { recordRerankerTimeout: vi.fn() },
}));

import { retrieveKnowledge } from "@/services/knowledge/retrieval.service";

const candidates = [
  { content: "Personal loan rates start at ten percent.", documentId: "doc-1", chunkIndex: 0, classification: "PUBLIC_PRODUCT_INFO", score: 10 },
  { content: "Personal loan terms range from one to five years.", documentId: "doc-1", chunkIndex: 1, classification: "PUBLIC_PRODUCT_INFO", score: 5 },
];

const options = (signal?: AbortSignal) => ({
  knowledgeDocumentIds: ["doc-1"],
  tenantId: "tenant-1",
  callAuthenticationLevel: "AUTH_LEVEL_1" as const,
  callId: "call-1",
  signal,
});

describe("knowledge retrieval cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publish.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. caller abort cancels reranker and rejects with AbortError
  it("caller abort cancels reranker and rejects with AbortError", async () => {
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    let startRerank: (() => void) | undefined;
    const reranking = new Promise<void>(resolve => { startRerank = resolve; });

    mocks.queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]).mockResolvedValueOnce(candidates);
    mocks.rerankKnowledge.mockImplementation((_question: string, _candidates: unknown, signal: AbortSignal) => {
      observedSignal = signal;
      startRerank?.();
      return new Promise(() => {}); // never resolves to simulate pending reranking
    });

    const pending = retrieveKnowledge("What are the personal loan rates?", 4, options(controller.signal));
    await reranking;

    expect(observedSignal).toBeDefined();
    expect(observedSignal!.aborted).toBe(false);

    controller.abort();

    expect(observedSignal!.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  // 2. local reranker timeout still triggers existing BM25 fallback
  it("local reranker timeout still triggers existing BM25 fallback", async () => {
    vi.useFakeTimers();
    mocks.queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]).mockResolvedValueOnce(candidates);
    mocks.rerankKnowledge.mockImplementation(() => {
      return new Promise(() => {}); // never resolves
    });

    const pending = retrieveKnowledge("What are the personal loan rates?", 4, options());
    
    // Fast-forward time past standard reranker budget (default 800ms or KNOWLEDGE_RERANK_TIMEOUT_MS)
    await vi.advanceTimersByTimeAsync(1000);

    // Should resolve to BM25 fallback results
    await expect(pending).resolves.toMatchObject([
      { chunkIndex: 0 },
      { chunkIndex: 1 },
    ]);
  });

  // 3. caller signal + timeout can coexist
  it("caller signal + timeout can coexist", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let observedSignal: AbortSignal | undefined;

    mocks.queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]).mockResolvedValueOnce(candidates);
    mocks.rerankKnowledge.mockImplementation((_q: string, _c: unknown, signal: AbortSignal) => {
      observedSignal = signal;
      return new Promise(() => {});
    });

    // Case A: Timeout occurs first, falls back to BM25
    const pendingTimeout = retrieveKnowledge("What are the personal loan rates?", 4, options(controller.signal));
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pendingTimeout).resolves.toMatchObject([{ chunkIndex: 0 }, { chunkIndex: 1 }]);
    expect(observedSignal!.aborted).toBe(true); // Aborted due to timeout

    // Case B: Caller aborts first, throws AbortError
    const controllerB = new AbortController();
    mocks.queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]).mockResolvedValueOnce(candidates);
    const pendingAbort = retrieveKnowledge("What are the personal loan rates?", 4, options(controllerB.signal));
    
    // Wait a tiny bit (less than timeout) then abort
    await vi.advanceTimersByTimeAsync(100);
    controllerB.abort();

    await expect(pendingAbort).rejects.toMatchObject({ name: "AbortError" });
  });

  // 4. normal reranking still works
  it("normal reranking still works", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]).mockResolvedValueOnce(candidates);
    mocks.rerankKnowledge.mockResolvedValue([...candidates].reverse());

    await expect(retrieveKnowledge("What are the personal loan rates?", 4, options())).resolves.toMatchObject([
      { chunkIndex: 1 },
      { chunkIndex: 0 },
    ]);
  });

  // 5. late result after caller abort is discarded
  it("late result after caller abort is discarded", async () => {
    const controller = new AbortController();
    let resolveLate: ((value: typeof candidates) => void) | undefined;
    let startRerank: (() => void) | undefined;
    const reranking = new Promise<void>(resolve => { startRerank = resolve; });

    mocks.queryRaw.mockResolvedValueOnce([{ count: BigInt(2) }]).mockResolvedValueOnce(candidates);
    mocks.rerankKnowledge.mockImplementation(() => {
      startRerank?.();
      return new Promise(resolve => { resolveLate = resolve; });
    });

    const pending = retrieveKnowledge("What are the personal loan rates?", 4, options(controller.signal));
    await reranking;
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    
    // Resolve late result
    resolveLate?.([...candidates].reverse());
    await Promise.resolve();

    // Verification that late result is discarded (no event published)
    expect(mocks.publish).not.toHaveBeenCalledWith("DOCUMENT_ACCESSED", expect.anything());
  });
});
