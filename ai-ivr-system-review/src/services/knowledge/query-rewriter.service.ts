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
  question: string
): Promise<string> {
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

  try {
    const rewritten =
      (
        await askAI(
          prompt
        )
      ).trim();

    const result =
      rewritten ||
      normalizedQuestion;

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

    return normalizedQuestion;
  }
}