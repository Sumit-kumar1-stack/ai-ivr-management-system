import {
  performance,
} from "node:perf_hooks";

import {
  createCallLogger,
} from "@/lib/logger";

import { StandardRuntimeUsage } from "./standard-runtime-usage.service";

export type CascadedFailureStage =
  | "STT"
  | "ROUTING"
  | "RAG"
  | "LLM"
  | "TTS"
  | "OUTPUT"
  | "ABORT";

export type CascadedRouteClassification =
  | "IVR_HANDLED"
  | "KNOWLEDGE"
  | "GENERAL_AI"
  | "ACTION"
  | "TRANSFER"
  | "END_CALL"
  | "UNKNOWN";

export interface CascadedCallContext {
  tenantId?: string | null;
  campaignId?: string | null;
  inboundProfileId?: string | null;
  fallbackUsed?: boolean;
}

export interface CascadedTurnLatencyEvent {
  event: "cascaded.turn.latency";
  runtime: "CASCADED";
  callId: string;
  turnId: number;
  generationId?: string;
  tenantId?: string;
  campaignId?: string;
  inboundProfileId?: string;
  fallbackUsed: boolean;
  success: boolean;
  failureStage: CascadedFailureStage | null;
  interrupted: boolean;
  routingPassCount: number;
  routingPasses: Array<{
    source: string;
    durationMs: number | null;
    classification: CascadedRouteClassification;
  }>;
  ragUsed: boolean;
  rerankUsed: boolean;
  candidateCount: number | null;
  llmProvider?: string;
  llmModel?: string;
  ttsProvider?: string;
  ttsModel?: string;
  ttsVoice?: string;
  markers: string[];
  standardMarkers: string[];
  speechEndToPrefetchReadyMs: number | null;
  speechEndToRagReadyMs: number | null;
  speechEndToLlmFirstTokenMs: number | null;
  speechEndToLlmFirstPhraseMs: number | null;
  speechEndToTtsFirstAudioMs: number | null;
  speechEndToProviderFirstAudioMs: number | null;
  totalTurnMs: number;
  speechEndToSttFinalMs: number | null;
  sttFinalToMergeCompleteMs: number | null;
  routingMs: number | null;
  queryRewriteMs: number | null;
  retrievalMs: number | null;
  rerankMs: number | null;
  ragTotalMs: number | null;
  llmFirstResponseMs: number | null;
  llmTotalMs: number | null;
  ttsFirstAudioMs: number | null;
  ttsTotalMs: number | null;
  firstAudioQueueDelayMs: number | null;
  speechEndToFirstAudioSentMs: number | null;
  speechEndToFinalTranscriptMs: number | null;
  speechEndToIntentMs: number | null;
  ragLatencyMs: number | null;
  llmFirstTokenMs: number | null;
  providerSubmissionMs: number | null;
  speechEndToFirstAudioMs: number | null;
  turnTotalMs: number;
}

interface TimingState {
  callId: string;
  turnId: number;
  generationId?: string;
  context: CascadedCallContext;
  startedAt: number;
  marks: Map<string, number>;
  routingPasses: Array<{
    source: string;
    startedAt: number;
    completedAt?: number;
    classification: CascadedRouteClassification;
  }>;
  ragUsed: boolean;
  rerankUsed: boolean;
  candidateCount: number | null;
  llm?: { provider: string; model: string };
  tts?: { provider: string; model: string; voice: string };
  interrupted: boolean;
}

interface PendingMarks {
  marks: Map<string, number>;
}

type EventSink = (event: CascadedTurnLatencyEvent) => void;

function duration(
  startedAt: number | undefined,
  completedAt: number | undefined
): number | null {
  if (
    startedAt === undefined ||
    completedAt === undefined
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(completedAt - startedAt)
  );
}

export class CascadedTurnLatencyService {
  private readonly calls = new Map<string, CascadedCallContext>();

  private readonly pendingMarks = new Map<string, PendingMarks>();

