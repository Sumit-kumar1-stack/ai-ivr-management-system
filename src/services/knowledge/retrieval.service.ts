import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  Prisma,
  CallAuthenticationLevel,
} from "@prisma/client";

import {
  prisma,
} from "@/lib/prisma";

import {
  bm25Score,
} from "./bm25.service";

import {
  rerankKnowledge,
} from "./reranker.service";

import {
  CascadedTurnLatency,
} from "@/services/voice-runtime/cascaded-turn-latency.service";

import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { StandardRuntimeUsage } from "@/services/voice-runtime/standard-runtime-usage.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface RetrievedKnowledgeChunk {
  content: string;

  score: number;

  documentId: string;

  chunkIndex: number;

  classification:
    string;
}

interface ScoredKnowledgeChunk {
  content: string;

  score: number;

  documentId: string;

  chunkIndex: number;

  classification:
    string;
}

export type KnowledgeDocumentClassification =
  | "PUBLIC_PRODUCT_INFO"
  | "INTERNAL"
  | "CUSTOMER_PERSONAL"
  | "SENSITIVE"
  | "RESTRICTED";

export interface KnowledgeRetrievalOptions {
  knowledgeDocumentIds:
    string[];

  tenantId:
    string | null;

  ownerUserId?:
    string | null;

  callAuthenticationLevel?:
    CallAuthenticationLevel | null;

  callId?:
    string | null;

  /** Cancellation is advisory for database reads and hard for reranker streams. */
  signal?: AbortSignal;
}

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "knowledge-retrieval"
  );

//--------------------------------------------------
// Configuration
//--------------------------------------------------

const DEFAULT_RERANK_CANDIDATE_LIMIT =
  8;

const DEFAULT_MAX_SCAN_CHUNKS =
  5_000;

const DEFAULT_RERANK_TIMEOUT_MS =
  STANDARD_REALTIME_CONFIG.rerankerTimeoutMs;

const DEFAULT_DOMINANCE_RATIO =
  2.25;

//--------------------------------------------------
// Rerank Candidate Limit
//--------------------------------------------------

const configuredRerankCandidateLimit =
  Number(
    process.env
      .KNOWLEDGE_RERANK_CANDIDATE_LIMIT
  );

const RERANK_CANDIDATE_LIMIT =
  Number.isInteger(
    configuredRerankCandidateLimit
  ) &&
  configuredRerankCandidateLimit >=
    3 &&
  configuredRerankCandidateLimit <=
    20
    ? configuredRerankCandidateLimit
    : DEFAULT_RERANK_CANDIDATE_LIMIT;

//--------------------------------------------------
// Maximum App-side BM25 Scan
//--------------------------------------------------

const configuredMaxScanChunks =
  Number(
    process.env
      .KNOWLEDGE_MAX_SCAN_CHUNKS
  );

const MAX_SCAN_CHUNKS =
  Number.isInteger(
    configuredMaxScanChunks
  ) &&
  configuredMaxScanChunks >=
    100 &&
  configuredMaxScanChunks <=
    100_000
    ? configuredMaxScanChunks
    : DEFAULT_MAX_SCAN_CHUNKS;

//--------------------------------------------------
// Rerank Timeout
//--------------------------------------------------

const configuredRerankTimeoutMs =
  Number(
    process.env
      .KNOWLEDGE_RERANK_TIMEOUT_MS
  );

const RERANK_TIMEOUT_MS =
  Number.isInteger(
    configuredRerankTimeoutMs
  ) &&
  configuredRerankTimeoutMs >=
    250 &&
  configuredRerankTimeoutMs <=
    10_000
    ? configuredRerankTimeoutMs
    : DEFAULT_RERANK_TIMEOUT_MS;

//--------------------------------------------------
// Confidence Skip
//--------------------------------------------------

const ENABLE_CONFIDENCE_SKIP =
  process.env
    .KNOWLEDGE_CONFIDENCE_SKIP_RERANK ===
  "true";

const configuredDominanceRatio =
  Number(
    process.env
      .KNOWLEDGE_BM25_DOMINANCE_RATIO
  );

const BM25_DOMINANCE_RATIO =
  Number.isFinite(
    configuredDominanceRatio
  ) &&
  configuredDominanceRatio >=
    1.2 &&
  configuredDominanceRatio <=
    10
    ? configuredDominanceRatio
    : DEFAULT_DOMINANCE_RATIO;

