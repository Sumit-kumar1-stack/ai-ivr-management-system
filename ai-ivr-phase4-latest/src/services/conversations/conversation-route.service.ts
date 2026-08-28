export type ConversationRoute =
  | "KNOWLEDGE"
  | "FOLLOW_UP_KNOWLEDGE"
  | "CONTEXT_ONLY";

export interface ConversationRouteResult {
  route: ConversationRoute;

  reason: string;
}

//--------------------------------------------------
// Normalize
//--------------------------------------------------

function normalize(
  value: string
): string {
  return value
    .toLowerCase()
    .trim()
    .replace(
      /[.,!?;:'"]/g,
      ""
    )
    .replace(
      /\s+/g,
      " "
    );
}

//--------------------------------------------------
// Context-only transformations
//--------------------------------------------------

const CONTEXT_ONLY_PATTERNS = [
  "explain that",
  "explain it",
  "explain that again",
  "explain it again",
  "explain that simply",
  "explain it simply",
  "explain that more simply",
  "make that simpler",
  "make it simpler",
  "simplify that",
  "simplify it",
  "what do you mean",
  "what does that mean",
  "summarize that",
  "summarise that",
  "tell me that simply",
] as const;

//--------------------------------------------------
// Follow-up markers
//--------------------------------------------------

const FOLLOW_UP_MARKERS =
  new Set([
    "it",
    "its",
    "this",
    "that",
    "they",
    "them",
    "their",
    "those",
    "these",
    "same",
    "previous",
    "earlier",
    "before",
    "also",
  ]);

//--------------------------------------------------
// Route
//--------------------------------------------------

export function routeConversationMessage(
  history: string,
  message: string
): ConversationRouteResult {
  const normalizedMessage =
    normalize(
      message
    );

  const hasHistory =
    Boolean(
      history.trim()
    );

  //------------------------------------------------
  // No history = standalone knowledge request
  //------------------------------------------------

  if (
    !hasHistory
  ) {
    return {
      route:
        "KNOWLEDGE",

      reason:
        "no_previous_context",
    };
  }

  //------------------------------------------------
  // Context-only request
  //------------------------------------------------

  const contextOnly =
    CONTEXT_ONLY_PATTERNS.some(
      pattern =>
        normalizedMessage ===
          pattern ||
        normalizedMessage.startsWith(
          `${pattern} `
        )
    );

  if (
    contextOnly
  ) {
    return {
      route:
        "CONTEXT_ONLY",

      reason:
        "conversation_context_is_sufficient",
    };
  }

  //------------------------------------------------
  // Common follow-up openings
  //------------------------------------------------

  if (
    normalizedMessage.startsWith(
      "what about "
    ) ||
    normalizedMessage.startsWith(
      "how about "
    ) ||
    normalizedMessage.startsWith(
      "and what "
    ) ||
    normalizedMessage.startsWith(
      "and how "
    ) ||
    normalizedMessage.startsWith(
      "and its "
    ) ||
    normalizedMessage.startsWith(
      "what is its "
    ) ||
    normalizedMessage.startsWith(
      "what are its "
    )
  ) {
    return {
      route:
        "FOLLOW_UP_KNOWLEDGE",

      reason:
        "follow_up_phrase",
    };
  }

  //------------------------------------------------
  // Pronoun/reference detection
  //------------------------------------------------

  const words =
    normalizedMessage
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );

  const containsReference =
    words.some(
      word =>
        FOLLOW_UP_MARKERS.has(
          word
        )
    );

  if (
    containsReference
  ) {
    return {
      route:
        "FOLLOW_UP_KNOWLEDGE",

      reason:
        "context_reference_detected",
    };
  }

  //------------------------------------------------
  // Very short questions with conversation history
  //------------------------------------------------

  if (
    words.length <= 4
  ) {
    return {
      route:
        "FOLLOW_UP_KNOWLEDGE",

      reason:
        "short_contextual_question",
    };
  }

  //------------------------------------------------
  // Normal standalone knowledge question
  //------------------------------------------------

  return {
    route:
      "KNOWLEDGE",

    reason:
      "standalone_knowledge_question",
  };
}