  private readonly activeTurns = new Map<string, TimingState>();

  /*
   * STT can fail after media has started but before the normal transcript
   * pipeline allocates a positive TurnCoordinator ID. Negative IDs keep that
   * failed caller attempt correlated without colliding with coordinator turns.
   */
  private readonly pendingFailureTurnCounters = new Map<string, number>();

  constructor(
    private readonly eventSink?: EventSink
  ) {}

  registerCall(
    callId: string,
    context: CascadedCallContext = {}
  ): void {
    this.calls.set(callId, context);
  }

  beginTurn(
    callId: string,
    turnId: number
  ): void {
    const context = this.calls.get(callId);

    if (!context) {
      return;
    }

    const now = performance.now();
    const pending = this.pendingMarks.get(callId);
    const marks = new Map(pending?.marks);

    marks.set("turnStarted", now);
    this.pendingMarks.delete(callId);
    this.activeTurns.set(callId, {
      callId,
      turnId,
      context,
      startedAt: now,
      marks,
      routingPasses: [],
      ragUsed: false,
      rerankUsed: false,
      candidateCount: null,
      interrupted: false,
    });
    StandardRuntimeUsage.begin(callId, turnId, context.tenantId);
    this.debug(callId, "standard.turn.started");
  }

  setGeneration(callId: string, generationId: string): void {
    const state = this.activeTurns.get(callId);
    if (state) state.generationId = generationId;
  }

  markAudioFirstReceived(callId: string): void {
    this.mark(callId, "audioFirstReceived");
    this.debug(callId, "standard.speech.started");
  }

  markSttPartial(callId: string): void {
    this.mark(callId, "sttPartialFirst");
    this.debug(callId, "standard.stt.first_partial");
  }

  markSttStablePartial(callId: string): void {
    this.mark(callId, "sttStablePartial");
    this.debug(callId, "standard.stt.stable_partial");
  }

  markSttFinal(callId: string): void {
    this.mark(callId, "speechEnd");
    this.mark(callId, "sttFinal");
    this.mark(callId, "transcriptFinalReceived");
    this.debug(callId, "standard.speech.ended");
    this.debug(callId, "standard.stt.final");
  }

  markPrefetchStarted(callId: string): void { this.mark(callId, "prefetchStarted"); this.debug(callId, "standard.prefetch.started"); }
  markPrefetchReady(callId: string): void { this.mark(callId, "prefetchReady"); this.debug(callId, "standard.prefetch.ready"); }
  markPrefetchReused(callId: string): void { this.mark(callId, "prefetchReused"); this.debug(callId, "standard.prefetch.reused"); }
  markPrefetchDiscarded(callId: string): void { this.mark(callId, "prefetchDiscarded"); this.debug(callId, "standard.prefetch.discarded"); }

  markMergeWindowStart(callId: string): void {
    this.mark(callId, "mergeWindowStart");
  }

  markMergeWindowComplete(callId: string): void {
    this.mark(callId, "mergeWindowComplete");
  }

  startRoutingPass(
    callId: string,
    source: string
  ): void {
    const state = this.activeTurns.get(callId);

    if (!state) {
      return;
    }

    this.mark(callId, "routingStart");
    state.routingPasses.push({
      source,
      startedAt: performance.now(),
      classification: "UNKNOWN",
    });
  }

  completeRoutingPass(
    callId: string,
    source: string,
    classification: CascadedRouteClassification = "UNKNOWN"
  ): void {
    const state = this.activeTurns.get(callId);

    if (!state) {
      return;
    }

    const pass = [...state.routingPasses]
      .reverse()
      .find(candidate =>
        candidate.source === source &&
        candidate.completedAt === undefined
      );

    if (pass) {
      pass.completedAt = performance.now();
      pass.classification = classification;
    }

    this.mark(callId, "routingComplete");
    this.debug(callId, "cascaded.routing.completed", {
      source,
      classification,
    });
  }

