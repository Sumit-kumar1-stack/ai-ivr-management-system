import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CascadedTurnLatencyService,
  type CascadedTurnLatencyEvent,
} from "@/services/voice-runtime/cascaded-turn-latency.service";

function createService(): {
  service: CascadedTurnLatencyService;
  events: CascadedTurnLatencyEvent[];
} {
  const events: CascadedTurnLatencyEvent[] = [];
  const service = new CascadedTurnLatencyService(event => events.push(event));
  service.registerCall("call-1", {
    tenantId: "tenant-1",
    campaignId: "campaign-1",
  });
  return { service, events };
}

function beginTurn(service: CascadedTurnLatencyService, turnId = 1): void {
  service.markAudioFirstReceived("call-1");
  service.markSttPartial("call-1");
  service.markSttFinal("call-1");
  service.markMergeWindowStart("call-1");
  service.beginTurn("call-1", turnId);
  service.markMergeWindowComplete("call-1");
}

function completeSuccessfulTurn(service: CascadedTurnLatencyService): void {
  service.startRoutingPass("call-1", "routeLiveTurn");
  service.completeRoutingPass("call-1", "routeLiveTurn", "GENERAL_AI");
  service.startLlm("call-1", "GEMINI", "gemini-test");
  service.markLlmFirstResponse("call-1");
  service.completeLlm("call-1");
  service.startTts("call-1", "GEMINI", "gemini-tts-test", "Kore");
  service.markTtsAudioReady("call-1");
  service.markFirstAudioQueued("call-1");
  service.markFirstAudioSent("call-1");
}

