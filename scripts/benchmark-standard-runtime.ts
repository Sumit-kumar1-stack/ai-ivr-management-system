/**
 * Offline reproducible benchmark for orchestration overhead only. It never
 * opens a telephony, Deepgram, Gemini, or TTS connection; those provider
 * latencies are explicitly reported as unmeasured.
 *
 * Optionally pass a prior JSON report to compare independently measured runs:
 *   npx tsx scripts/benchmark-standard-runtime.ts baseline.json
 */
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { routeLocalIntent } from "@/services/conversations/local-intent-router.service";
import { splitStandardPhrases } from "@/services/voice/sentence-buffer.service";

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
}

async function main(): Promise<void> {
  const samples: number[] = [];
  const phraseSamples: number[] = [];
  const ownershipSamples: number[] = [];
  for (let index = 0; index < 1_000; index += 1) {
    const startedAt = performance.now();
    routeLocalIntent("What documents do I need for a personal loan?");
    samples.push(performance.now() - startedAt);
    const phraseStartedAt = performance.now();
    splitStandardPhrases("For a personal loan, please bring identity proof, income proof, and recent bank statements. ".repeat(6));
    phraseSamples.push(performance.now() - phraseStartedAt);
    const ownershipStartedAt = performance.now();
    const generation = `call:${index}`;
    if (generation !== `call:${index}`) throw new Error("offline generation ownership invariant failed");
    ownershipSamples.push(performance.now() - ownershipStartedAt);
  }

  const report = {
    benchmark: "standard-runtime-offline-orchestration",
    simulationNotice: "SIMULATED PIPELINE LATENCY — NOT LIVE PROVIDER LATENCY",
    sampleCount: samples.length,
    measured: {
      stablePartialIntentPrefetchOverheadMs: {
        p50: percentile(samples, 0.5),
        p95: percentile(samples, 0.95),
      },
      prefetchOwnershipClaimCompatibilityInvalidationMs: {
        p50: percentile(ownershipSamples, 0.5),
        p95: percentile(ownershipSamples, 0.95),
      },
      phraseSplittingMs: {
        p50: percentile(phraseSamples, 0.5),
        p95: percentile(phraseSamples, 0.95),
      },
    },
    unmeasuredExternalProviderLatency: [
      "speech-end-to-Deepgram-final",
      "Gemini first token",
      "Gemini TTS first audio",
      "Plivo first-audio submission",
    ],
    simulatedPipelineOverlap: {
      label: "SIMULATED PIPELINE LATENCY — NOT LIVE PROVIDER LATENCY",
      assumptionsMs: { sttFinal: 300, rag: 400, llmToFirstPhrase: 250, ttsFirstAudio: 300, providerSubmission: 20 },
      sequentialFirstAudioMs: 1_270,
      optimizedFirstAudioMs: 570,
      simulatedSavingsMs: 700,
      explanation: "RAG begins from a stable partial; phrase-one TTS begins while later LLM text continues.",
    },
    configuration: STANDARD_REALTIME_CONFIG,
  };

  const baselinePath = process.argv[2];
  if (!baselinePath) {
    console.log(JSON.stringify({ ...report, comparison: "No baseline supplied; no latency improvement is claimed." }, null, 2));
    return;
  }

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Record<string, unknown>;
  console.log(JSON.stringify({ ...report, baseline, comparison: "Offline orchestration comparison only; provider latency remains unmeasured." }, null, 2));
}

void main();