  startRag(callId: string): void {
    const state = this.activeTurns.get(callId);
    if (state) state.ragUsed = true;
    this.mark(callId, "ragStart");
    this.debug(callId, "standard.rag.started");
    StandardRuntimeUsage.recordRag(callId);
  }

  completeRag(callId: string): void {
    this.mark(callId, "ragComplete");
    this.debug(callId, "standard.rag.ready");
  }

  startQueryRewrite(callId: string): void {
    this.startRag(callId);
    this.mark(callId, "queryRewriteStart");
  }

  completeQueryRewrite(callId: string): void {
    this.mark(callId, "queryRewriteComplete");
  }

  startRetrieval(callId: string): void {
    this.startRag(callId);
    this.mark(callId, "retrievalStart");
  }

  completeRetrieval(
    callId: string,
    candidateCount: number
  ): void {
    const state = this.activeTurns.get(callId);
    if (state) state.candidateCount = candidateCount;
    this.mark(callId, "retrievalComplete");
    this.mark(callId, "contextReady");
  }

  startRerank(callId: string): void {
    const state = this.activeTurns.get(callId);
    if (state) state.rerankUsed = true;
    this.mark(callId, "rerankStart");
    StandardRuntimeUsage.recordReranker(callId);
  }

  completeRerank(callId: string): void {
    this.mark(callId, "rerankComplete");
  }

  startLlm(
    callId: string,
    provider: string,
    model: string
  ): void {
    const state = this.activeTurns.get(callId);
    if (state) state.llm = { provider, model };
    this.mark(callId, "llmRequestStart");
    this.debug(callId, "standard.llm.started");
    StandardRuntimeUsage.recordLlm(callId, provider, model);
  }

  markLlmFirstResponse(callId: string): void {
    this.mark(callId, "llmFirstResponse");
    this.debug(callId, "standard.llm.first_token");
  }

  markLlmFirstPhrase(callId: string): void { this.mark(callId, "llmFirstPhrase"); this.debug(callId, "standard.llm.first_phrase"); }

  completeLlm(callId: string): void {
    this.mark(callId, "llmComplete");
    this.debug(callId, "cascaded.llm.completed");
  }

  startTts(
    callId: string,
    provider: string,
    model: string,
    voice: string
  ): void {
    const state = this.activeTurns.get(callId);
    if (state) state.tts = { provider, model, voice };
    this.mark(callId, "ttsRequestStart");
    this.debug(callId, "standard.tts.started");
  }

  markTtsAudioReady(callId: string): void {
    this.mark(callId, "ttsFirstAudio");
    this.mark(callId, "ttsComplete");
    this.mark(callId, "audioReady");
    this.debug(callId, "standard.tts.first_audio");
  }

  markFirstAudioQueued(callId: string): void {
    this.mark(callId, "firstAudioQueued");
  }

  markFirstAudioSent(callId: string): void {
    const state = this.activeTurns.get(callId);
    if (!state) return;

    this.mark(callId, "firstAudioSent");
    this.debug(callId, "standard.provider.first_audio");
    this.emitAndClear(state, true, null);
  }

  fail(
    callId: string,
    failureStage: CascadedFailureStage
  ): void {
    let state:
      | TimingState
      | null
      | undefined =
      this.activeTurns.get(callId);

    if (!state) {
      state = this.createPendingFailureTurn(
        callId
      );
    }

    if (!state) return;
    this.emitAndClear(state, false, failureStage);
  }

  interrupt(callId: string): void {
    const state = this.activeTurns.get(callId);
    if (!state) return;

    state.interrupted = true;
    this.mark(callId, "interruptDetectedAt");
    this.mark(callId, "responseAudioStoppedAt");
    this.emitAndClear(state, false, null);
  }

  cleanupCall(callId: string): void {
    const state = this.activeTurns.get(callId);
    if (state) {
      this.emitAndClear(state, false, "ABORT");
    }

    this.pendingMarks.delete(callId);
    this.pendingFailureTurnCounters.delete(callId);
    this.calls.delete(callId);
  }