describe("CascadedTurnLatencyService", () => {
  it("assigns one stable turnId to a caller turn", () => {
    const { service, events } = createService();
    beginTurn(service, 7);
    completeSuccessfulTurn(service);

    expect(events).toHaveLength(1);
    expect(events[0]?.turnId).toBe(7);
  });

  it("keeps the generation identifier on the canonical trace", () => {
    const { service, events } = createService();
    beginTurn(service, 7);
    service.setGeneration("call-1", "call-1:7");
    completeSuccessfulTurn(service);

    expect(events[0]).toMatchObject({ generationId: "call-1:7" });
  });

  it("keeps all final stage metrics correlated to the same turn", () => {
    const { service, events } = createService();
    beginTurn(service, 3);
    completeSuccessfulTurn(service);

    expect(events[0]).toMatchObject({
      callId: "call-1",
      turnId: 3,
      runtime: "CASCADED",
      routingPassCount: 1,
      llmProvider: "GEMINI",
      ttsProvider: "GEMINI",
    });
  });

  it("reports only non-negative measured durations", () => {
    const { service, events } = createService();
    beginTurn(service);
    completeSuccessfulTurn(service);

    for (const value of Object.values(events[0] ?? {})) {
      if (typeof value === "number") expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("emits one final latency event after the first Twilio audio send", () => {
    const { service, events } = createService();
    beginTurn(service);
    completeSuccessfulTurn(service);

    expect(events[0]).toMatchObject({ success: true, failureStage: null });
    expect(events[0]?.speechEndToFirstAudioSentMs).not.toBeNull();
  });

  it("emits available timings for an STT failure", () => {
    const { service, events } = createService();
    service.markAudioFirstReceived("call-1");
    service.markSttPartial("call-1");
    service.fail("call-1", "STT");

    expect(events[0]).toMatchObject({ success: false, failureStage: "STT" });
    expect(events[0]?.turnId).toBe(-1);
  });

  it("emits available timings for an LLM failure", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.startLlm("call-1", "GEMINI", "gemini-test");
    service.fail("call-1", "LLM");

    expect(events[0]).toMatchObject({ success: false, failureStage: "LLM" });
  });

  it("emits available timings for a TTS failure", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.startTts("call-1", "GEMINI", "gemini-tts-test", "Kore");
    service.fail("call-1", "TTS");

    expect(events[0]).toMatchObject({ success: false, failureStage: "TTS" });
  });

  it("keeps missing stages null instead of inventing zero durations", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.markFirstAudioSent("call-1");

    expect(events[0]?.llmTotalMs).toBeNull();
    expect(events[0]?.ragTotalMs).toBeNull();
  });

  it("records Knowledge and retrieval metrics only when RAG is used", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.startRag("call-1");
    service.startQueryRewrite("call-1");
    service.completeQueryRewrite("call-1");
    service.startRetrieval("call-1");
    service.completeRetrieval("call-1", 4);
    service.startRerank("call-1");
    service.completeRerank("call-1");
    service.completeRag("call-1");
    service.markFirstAudioSent("call-1");

    expect(events[0]).toMatchObject({ ragUsed: true, rerankUsed: true, candidateCount: 4 });
    expect(events[0]?.retrievalMs).not.toBeNull();
  });

  it("does not add fake RAG timings to non-Knowledge turns", () => {
    const { service, events } = createService();
    beginTurn(service);
    completeSuccessfulTurn(service);

    expect(events[0]).toMatchObject({ ragUsed: false, rerankUsed: false });
    expect(events[0]?.retrievalMs).toBeNull();
  });

  it("records a single routing pass", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.startRoutingPass("call-1", "routeLiveTurn");
    service.completeRoutingPass("call-1", "routeLiveTurn", "IVR_HANDLED");
    service.markFirstAudioSent("call-1");

    expect(events[0]?.routingPassCount).toBe(1);
  });

  it("records multiple routing passes without hiding their sources", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.startRoutingPass("call-1", "routeLiveTurn");
    service.completeRoutingPass("call-1", "routeLiveTurn");
    service.startRoutingPass("call-1", "routeVoiceThroughIVR");
    service.completeRoutingPass("call-1", "routeVoiceThroughIVR", "GENERAL_AI");
    service.markFirstAudioSent("call-1");

    expect(events[0]?.routingPassCount).toBe(2);
    expect(events[0]?.routingPasses.map(pass => pass.source)).toEqual([
      "routeLiveTurn",
      "routeVoiceThroughIVR",
    ]);
  });

  it("records an interruption without classifying it as a provider failure", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.interrupt("call-1");

    expect(events[0]).toMatchObject({ interrupted: true, failureStage: null });
  });

  it("does not include caller transcript text in final metrics", () => {
    const { service, events } = createService();
    beginTurn(service);
    completeSuccessfulTurn(service);

    expect(JSON.stringify(events[0])).not.toContain("secret caller transcript");
  });

  it("does not include Knowledge text in final metrics", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.startRag("call-1");
    service.completeRetrieval("call-1", 2);
    service.completeRag("call-1");
    service.markFirstAudioSent("call-1");

    expect(JSON.stringify(events[0])).not.toContain("private document contents");
  });

  it("does not include provider secrets in final metrics", () => {
    const { service, events } = createService();
    beginTurn(service);
    completeSuccessfulTurn(service);

    expect(JSON.stringify(events[0])).not.toContain("api-key-secret");
  });

  it("exposes the Standard-compatible latency aliases without transcript content", () => {
    const { service, events } = createService();
    beginTurn(service);
    completeSuccessfulTurn(service);

    expect(events[0]).toHaveProperty("speechEndToFinalTranscriptMs");
    expect(events[0]).toHaveProperty("speechEndToFirstAudioMs");
    expect(events[0]).toHaveProperty("speechEndToLlmFirstTokenMs");
    expect(events[0]).toHaveProperty("speechEndToProviderFirstAudioMs");
    expect(events[0]?.markers).toEqual(expect.arrayContaining([
      "turnStarted", "sttPartialFirst", "speechEnd", "sttFinal",
      "llmRequestStart", "llmFirstResponse", "ttsRequestStart", "ttsFirstAudio", "firstAudioSent",
    ]));
    expect(JSON.stringify(events[0])).not.toContain("caller transcript");
  });

  it("cleans timing state after a terminal turn event", () => {
    const { service } = createService();
    beginTurn(service, 11);
    service.markFirstAudioSent("call-1");

    expect(service.getActiveTurnForTesting("call-1")).toBeNull();
  });

  it("leaves optional derived metrics null when their source marker is absent", () => {
    const { service, events } = createService();
    beginTurn(service);
    service.markFirstAudioSent("call-1");
    expect(events[0]).toMatchObject({
      speechEndToPrefetchReadyMs: null,
      speechEndToRagReadyMs: null,
      speechEndToLlmFirstTokenMs: null,
      speechEndToProviderFirstAudioMs: expect.any(Number),
    });
  });

  it("records optional speculative markers only when the prefetch path runs", () => {
    const { service, events } = createService();
    service.markPrefetchStarted("call-1");
    service.markPrefetchReady("call-1");
    beginTurn(service);
    service.markFirstAudioSent("call-1");
    expect(events[0]?.markers).toEqual(expect.arrayContaining(["prefetchStarted", "prefetchReady"]));
  });

  it("emits ABORT and cleans timing state on call termination", () => {
    const { service, events } = createService();
    beginTurn(service, 12);
    service.cleanupCall("call-1");

    expect(events[0]).toMatchObject({ success: false, failureStage: "ABORT" });
    expect(service.getActiveTurnForTesting("call-1")).toBeNull();
  });
});