//--------------------------------------------------
// Timeout Error
//--------------------------------------------------

class KnowledgeRerankTimeoutError
  extends Error {
  constructor(
    timeoutMs: number
  ) {
    super(
      `Knowledge reranking exceeded ${timeoutMs} ms`
    );

    this.name =
      "KnowledgeRerankTimeoutError";
  }
}

//--------------------------------------------------
// Rerank With Timeout
//--------------------------------------------------

export async function rerankWithTimeoutForTesting(
  question: string,
  candidates: ScoredKnowledgeChunk[],
  signal?: AbortSignal
): Promise<ScoredKnowledgeChunk[]> {
  if (signal?.aborted) {
    throw new DOMException("Knowledge reranking aborted", "AbortError");
  }

  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let rejectOnAbort: (() => void) | undefined;
  let timer:
    ReturnType<
      typeof setTimeout
    >
    | undefined;

  try {
    return await Promise.race([
      rerankKnowledge(question, candidates, controller.signal),

      new Promise<
        never
      >(
        (
          _resolve,
          reject
        ) => {
          rejectOnAbort = (): void => {
            reject(
              new DOMException(
                "Knowledge reranking aborted",
                "AbortError"
              )
            );
          };

          signal?.addEventListener(
            "abort",
            rejectOnAbort,
            { once: true }
          );
        }
      ),

      new Promise<
        never
      >(
        (
          _resolve,
          reject
        ) => {
          timer =
            setTimeout(
              () => {
                controller.abort();
                reject(
                  new KnowledgeRerankTimeoutError(
                    RERANK_TIMEOUT_MS
                  )
                );
              },
              RERANK_TIMEOUT_MS
            );
        }
      ),
    ]);
  } finally {
    if (
      timer
    ) {
      clearTimeout(
        timer
      );
    }
    controller.abort();
    signal?.removeEventListener("abort", abort);
    if (rejectOnAbort) {
      signal?.removeEventListener("abort", rejectOnAbort);
    }
  }
}

//--------------------------------------------------
// Convert Candidate
//--------------------------------------------------

function toResult(
  candidate: ScoredKnowledgeChunk
): RetrievedKnowledgeChunk {
  return {
    content:
      candidate.content,

    score:
      candidate.score,

    documentId:
      candidate.documentId,

    chunkIndex:
      candidate.chunkIndex,

    classification:
      candidate.classification,
  };
}

export function resolveAllowedKnowledgeClassifications(
  callAuthenticationLevel:
    CallAuthenticationLevel | null | undefined
): KnowledgeDocumentClassification[] {
  const level =
    callAuthenticationLevel ??
    "AUTH_LEVEL_0";

  switch (
    level
  ) {
    case "AUTH_LEVEL_3":
      return [
        "PUBLIC_PRODUCT_INFO",
        "INTERNAL",
        "CUSTOMER_PERSONAL",
        "SENSITIVE",
      ];

    case "AUTH_LEVEL_2":
      return [
        "PUBLIC_PRODUCT_INFO",
        "INTERNAL",
        "CUSTOMER_PERSONAL",
        "SENSITIVE",
      ];

    case "AUTH_LEVEL_1":
      return [
        "PUBLIC_PRODUCT_INFO",
        "INTERNAL",
        "CUSTOMER_PERSONAL",
      ];

    case "AUTH_LEVEL_0":
    default:
      return [
        "PUBLIC_PRODUCT_INFO",
        "INTERNAL",
      ];
  }
}

function isAbortError(
  error: unknown,
  signal?: AbortSignal
): boolean {
  return (
    signal?.aborted === true ||
    (
      error instanceof Error &&
      error.name === "AbortError"
    )
  );
}

//--------------------------------------------------
// BM25 Fallback
//--------------------------------------------------

function buildBm25Fallback(
  candidates: ScoredKnowledgeChunk[],
  limit: number
): RetrievedKnowledgeChunk[] {
  return candidates
    .slice(
      0,
      limit
    )
    .map(
      toResult
    );
}

//--------------------------------------------------
// Confidence Gate
//--------------------------------------------------