  getActiveTurnForTesting(
    callId: string
  ): { turnId: number } | null {
    const state = this.activeTurns.get(callId);
    return state ? { turnId: state.turnId } : null;
  }

  private mark(
    callId: string,
    name: string
  ): void {
    const state = this.activeTurns.get(callId);
    if (state) {
      if (!state.marks.has(name)) state.marks.set(name, performance.now());
      return;
    }

    if (!this.calls.has(callId)) return;

    const pending = this.pendingMarks.get(callId) ?? {
      marks: new Map<string, number>(),
    };

    if (!pending.marks.has(name)) pending.marks.set(name, performance.now());
    this.pendingMarks.set(callId, pending);
  }

  private createPendingFailureTurn(
    callId: string
  ): TimingState | null {
    const context = this.calls.get(callId);
    const pending = this.pendingMarks.get(callId);

    if (!context || !pending || pending.marks.size === 0) {
      return null;
    }

    const turnId =
      (this.pendingFailureTurnCounters.get(callId) ?? 0) - 1;

    this.pendingFailureTurnCounters.set(
      callId,
      turnId
    );

    const state: TimingState = {
      callId,
      turnId,
      context,
      startedAt: pending.marks.get("audioFirstReceived") ?? performance.now(),
      marks: new Map(pending.marks),
      routingPasses: [],
      ragUsed: false,
      rerankUsed: false,
      candidateCount: null,
      interrupted: false,
    };

    this.pendingMarks.delete(callId);
    this.activeTurns.set(callId, state);

    return state;
  }

