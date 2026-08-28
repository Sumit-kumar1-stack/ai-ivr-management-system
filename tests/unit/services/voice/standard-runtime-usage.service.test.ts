import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, aggregate } = vi.hoisted(() => ({ upsert: vi.fn(), aggregate: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { standardRuntimeUsage: { upsert, aggregate } },
}));

vi.mock("@/lib/logger", () => ({
  createCallLogger: () => ({ error: vi.fn() }),
}));

import { StandardRuntimeUsageService } from "@/services/voice-runtime/standard-runtime-usage.service";

describe("StandardRuntimeUsageService", () => {
  let usage: StandardRuntimeUsageService;

  beforeEach(() => {
    usage = new StandardRuntimeUsageService();
    upsert.mockReset().mockResolvedValue({});
    aggregate.mockReset().mockResolvedValue({ _sum: {} });
  });

  it("persists μ-law durations and aggregates multiple phrase TTS requests", async () => {
    usage.recordSttAudio("call-1", 8_000);
    usage.begin("call-1", 1, "tenant-a");
    usage.recordSttAudio("call-1", 8_000);
    usage.recordTts("call-1", "GEMINI", 30, 4_000);
    usage.recordTts("call-1", "GEMINI", 20, 4_000);
    await usage.complete("call-1", 1);

    const create = upsert.mock.calls[0]?.[0].create;
    expect(create).toMatchObject({
      runtime: "STANDARD", sttProvider: "DEEPGRAM", sttAudioSeconds: 2,
      ttsProvider: "GEMINI", ttsCharacters: 50, ttsAudioSeconds: 1, ttsRequestCount: 2,
    });
  });

  it("leaves unavailable duration and token metadata null without estimation", async () => {
    usage.begin("call-1", 1, "tenant-a");
    usage.recordLlm("call-1", "GEMINI", "gemini-text");
    await usage.complete("call-1", 1);
    expect(upsert.mock.calls[0]?.[0].create).toMatchObject({
      sttAudioSeconds: null, ttsAudioSeconds: null,
      llmInputTokens: null, llmOutputTokens: null,
    });
  });

  it("persists provider-native LLM provider, model, and token metadata", async () => {
    usage.begin("call-1", 1, "tenant-a");
    usage.recordLlm("call-1", "GEMINI", "gemini-3.6-flash");
    usage.recordLlmUsage("call-1", 123, 45);
    await usage.complete("call-1", 1);
    expect(upsert.mock.calls[0]?.[0].create).toMatchObject({
      llmProvider: "GEMINI", llmModel: "gemini-3.6-flash", llmInputTokens: 123, llmOutputTokens: 45,
    });
  });

  it("counts RAG, reranking, exactly one timeout, and actual tool invocation", async () => {
    usage.begin("call-1", 1, "tenant-a");
    usage.recordRag("call-1");
    usage.recordReranker("call-1");
    usage.recordRerankerTimeout("call-1");
    usage.recordTool("call-1");
    await usage.complete("call-1", 1);
    expect(upsert.mock.calls[0]?.[0].create).toMatchObject({
      ragRetrievalCount: 1, rerankerCount: 1, rerankerTimeoutCount: 1, toolInvocationCount: 1,
    });
  });

  it("does not create a Standard record for Premium or speculative-only work", async () => {
    usage.recordRag("premium-call");
    usage.recordTool("premium-call");
    await usage.complete("premium-call");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("tenant-scopes call aggregation and fails closed across tenants", async () => {
    await usage.getCallUsage("call-1", "tenant-a");
    expect(aggregate).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ callId: "call-1", tenantId: "tenant-a", runtime: "STANDARD" }),
    }));
    await usage.getCallUsage("call-1", "tenant-b");
    expect(aggregate).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ callId: "call-1", tenantId: "tenant-b", runtime: "STANDARD" }),
    }));
  });

  it("tenant-scopes range and runtime aggregation", async () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-01-31");
    await usage.getTenantUsage("tenant-a", from, to);
    await usage.getRuntimeUsage("tenant-a", "STANDARD", from, to);
    for (const [request] of aggregate.mock.calls) {
      expect(request.where).toMatchObject({ tenantId: "tenant-a", runtime: "STANDARD", startedAt: { gte: from, lte: to } });
    }
  });

  it("does not persist contents, API keys, auth tokens, or customer secrets", async () => {
    usage.begin("call-1", 1, "tenant-a");
    usage.recordLlm("call-1", "GEMINI", "model-without-secrets");
    await usage.complete("call-1", 1);
    const serialized = JSON.stringify(upsert.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("api-key");
    expect(serialized).not.toContain("auth-token");
    expect(serialized).not.toContain("customer-secret");
  });
});
