import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

import {
  askAIStream,
} from "@/services/ai/llm.factory";

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface RerankableKnowledgeChunk {
  content: string;
  score: number;
  documentId: string;
  chunkIndex: number;
  classification: string;
}

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "knowledge-reranker"
  );

//--------------------------------------------------
// Re-rank Knowledge
//--------------------------------------------------

export async function rerankKnowledge(
  question: string,
  chunks:
    RerankableKnowledgeChunk[],
  signal?: AbortSignal
): Promise<
  RerankableKnowledgeChunk[]
> {
  if (
    chunks.length ===
    0
  ) {
    return [];
  }

  const startedAt =
    process.hrtime.bigint();

  const candidates =
    chunks
      .map(
        (
          chunk,
          index
        ) => `
Candidate ${index + 1}

${chunk.content}
`
      )
      .join(
        "\n----------------------\n"
      );

  const prompt = `
You are an expert retrieval ranking system.

A user asked the following question:

"${question}"

Below are candidate knowledge chunks.

Your task is:

1. Select ONLY the chunks that actually answer the question.
2. Rank them from best to worst.
3. Return ONLY the candidate numbers.
4. Do NOT explain.

Example outputs:

1

or

1,2

or

2,5,7

========================

${candidates}

========================

Answer:
`;

  log.debug(
    {
      event:
        "knowledge.rerank.started",

      candidateCount:
        chunks.length,

      queryCharacterCount:
        question.length,

      promptCharacterCount:
        prompt.length,
    },
    "Knowledge reranking started"
  );

  try {
    let response = "";
    for await (const chunk of askAIStream(prompt, signal)) {
      if (signal?.aborted) {
        throw new DOMException("Knowledge reranking aborted", "AbortError");
      }
      response += chunk;
    }

    if (signal?.aborted) {
      throw new DOMException("Knowledge reranking aborted", "AbortError");
    }

    const indexes =
      parseCandidateIndexes(
        response,
        chunks.length
      );

    const reranked =
      indexes
        .map(
          index =>
            chunks[
              index -
                1
            ]
        )
        .filter(
          (
            chunk
          ): chunk is RerankableKnowledgeChunk =>
            Boolean(
              chunk
            )
        );

    log.info(
      {
        event:
          "knowledge.rerank.completed",

        candidateCount:
          chunks.length,

        selectedCandidateCount:
          reranked.length,

        responseCharacterCount:
          response.length,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Knowledge reranking completed"
    );

    return reranked;
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "knowledge.rerank.failed",

        candidateCount:
          chunks.length,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Knowledge reranking failed"
    );

    throw error;
  }
}

//--------------------------------------------------
// Parse Candidate Indexes
//--------------------------------------------------

function parseCandidateIndexes(
  response: string,
  candidateCount: number
): number[] {
  const indexes =
    response
      .split(
        /[,\s]+/
      )
      .map(
        value =>
          Number.parseInt(
            value.trim(),
            10
          )
      )
      .filter(
        value =>
          Number.isInteger(
            value
          ) &&
          value >=
            1 &&
          value <=
            candidateCount
      );

  return Array.from(
    new Set(
      indexes
    )
  );
}