  private emitAndClear(
    state: TimingState,
    success: boolean,
    failureStage: CascadedFailureStage | null
  ): void {
    if (this.activeTurns.get(state.callId)?.turnId !== state.turnId) return;

    const marks = state.marks;
    const routingPasses = state.routingPasses.map(pass => ({
      source: pass.source,
      durationMs: duration(pass.startedAt, pass.completedAt),
      classification: pass.classification,
    }));

    const event: CascadedTurnLatencyEvent = {
      event: "cascaded.turn.latency",
      runtime: "CASCADED",
      callId: state.callId,
      turnId: state.turnId,
      ...(state.generationId ? { generationId: state.generationId } : {}),
      ...(state.context.tenantId ? { tenantId: state.context.tenantId } : {}),
      ...(state.context.campaignId ? { campaignId: state.context.campaignId } : {}),
      ...(state.context.inboundProfileId ? { inboundProfileId: state.context.inboundProfileId } : {}),
      fallbackUsed: Boolean(state.context.fallbackUsed),
      success,
      failureStage,
      interrupted: state.interrupted,
      routingPassCount: routingPasses.length,
      routingPasses,
      ragUsed: state.ragUsed,
      rerankUsed: state.rerankUsed,
      candidateCount: state.candidateCount,
      ...(state.llm ? { llmProvider: state.llm.provider, llmModel: state.llm.model } : {}),
      ...(state.tts ? {
        ttsProvider: state.tts.provider,
        ttsModel: state.tts.model,
        ttsVoice: state.tts.voice,
      } : {}),
      markers: [...marks.keys()],
      standardMarkers: [...marks.keys()].map(marker => standardMarkerNames[marker] ?? marker).concat("standard.turn.completed"),
      speechEndToPrefetchReadyMs: duration(marks.get("speechEnd"), marks.get("prefetchReady")),
      speechEndToRagReadyMs: duration(marks.get("speechEnd"), marks.get("ragComplete")),
      speechEndToLlmFirstTokenMs: duration(marks.get("speechEnd"), marks.get("llmFirstResponse")),
      speechEndToLlmFirstPhraseMs: duration(marks.get("speechEnd"), marks.get("llmFirstPhrase")),
      speechEndToTtsFirstAudioMs: duration(marks.get("speechEnd"), marks.get("ttsFirstAudio")),
      speechEndToProviderFirstAudioMs: duration(marks.get("speechEnd"), marks.get("firstAudioSent")),
      totalTurnMs: Math.max(0, Math.round(performance.now() - state.startedAt)),
      speechEndToSttFinalMs: duration(marks.get("speechEnd"), marks.get("sttFinal")),
      sttFinalToMergeCompleteMs: duration(marks.get("sttFinal"), marks.get("mergeWindowComplete")),
      routingMs: duration(marks.get("routingStart"), marks.get("routingComplete")),
      queryRewriteMs: duration(marks.get("queryRewriteStart"), marks.get("queryRewriteComplete")),
      retrievalMs: duration(marks.get("retrievalStart"), marks.get("retrievalComplete")),
      rerankMs: duration(marks.get("rerankStart"), marks.get("rerankComplete")),
      ragTotalMs: duration(marks.get("ragStart"), marks.get("ragComplete")),
      llmFirstResponseMs: duration(marks.get("llmRequestStart"), marks.get("llmFirstResponse")),
      llmTotalMs: duration(marks.get("llmRequestStart"), marks.get("llmComplete")),
      ttsFirstAudioMs: duration(marks.get("ttsRequestStart"), marks.get("ttsFirstAudio")),
      ttsTotalMs: duration(marks.get("ttsRequestStart"), marks.get("ttsComplete")),
      firstAudioQueueDelayMs: duration(marks.get("firstAudioQueued"), marks.get("firstAudioSent")),
      speechEndToFirstAudioSentMs: duration(marks.get("speechEnd"), marks.get("firstAudioSent")),
      speechEndToFinalTranscriptMs: duration(marks.get("speechEnd"), marks.get("sttFinal")),
      speechEndToIntentMs: duration(marks.get("speechEnd"), marks.get("routingComplete")),
      ragLatencyMs: duration(marks.get("ragStart"), marks.get("ragComplete")),
      llmFirstTokenMs: duration(marks.get("llmRequestStart"), marks.get("llmFirstResponse")),
      providerSubmissionMs: duration(marks.get("firstAudioQueued"), marks.get("firstAudioSent")),
      speechEndToFirstAudioMs: duration(marks.get("speechEnd"), marks.get("firstAudioSent")),
      turnTotalMs: Math.max(0, Math.round(performance.now() - state.startedAt)),
    };

    this.activeTurns.delete(state.callId);
    if (this.eventSink) {
      this.eventSink(event);
    } else {
      const log = createCallLogger(state.callId);
      log.info(event, "Standard cascaded voice turn latency measured");
      log.info(
        { ...event, event: "standard.turn.completed" },
        "Canonical Standard turn trace completed"
      );
    }
  }

  private debug(
    callId: string,
    event: string,
    fields: Record<string, unknown> = {}
  ): void {
    if (!this.activeTurns.has(callId)) return;
    createCallLogger(callId).debug({ event, ...fields }, "Cascaded latency stage completed");
  }
}

export const CascadedTurnLatency =
  new CascadedTurnLatencyService();

const standardMarkerNames: Record<string, string> = {
  turnStarted: "standard.turn.started",
  audioFirstReceived: "standard.speech.started",
  speechEnd: "standard.speech.ended",
  sttPartialFirst: "standard.stt.first_partial",
  sttStablePartial: "standard.stt.stable_partial",
  sttFinal: "standard.stt.final",
  prefetchStarted: "standard.prefetch.started",
  prefetchReady: "standard.prefetch.ready",
  prefetchReused: "standard.prefetch.reused",
  prefetchDiscarded: "standard.prefetch.discarded",
  ragStart: "standard.rag.started",
  ragComplete: "standard.rag.ready",
  llmRequestStart: "standard.llm.started",
  llmFirstResponse: "standard.llm.first_token",
  llmFirstPhrase: "standard.llm.first_phrase",
  ttsRequestStart: "standard.tts.started",
  ttsFirstAudio: "standard.tts.first_audio",
  firstAudioSent: "standard.provider.first_audio",
};
