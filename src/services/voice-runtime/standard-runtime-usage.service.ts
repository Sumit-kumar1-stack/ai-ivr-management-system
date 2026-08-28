import { prisma } from "@/lib/prisma";
import { createCallLogger } from "@/lib/logger";

type UsageState = {
  tenantId: string;
  callId: string;
  turnId: number;
  startedAt: Date;
  sttAudioBytes: number;
  sttProvider?: string;
  llmProvider?: string;
  llmModel?: string;
  llmInputTokens?: number | null;
  llmOutputTokens?: number | null;
  ttsProvider?: string;
  ttsCharacters: number;
  ttsAudioBytes: number;
  ttsRequestCount: number;
  ragRetrievalCount: number;
  rerankerCount: number;
  rerankerTimeoutCount: number;
  toolInvocationCount: number;
};

/** Provider-neutral unit recorder. It intentionally stores no prices or text. */
class StandardRuntimeUsageService {
  private readonly pendingSttBytes = new Map<string, number>();
  private readonly pendingSttProviders = new Map<string, string>();
  private readonly turns = new Map<string, UsageState>();
  private readonly activeTurnKeys = new Map<string, string>();

  private key(callId: string, turnId: number): string {
    return `${callId}:${turnId}`;
  }

  private active(callId: string): UsageState | undefined {
    const key = this.activeTurnKeys.get(callId);
    return key ? this.turns.get(key) : undefined;
  }

  begin(callId: string, turnId: number, tenantId?: string | null): void {
    if (!tenantId) return;
    const key = this.key(callId, turnId);
    this.turns.set(key, {
      tenantId, callId, turnId, startedAt: new Date(),
      sttAudioBytes: this.pendingSttBytes.get(callId) ?? 0,
      sttProvider: this.pendingSttProviders.get(callId),
      ttsCharacters: 0, ttsAudioBytes: 0, ttsRequestCount: 0,
      ragRetrievalCount: 0, rerankerCount: 0, rerankerTimeoutCount: 0, toolInvocationCount: 0,
    });
    this.activeTurnKeys.set(callId, key);
    this.pendingSttBytes.delete(callId);
    this.pendingSttProviders.delete(callId);
  }

  recordSttAudio(callId: string, bytes: number, provider = "DEEPGRAM"): void {
    const usage = this.active(callId);
    if (!usage) {
      this.pendingSttBytes.set(callId, (this.pendingSttBytes.get(callId) ?? 0) + Math.max(0, bytes));
      this.pendingSttProviders.set(callId, provider);
      return;
    }
    usage.sttProvider = provider;
    usage.sttAudioBytes += Math.max(0, bytes);
  }

  recordRag(callId: string): void { const usage = this.active(callId); if (usage) usage.ragRetrievalCount += 1; }
  recordReranker(callId: string, timeout = false): void { const usage = this.active(callId); if (usage) { usage.rerankerCount += 1; if (timeout) usage.rerankerTimeoutCount += 1; } }
  recordRerankerTimeout(callId: string): void { const usage = this.active(callId); if (usage) usage.rerankerTimeoutCount += 1; }
  recordTool(callId: string): void { const usage = this.active(callId); if (usage) usage.toolInvocationCount += 1; }
  recordLlm(callId: string, provider: string, model: string): void { const usage = this.active(callId); if (usage) { usage.llmProvider = provider; usage.llmModel = model; } }
  /** Records provider-native units only; unavailable metadata intentionally stays NULL. */
  recordLlmUsage(callId: string, inputTokens?: number | null, outputTokens?: number | null): void {
    const usage = this.active(callId);
    if (!usage) return;
    if (typeof inputTokens === "number") usage.llmInputTokens = inputTokens;
    if (typeof outputTokens === "number") usage.llmOutputTokens = outputTokens;
  }
  recordTts(callId: string, provider: string, characters: number, mulawBytes: number): void {
    const usage = this.active(callId); if (!usage) return;
    usage.ttsProvider = provider; usage.ttsCharacters += Math.max(0, characters); usage.ttsAudioBytes += Math.max(0, mulawBytes); usage.ttsRequestCount += 1;
  }

