import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  askAI,
} from "@/services/ai/llm.factory";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "query-rewriter"
  );

//--------------------------------------------------
// Rewrite Query
//--------------------------------------------------

export async function rewriteQuery(
  history: string,
  question: string,
  signal?: AbortSignal
): Promise<string> {
  const throwIfAborted = (): void => {
    if (signal?.aborted) {
      throw new DOMException("Knowledge query rewrite aborted", "AbortError");
    }
  };

  throwIfAborted();

  const normalizedQuestion =
    question.trim();

  const normalizedHistory =
    history.trim();

  //------------------------------------------------
  // Safety fallback
  //------------------------------------------------

  if (
    !normalizedQuestion
  ) {
    return "";
  }

  //------------------------------------------------
  // Query rewrite skipped if query is self-contained (Task 5)
  //------------------------------------------------

  if (isSelfContainedQuery(normalizedQuestion)) {
    log.info(
      {
        event: "knowledge.query_rewrite.skipped",
        reason: "fast_path",
        questionCharacterCount: normalizedQuestion.length,
      },
      "Query rewriting skipped (fast path)"
    );
    return normalizedQuestion;
  }

  //------------------------------------------------
  // No history means nothing needs resolving
  //------------------------------------------------

  if (
    !normalizedHistory
  ) {
    log.debug(
      {
        event:
          "knowledge.query_rewrite.skipped",

        reason:
          "no_conversation_history",

        questionCharacterCount:
          normalizedQuestion.length,
      },
      "Query rewriting skipped"
    );

    return normalizedQuestion;
  }

  //------------------------------------------------
  // Rewrite only when caller's wording genuinely
  // depends on previous conversation context.
  //------------------------------------------------

  const prompt =
    `
You convert a contextual customer follow-up into a standalone knowledge-search query.

Conversation:

${normalizedHistory}

Latest customer question:

${normalizedQuestion}

Resolve references such as:
- it
- its
- this
- that
- they
- what about
- how about
- previous subject

Return only one concise standalone search query.

Do not answer the question.
Do not add facts that are not present in the conversation.
`.trim();

  log.debug(
    {
      event:
        "knowledge.query_rewrite.started",

      questionCharacterCount:
        normalizedQuestion.length,

      historyCharacterCount:
        normalizedHistory.length,

      promptCharacterCount:
        prompt.length,
    },
    "Contextual query rewriting started"
  );

  const controller = new AbortController();
  const abort = (): void => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const rewritten = await Promise.race([
      askAI(prompt, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new QueryRewriteTimeoutError(QUERY_REWRITE_TIMEOUT_MS));
        }, QUERY_REWRITE_TIMEOUT_MS);
      })
    ]);

    throwIfAborted();

    const result = rewritten.trim() || normalizedQuestion;

    log.info(
      {
        event:
          "knowledge.query_rewrite.completed",

        originalCharacterCount:
          normalizedQuestion.length,

        rewrittenCharacterCount:
          result.length,

        fallbackUsed:
          !rewritten,
      },
      "Contextual query rewriting completed"
    );

    return result;
  } catch (
    error
  ) {
    if (
      signal?.aborted ||
      (
        error instanceof Error &&
        error.name === "AbortError"
      )
    ) {
      log.info(
        {
          event:
            "knowledge.query_rewrite.cancelled",

          questionCharacterCount:
            normalizedQuestion.length,

          historyCharacterCount:
            normalizedHistory.length,
        },
        "Contextual query rewriting cancelled"
      );

      throw error;
    }

    if (error instanceof QueryRewriteTimeoutError) {
      log.warn(
        {
          event: "knowledge.query_rewrite.timeout",
          timeoutMs: QUERY_REWRITE_TIMEOUT_MS,
          questionCharacterCount: normalizedQuestion.length,
        },
        "Contextual query rewriting timed out; falling back to original query"
      );
    } else {
      log.error(
        {
          event:
            "knowledge.query_rewrite.failed",

          questionCharacterCount:
            normalizedQuestion.length,

          historyCharacterCount:
            normalizedHistory.length,

          error:
            normalizeError(
              error
            ),
        },
        "Contextual query rewriting failed; original question will be used"
      );
    }

    return normalizedQuestion;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    controller.abort();
    signal?.removeEventListener("abort", abort);
  }
}

//--------------------------------------------------
// Task 5 Helpers
//--------------------------------------------------

const QUERY_REWRITE_TIMEOUT_MS = Number(process.env.KNOWLEDGE_QUERY_REWRITE_TIMEOUT_MS ?? 1500);

class QueryRewriteTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Query rewrite exceeded ${timeoutMs} ms`);
    this.name = "QueryRewriteTimeoutError";
  }
}

function isSelfContainedQuery(query: string): boolean {
  const q = query.trim().toLowerCase();

  // Very short queries are likely ambiguous/context-dependent
  if (q.split(/\s+/).length < 4) {
    return false;
  }

  // Check for ambiguous pronouns, demonstratives, or relative terms
  // that refer back to previous context.
  const ambiguousPatterns = [
    /\b(it|its|they|their|theirs|them|this|that|these|those)\b/,
    /\b(he|him|his|she|her|hers)\b/,
    /\b(here|there|then)\b/,
    /^(what about|how about|and|or|also|then|what is that|tell me about that)\b/
  ];

  for (const pattern of ambiguousPatterns) {
    if (pattern.test(q)) {
      return false;
    }
  }

  const hasQuestionStart = /^(what|how|who|why|where|when|can|is|are|does|do|request|list|show|give|tell|documents)\b/.test(q);
  const hasDomainKeyword = /\b(loan|rate|document|interest|fee|process|account|requirement|credit|policy|payment|limit|mortgage|card)\b/.test(q);

  return hasQuestionStart && hasDomainKeyword;
}