function canSkipReranking(
  candidates: ScoredKnowledgeChunk[]
): boolean {
  if (
    !ENABLE_CONFIDENCE_SKIP
  ) {
    return false;
  }

  if (
    candidates.length <
    2
  ) {
    return true;
  }

  const first =
    candidates[0];

  const second =
    candidates[1];

  if (
    !first ||
    !second
  ) {
    return false;
  }

  if (
    !Number.isFinite(
      first.score
    ) ||
    !Number.isFinite(
      second.score
    ) ||
    first.score <=
      0 ||
    second.score <=
      0
  ) {
    return false;
  }

  return (
    first.score /
      second.score >=
    BM25_DOMINANCE_RATIO
  );
}

//--------------------------------------------------
// Retrieve Knowledge
//--------------------------------------------------

export async function retrieveKnowledge(
  question: string,
  limit = 5,
  options: KnowledgeRetrievalOptions
): Promise<
  RetrievedKnowledgeChunk[]
> {
  const startedAt =
    process.hrtime.bigint();

  const throwIfAborted = (): void => {
    if (options.signal?.aborted) throw new DOMException("Knowledge retrieval aborted", "AbortError");
  };

  throwIfAborted();

  const normalizedQuestion =
    question.trim();

  //------------------------------------------------
  // Empty Query
  //------------------------------------------------

  if (
    !normalizedQuestion
  ) {
    log.debug(
      {
        event:
          "knowledge.retrieval.skipped",

        reason:
          "empty_question",
      },
      "Knowledge retrieval skipped"
    );

    return [];
  }

  //------------------------------------------------
  // Normalize Result Limit
  //------------------------------------------------

  const normalizedLimit =
    Math.max(
      1,
      Math.min(
        limit,
        20
      )
    );

  const scopedDocumentIds =
    options.knowledgeDocumentIds
      .map(
        documentId =>
          documentId.trim()
      )
      .filter(Boolean);

  const ownerUserId =
    options.ownerUserId
      ?.trim() ?? "";

  const tenantId =
    options.tenantId
      ?.trim() ?? "";

  const allowedClassifications =
    resolveAllowedKnowledgeClassifications(
      options.callAuthenticationLevel
    );

  const allowedClassificationParameters =
    allowedClassifications.map(
      classification =>
        Prisma.sql`${classification}::"KnowledgeDocumentClassification"`
    );

  const callId =
    options.callId?.trim() ??
    "";

  if (
    scopedDocumentIds.length ===
    0 ||
    !tenantId
  ) {
    log.info(
      {
        event:
          "knowledge.retrieval.no_scope_documents",

        queryCharacterCount:
          normalizedQuestion.length,

        ownerUserIdPresent:
          Boolean(
            ownerUserId
          ),

        tenantIdPresent:
          Boolean(
            tenantId
          ),
      },
      "Knowledge retrieval skipped because the secure knowledge scope is empty"
    );

    return [];
  }

  const ownerFilter =
    ownerUserId
      ? Prisma.sql`AND kd."ownerUserId" = ${ownerUserId}`
      : Prisma.empty;

  if (
    callId
  ) {
    void EventPublisher.publish(
      AppEvent.RAG_QUERY,
      {
        callId,

        queryCharacterCount:
          normalizedQuestion.length,

        scopedDocumentCount:
          scopedDocumentIds.length,

        allowedClassificationCount:
          allowedClassifications.length,

        actorType:
          "AI",

        timestamp:
          Date.now(),
      }
    );
  }

  try {
    //------------------------------------------------
    // Count Before Scan
    //------------------------------------------------

    const chunkCountResult =
      await prisma.$queryRaw<
        Array<{
          count: bigint;
        }>
      >`
        SELECT COUNT(*)::bigint AS count
        FROM "KnowledgeChunk" kc
        INNER JOIN "KnowledgeDocument" kd
          ON kd.id = kc."documentId"
        INNER JOIN "User" ku
          ON ku.id = kd."ownerUserId"
        WHERE kc."documentId" IN (${Prisma.join(
          scopedDocumentIds
        )})
          AND ku."tenantId" = ${tenantId}
          ${ownerFilter}
          AND kd."classification" IN (${Prisma.join(
            allowedClassificationParameters
          )})
      `;

    const chunkCount =
      Number(
        chunkCountResult[0]?.count ??
        0
      );

    //------------------------------------------------
    // Production Guard
    //------------------------------------------------

    if (
      chunkCount >
      MAX_SCAN_CHUNKS
    ) {
      log.error(
        {
          event:
            "knowledge.retrieval.scan_limit_exceeded",

          availableChunkCount:
            chunkCount,

          maximumScanChunks:
            MAX_SCAN_CHUNKS,

          queryCharacterCount:
            normalizedQuestion.length,
        },
        "Knowledge base exceeds safe in-process BM25 scan limit"
      );

      throw new Error(
        "Knowledge base is too large for the current retrieval engine. Indexed retrieval is required."
      );
    }

    //------------------------------------------------
    // Load Minimum Required Fields
    //------------------------------------------------

    const chunks =
      await prisma.$queryRaw<
        Array<{
          content: string;
          documentId: string;
          chunkIndex: number;
          classification:
            KnowledgeDocumentClassification;
        }>
      >`
        SELECT
          kc."content",
          kc."documentId",
          kc."chunkIndex",
          kd."classification"
        FROM "KnowledgeChunk" kc
        INNER JOIN "KnowledgeDocument" kd
          ON kd.id = kc."documentId"
        INNER JOIN "User" ku
          ON ku.id = kd."ownerUserId"
        WHERE kc."documentId" IN (${Prisma.join(
          scopedDocumentIds
        )})
          AND ku."tenantId" = ${tenantId}
          ${ownerFilter}
          AND kd."classification" IN (${Prisma.join(
            allowedClassificationParameters
          )})
        ORDER BY
          kc."documentId" ASC,
          kc."chunkIndex" ASC
      `;

    throwIfAborted();

    log.debug(
      {
        event:
          "knowledge.retrieval.started",

        queryCharacterCount:
          normalizedQuestion.length,

        availableChunkCount:
          chunkCount,

        scopedDocumentCount:
          scopedDocumentIds.length,

        loadedChunkCount:
          chunks.length,

        ownerUserIdPresent:
          true,

        allowedClassificationCount:
          allowedClassifications.length,

        requestedLimit:
          normalizedLimit,

        maximumScanChunks:
          MAX_SCAN_CHUNKS,

        rerankCandidateLimit:
          RERANK_CANDIDATE_LIMIT,

        rerankTimeoutMs:
          RERANK_TIMEOUT_MS,

        confidenceSkipEnabled:
          ENABLE_CONFIDENCE_SKIP,
      },
      "Knowledge retrieval started"
    );

    //------------------------------------------------
    // BM25
    //------------------------------------------------

    const bm25StartedAt =
      process.hrtime.bigint();

    const scored:
      ScoredKnowledgeChunk[] =
      chunks
        .map(
          chunk => ({
            content:
              chunk.content,

            documentId:
              chunk.documentId,

            chunkIndex:
              chunk.chunkIndex,

            classification:
              chunk.classification,

            score:
              bm25Score(
                normalizedQuestion,
                chunk.content
              ),
          })
        )
        .filter(
          chunk =>
            Number.isFinite(
              chunk.score
            ) &&
            chunk.score >
              0
        )
        .sort(
          (
            first,
            second
          ) =>
            second.score -
            first.score
        );

    const bm25Ms =
      getDurationMs(
        bm25StartedAt
      );

    log.debug(
      {
        event:
          "knowledge.retrieval.bm25_completed",

        candidateCount:
          scored.length,

        highestScore:
          scored[0]?.score ??
          null,

        secondHighestScore:
          scored[1]?.score ??
          null,

        bm25Ms,
      },
      "BM25 knowledge search completed"
    );

    throwIfAborted();

    //------------------------------------------------
    // No Candidate
    //------------------------------------------------

    if (
      scored.length ===
      0
    ) {
      log.info(
        {
          event:
            "knowledge.retrieval.no_candidates",

          bm25Ms,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "No relevant BM25 candidates found"
      );

      return [];
    }

    //------------------------------------------------
    // Single Candidate
    //------------------------------------------------

    if (
      scored.length ===
      1
    ) {
      log.info(
        {
          event:
            "knowledge.retrieval.rerank_skipped",

          reason:
            "single_candidate",

          bm25Ms,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Knowledge reranking skipped"
      );

      return [
        toResult(
          scored[0]
        ),
      ];
    }

    //------------------------------------------------
    // Bound Reranker Input
    //------------------------------------------------

    const rerankCandidates =
      scored.slice(
        0,
        RERANK_CANDIDATE_LIMIT
      );

    //------------------------------------------------
    // Confidence Fast Path
    //------------------------------------------------

    if (
      canSkipReranking(
        rerankCandidates
      )
    ) {
      const results =
        buildBm25Fallback(
          rerankCandidates,
          normalizedLimit
        );

      log.info(
        {
          event:
            "knowledge.retrieval.rerank_skipped",

          reason:
            "high_bm25_confidence",

          returnedChunkCount:
            results.length,

          bm25Ms,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "High-confidence BM25 result used"
      );

      return results;
    }

    //------------------------------------------------
    // AI Reranking With Latency Budget
    //------------------------------------------------

    const rerankStartedAt =
      process.hrtime.bigint();

    CascadedTurnLatency.startRerank(
      callId
    );

    let reranked:
      ScoredKnowledgeChunk[];

    let rerankFallbackUsed =
      false;

    let rerankFallbackReason:
      string | null =
      null;

    try {
      reranked =
        await rerankWithTimeoutForTesting(
          normalizedQuestion,
          rerankCandidates,
          options.signal
        );
    } catch (
      error
    ) {
      if (isAbortError(error, options.signal)) {
        throw error;
      }

      rerankFallbackUsed =
        true;

      rerankFallbackReason =
        error instanceof
          KnowledgeRerankTimeoutError
          ? "timeout"
          : "reranker_error";

      if (rerankFallbackReason === "timeout") {
        StandardRuntimeUsage.recordRerankerTimeout(callId);
      }

      log.warn(
        {
          event: rerankFallbackReason === "timeout"
            ? "standard.reranker.timeout"
            : "standard.reranker.cancelled",
          candidateCount: rerankCandidates.length,
          rerankTimeoutMs: RERANK_TIMEOUT_MS,
        },
        "Standard reranker result discarded; BM25 fallback retained"
      );

      log.warn(
        {
          event:
            "knowledge.retrieval.rerank_fallback",

          reason:
            rerankFallbackReason,

          rerankTimeoutMs:
            RERANK_TIMEOUT_MS,

          candidateCount:
            rerankCandidates.length,

          error:
            normalizeError(
              error
            ),
        },
        "AI reranking unavailable; falling back to BM25 ordering"
      );

      /*
       * Important:
       *
       * A reranker failure must not make the phone
       * call fail when deterministic retrieval still
       * produced useful candidates.
       */
      reranked =
        rerankCandidates;
    }

    const rerankMs =
      getDurationMs(
        rerankStartedAt
      );

    CascadedTurnLatency.completeRerank(
      callId
    );

    //------------------------------------------------
    // Results
    //------------------------------------------------

    const results =
      reranked
        .slice(
          0,
          normalizedLimit
        )
        .map(
          toResult
        );

    throwIfAborted();

    if (
      callId &&
      results.length > 0
    ) {
      void EventPublisher.publish(
        AppEvent.DOCUMENT_ACCESSED,
        {
          callId,

          documentIds:
            [
              ...new Set(
                results.map(
                  result =>
                    result.documentId
                )
              ),
            ],

          retrievedChunkCount:
            results.length,

          actorType:
            "AI",

          timestamp:
            Date.now(),
        }
      );
    }

    //------------------------------------------------
    // Final Metrics
    //------------------------------------------------

    log.info(
      {
        event:
          "knowledge.retrieval.completed",

        bm25CandidateCount:
          scored.length,

        rerankCandidateCount:
          rerankCandidates.length,

        returnedChunkCount:
          results.length,

        rerankFallbackUsed,

        rerankFallbackReason,

        bm25Ms,

        rerankMs,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Knowledge retrieval completed"
    );

    return results;
  } catch (
    error
  ) {
    if (isAbortError(error, options.signal)) {
      log.info(
        {
          event:
            "knowledge.retrieval.cancelled",

          queryCharacterCount:
            normalizedQuestion.length,

          durationMs:
            getDurationMs(
              startedAt
            ),
        },
        "Knowledge retrieval cancelled"
      );

      throw error;
    }

    log.error(
      {
        event:
          "knowledge.retrieval.failed",

        queryCharacterCount:
          normalizedQuestion.length,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Knowledge retrieval failed"
    );

    throw error;
  }
}
