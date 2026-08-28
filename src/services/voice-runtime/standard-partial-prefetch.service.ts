import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { createCallLogger } from "@/lib/logger";
import { AudioSessionService } from "@/providers/telephony/audio-session.service";
import { resolveStandardKnowledgeScope } from "@/services/conversations/prompt-builder.service";
import { routeLocalIntent, type LocalIntentType } from "@/services/conversations/local-intent-router.service";
import { retrieveKnowledge, type RetrievedKnowledgeChunk } from "@/services/knowledge/retrieval.service";
import { CascadedTurnLatency } from "./cascaded-turn-latency.service";

export type PrefetchDecision = "REUSE" | "DISCARD" | "REFETCH";

interface StandardPartialPrefetch {
  stableText: string;
  normalizedText: string;
  intent: LocalIntentType;
  callId: string;
  sessionId: string | null;
  turnId: number | null;
  generationId: string;
  tenantId: string | null;
  controller: AbortController;
  retrieval: Promise<RetrievedKnowledgeChunk[]>;
  claimed: boolean;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function decisionFor(partial: StandardPartialPrefetch, finalText: string): PrefetchDecision {
  const finalQuery = normalize(finalText);
  if (!finalQuery || partial.controller.signal.aborted) return "DISCARD";
  if (/\b(actually|instead|rather|change)\b/.test(finalQuery)) return "REFETCH";
  return finalQuery.startsWith(partial.normalizedText) ? "REUSE" : "REFETCH";
}

/** Ephemeral, tenant-scoped retrieval prefetch; it has no tool/mutation path. */
export class StandardPartialPrefetchService {
  private readonly entries = new Map<string, StandardPartialPrefetch>();
  private sequence = 0;

  observePartial(callId: string, text: string): void {
    const stableText = text.trim().replace(/\s+/g, " ");
    if (!STANDARD_REALTIME_CONFIG.speculativePrefetchEnabled || stableText.length < STANDARD_REALTIME_CONFIG.stablePartialMinCharacters) return;
    const normalizedText = normalize(stableText);
    const previous = this.entries.get(callId);
    if (previous?.normalizedText === normalizedText) return;
    previous?.controller.abort();

    const controller = new AbortController();
    const session = AudioSessionService.getByCallId(callId);
    const generationId = `${callId}:prefetch:${++this.sequence}`;
    const intent = routeLocalIntent(stableText).type;
    const retrieval = resolveStandardKnowledgeScope(callId).then(async scope => {
      if (controller.signal.aborted) throw new DOMException("Prefetch aborted", "AbortError");
      const entry = this.entries.get(callId);
      if (entry?.generationId === generationId) entry.tenantId = scope.tenantId;
      return retrieveKnowledge(stableText, 4, { ...scope, callId, signal: controller.signal });
    });

    void retrieval.catch(() => undefined);
    this.entries.set(callId, { stableText, normalizedText, intent, callId, sessionId: session?.streamSid ?? null, turnId: null, generationId, tenantId: null, controller, retrieval, claimed: false });
    CascadedTurnLatency.markPrefetchStarted(callId);
    createCallLogger(callId).debug({ event: "standard.prefetch.started", generationId, sessionIdPresent: Boolean(session), stableCharacterCount: stableText.length, intent, mode: "TENANT_SCOPED_READ_ONLY_RAG" }, "Stable partial retrieval prefetch started");
  }

  claimFinal(callId: string, finalText: string, turnId: number, generationId: string): PrefetchDecision {
    const entry = this.entries.get(callId);
    if (!entry) return "REFETCH";
    const decision = decisionFor(entry, finalText);
    if (decision !== "REUSE") {
      entry.controller.abort();
      this.entries.delete(callId);
      CascadedTurnLatency.markPrefetchDiscarded(callId);
      createCallLogger(callId).info({ event: "standard.prefetch.discarded", decision, generationId: entry.generationId, finalTurnId: turnId }, "Speculative RAG discarded for finalized query");
      return decision;
    }

    entry.turnId = turnId;
    entry.generationId = generationId;
    entry.claimed = true;
    CascadedTurnLatency.markPrefetchReused(callId);
    createCallLogger(callId).info({ event: "standard.prefetch.reused", generationId, sessionIdPresent: Boolean(entry.sessionId), tenantIdPresent: Boolean(entry.tenantId), turnId }, "Speculative RAG claimed by finalized Standard turn");
    return "REUSE";
  }

  /** Compatibility helper for local unit diagnostics; runtime uses claimFinal. */
  consumeFinal(callId: string, finalText: string): Pick<StandardPartialPrefetch, "intent"> | null {
    const entry = this.entries.get(callId);
    if (!entry || decisionFor(entry, finalText) !== "REUSE") {
      this.cancel(callId, "final_query_incompatible");
      return null;
    }
    this.entries.delete(callId);
    return { intent: entry.intent };
  }

  async takeReusableKnowledge(callId: string, finalText: string, generationId: string): Promise<RetrievedKnowledgeChunk[] | null> {
    const entry = this.entries.get(callId);
    if (!entry || !entry.claimed || entry.generationId !== generationId || decisionFor(entry, finalText) !== "REUSE") return null;
    try {
      const result = await entry.retrieval;
      if (entry.controller.signal.aborted || this.entries.get(callId) !== entry || entry.generationId !== generationId) return null;
      CascadedTurnLatency.markPrefetchReady(callId);
      createCallLogger(callId).debug({ event: "standard.prefetch.ready", generationId, retrievedChunkCount: result.length }, "Speculative RAG ready for finalized prompt");
      return result;
    } catch {
      return null;
    } finally {
      this.entries.delete(callId);
    }
  }

  cancel(callId: string, reason = "generation_invalidated"): void {
    const entry = this.entries.get(callId);
    if (!entry) return;
    entry.controller.abort();
    this.entries.delete(callId);
    CascadedTurnLatency.markPrefetchDiscarded(callId);
    createCallLogger(callId).info({ event: "standard.prefetch.cancelled", generationId: entry.generationId, reason }, "Speculative RAG cancelled");
  }

  clear(callId: string): void { this.cancel(callId, "call_closed"); }
}

export const StandardPartialPrefetch = new StandardPartialPrefetchService();
