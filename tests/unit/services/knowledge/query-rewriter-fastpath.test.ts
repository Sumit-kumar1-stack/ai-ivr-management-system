import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  askAI: vi.fn(),
}));

vi.mock("@/services/ai/llm.factory", () => ({
  askAI: mocks.askAI,
}));

import { rewriteQuery } from "@/services/knowledge/query-rewriter.service";

describe("query rewrite fastpath + timeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("self-contained query skips LLM rewrite", async () => {
    const query = "What documents are required for a personal loan?";
    const result = await rewriteQuery("history", query);
    expect(result).toBe(query);
    expect(mocks.askAI).not.toHaveBeenCalled();
  });

  it("ambiguous follow-up still uses rewrite", async () => {
    mocks.askAI.mockResolvedValue("Standalone query about processing fees");
    const result = await rewriteQuery("history", "What about the processing fee?");
    expect(result).toBe("Standalone query about processing fees");
    expect(mocks.askAI).toHaveBeenCalled();
  });

  it("rewrite timeout falls back to original query", async () => {
    vi.useFakeTimers();
    mocks.askAI.mockImplementation(() => new Promise(() => {})); // never resolves
    
    const pending = rewriteQuery("history", "What about the processing fee?");
    await vi.advanceTimersByTimeAsync(2000);
    
    await expect(pending).resolves.toBe("What about the processing fee?");
  });

  it("caller abort rethrows AbortError", async () => {
    const controller = new AbortController();
    mocks.askAI.mockImplementation((_prompt: string, signal?: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("aborted", "AbortError"));
        }
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    const pending = rewriteQuery("history", "What about the processing fee?", controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("successful rewrite unchanged", async () => {
    mocks.askAI.mockResolvedValue("Standalone query");
    const result = await rewriteQuery("history", "What about that?");
    expect(result).toBe("Standalone query");
  });
});