  async complete(callId: string, turnId?: number): Promise<void> {
    const key = turnId === undefined ? this.activeTurnKeys.get(callId) : this.key(callId, turnId);
    const usage = key ? this.turns.get(key) : undefined;
    if (!usage) return;
    this.turns.delete(key!);
    if (this.activeTurnKeys.get(callId) === key) this.activeTurnKeys.delete(callId);
    try {
      await prisma.standardRuntimeUsage.upsert({
        where: { callId_turnId: { callId: usage.callId, turnId: usage.turnId } },
        create: {
          tenantId: usage.tenantId, callId: usage.callId, turnId: usage.turnId, runtime: "STANDARD", startedAt: usage.startedAt, completedAt: new Date(),
          sttProvider: usage.sttProvider, sttAudioSeconds: usage.sttAudioBytes ? usage.sttAudioBytes / 8_000 : null,
          llmProvider: usage.llmProvider, llmModel: usage.llmModel, llmInputTokens: usage.llmInputTokens ?? null, llmOutputTokens: usage.llmOutputTokens ?? null,
          ttsProvider: usage.ttsProvider, ttsCharacters: usage.ttsCharacters, ttsAudioSeconds: usage.ttsAudioBytes ? usage.ttsAudioBytes / 8_000 : null, ttsRequestCount: usage.ttsRequestCount,
          ragRetrievalCount: usage.ragRetrievalCount, rerankerCount: usage.rerankerCount, rerankerTimeoutCount: usage.rerankerTimeoutCount, toolInvocationCount: usage.toolInvocationCount,
        },
        update: { completedAt: new Date(), sttProvider: usage.sttProvider, sttAudioSeconds: usage.sttAudioBytes ? usage.sttAudioBytes / 8_000 : null, llmProvider: usage.llmProvider, llmModel: usage.llmModel, llmInputTokens: usage.llmInputTokens ?? null, llmOutputTokens: usage.llmOutputTokens ?? null, ttsProvider: usage.ttsProvider, ttsCharacters: usage.ttsCharacters, ttsAudioSeconds: usage.ttsAudioBytes ? usage.ttsAudioBytes / 8_000 : null, ttsRequestCount: usage.ttsRequestCount, ragRetrievalCount: usage.ragRetrievalCount, rerankerCount: usage.rerankerCount, rerankerTimeoutCount: usage.rerankerTimeoutCount, toolInvocationCount: usage.toolInvocationCount },
      });
    } catch (error) {
      createCallLogger(callId).error({ event: "standard.usage.persistence_failed", error }, "Standard usage units could not be persisted");
    }
  }

  async getCallUsage(callId: string, tenantId: string) {
    return prisma.standardRuntimeUsage.aggregate({ where: { callId, tenantId, runtime: "STANDARD" }, _sum: usageSums });
  }
  async getTenantUsage(tenantId: string, from: Date, to: Date) {
    return prisma.standardRuntimeUsage.aggregate({ where: { tenantId, runtime: "STANDARD", startedAt: { gte: from, lte: to } }, _sum: usageSums });
  }
  async getRuntimeUsage(tenantId: string, runtime: "STANDARD", from: Date, to: Date) {
    return prisma.standardRuntimeUsage.aggregate({ where: { tenantId, runtime, startedAt: { gte: from, lte: to } }, _sum: usageSums });
  }
}

const usageSums = { sttAudioSeconds: true, llmInputTokens: true, llmOutputTokens: true, ttsCharacters: true, ttsAudioSeconds: true, ttsRequestCount: true, ragRetrievalCount: true, rerankerCount: true, rerankerTimeoutCount: true, toolInvocationCount: true } as const;
export { StandardRuntimeUsageService };
export const StandardRuntimeUsage = new StandardRuntimeUsageService();
