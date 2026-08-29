import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { createCallLogger } from "@/lib/logger";
import { AudioSessionService } from "@/providers/telephony/audio-session.service";
import {
  buildStandardKnowledgeScopeFingerprint,
  resolveStandardKnowledgeScope,
} from "@/services/conversations/prompt-builder.service";
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
  scopeFingerprint: string | null;
  scopeFingerprintPromise: Promise<string>;
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

/** Ephemeral, scope-fingerprinted retrieval prefetch; it has no tool/mutation path. */
export class StandardPartialPrefetchService {
  private readonly entries = new Map<string, StandardPartialPrefetch>();
  private sequence = 0;

  public debounceDelayMs = 150;
  public maxPrefetchAttempts = 3;

  private readonly attempts = new Map<string, number>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastPrefetchedTexts = new Map<string, string>();

  observePartial(callId: string, text: string): void {
    const stableText = text.trim().replace(/\s+/g, " ");
    if (!STANDARD_REALTIME_CONFIG.speculativePrefetchEnabled || stableText.length < STANDARD_REALTIME_CONFIG.stablePartialMinCharacters) return;
    const normalizedText = normalize(stableText);

    // Clear any active debounce timer
    const existingTimer = this.debounceTimers.get(callId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(callId);
    }

    // Check maximum attempts limit
    const attemptsCount = this.attempts.get(callId) ?? 0;
    if (attemptsCount >= this.maxPrefetchAttempts) return;

    // Check for meaningful change
    const lastPrefetched = this.lastPrefetchedTexts.get(callId);
    if (lastPrefetched !== undefined) {
      if (lastPrefetched === normalizedText || !this.isMeaningfulChange(lastPrefetched, normalizedText)) {
        return;
      }
    }

    // Set debounce timer
    if (this.debounceDelayMs === 0) {
      this.executePrefetch(callId, stableText, normalizedText);
    } else {
      const timer = setTimeout(() => {
        this.debounceTimers.delete(callId);
        this.executePrefetch(callId, stableText, normalizedText);
      }, this.debounceDelayMs);
      this.debounceTimers.set(callId, timer);
    }
  }

  private executePrefetch(callId: string, stableText: string, normalizedText: string): void {
    const previous = this.entries.get(callId);
    previous?.controller.abort();

    // Increment attempts
    const currentAttempts = this.attempts.get(callId) ?? 0;
    this.attempts.set(callId, currentAttempts + 1);

    // Record last prefetched text
    this.lastPrefetchedTexts.set(callId, normalizedText);

    const controller = new AbortController();
    const session = AudioSessionService.getByCallId(callId);
    const generationId = `${callId}:prefetch:${++this.sequence}`;
    const intent = routeLocalIntent(stableText).type;
    const scopePromise = resolveStandardKnowledgeScope(callId);
    const scopeFingerprintPromise = scopePromise.then(scope =>
      buildStandardKnowledgeScopeFingerprint(scope)
    );
    const retrieval = scopePromise.then(async scope => {
      if (controller.signal.aborted) throw new DOMException("Prefetch aborted", "AbortError");
      const scopeFingerprint = await scopeFingerprintPromise;
      const entry = this.entries.get(callId);
      if (entry?.generationId === generationId) {
        entry.tenantId = scope.tenantId;
        entry.scopeFingerprint = scopeFingerprint;
      }
      return retrieveKnowledge(stableText, 4, { ...scope, callId, signal: controller.signal });
    });

    void retrieval.catch(() => undefined);
    this.entries.set(callId, {
      stableText,
      normalizedText,
      intent,
      callId,
      sessionId: session?.streamSid ?? null,
      turnId: null,
      generationId,
      tenantId: null,
      scopeFingerprint: null,
      scopeFingerprintPromise,
      controller,
      retrieval,
      claimed: false,
    });
    CascadedTurnLatency.markPrefetchStarted(callId);
    createCallLogger(callId).debug({ event: "standard.prefetch.started", generationId, sessionIdPresent: Boolean(session), stableCharacterCount: stableText.length, intent, mode: "TENANT_SCOPED_READ_ONLY_RAG" }, "Stable partial retrieval prefetch started");
  }

  private isMeaningfulChange(prev: string, curr: string): boolean {
    const prevWords = prev.split(/\s+/).filter(Boolean);
    const currWords = curr.split(/\s+/).filter(Boolean);
    return currWords.length > prevWords.length || (curr.length - prev.length) >= 3;
  }

  claimFinal(callId: string, finalText: string, turnId: number, generationId: string): PrefetchDecision {
    const existingTimer = this.debounceTimers.get(callId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(callId);
    }
    this.attempts.delete(callId);
    this.lastPrefetchedTexts.delete(callId);

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
    this.attempts.delete(callId);
    this.lastPrefetchedTexts.delete(callId);
    const existingTimer = this.debounceTimers.get(callId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(callId);
    }
    return { intent: entry.intent };
  }

  async takeReusableKnowledge(callId: string, finalText: string, generationId: string, scopeFingerprint: string): Promise<RetrievedKnowledgeChunk[] | null> {
    const entry = this.entries.get(callId);
    if (!entry || !entry.claimed || entry.generationId !== generationId || decisionFor(entry, finalText) !== "REUSE") return null;
    try {
      const speculativeFingerprint = entry.scopeFingerprint ?? await entry.scopeFingerprintPromise;
      if (speculativeFingerprint !== scopeFingerprint) return null;
      const result = await entry.retrieval;
      if (entry.controller.signal.aborted || this.entries.get(callId) !== entry || entry.generationId !== generationId) return null;
      CascadedTurnLatency.markPrefetchReady(callId);
      createCallLogger(callId).debug({ event: "standard.prefetch.ready", generationId, retrievedChunkCount: result.length }, "Speculative RAG ready for finalized prompt");
      return result;
    } catch {
      return null;
    } finally {
      this.entries.delete(callId);
      this.attempts.delete(callId);
      this.lastPrefetchedTexts.delete(callId);
      const existingTimer = this.debounceTimers.get(callId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        this.debounceTimers.delete(callId);
      }
    }
  }

  cancel(callId: string, reason = "generation_invalidated"): void {
    const existingTimer = this.debounceTimers.get(callId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debounceTimers.delete(callId);
    }
    this.attempts.delete(callId);
    this.lastPrefetchedTexts.delete(callId);

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
