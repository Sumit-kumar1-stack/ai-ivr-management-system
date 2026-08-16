import {
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  generateAIResponse,
} from "./ai-response.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "conversation-analysis-service"
  );

//--------------------------------------------------
// Types
//--------------------------------------------------

export interface ConversationAnalysis {
  intent:
    string;

  sentiment:
    string;

  priority:
    string;

  followUp:
    boolean;

  actionItems:
    string[];

  summary:
    string;
}

type UnknownAnalysis =
  Partial<
    ConversationAnalysis
  >;

//--------------------------------------------------
// Normalization
//--------------------------------------------------

function normalizeString(
  value: unknown,
  fallback: string
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return fallback;
  }

  return value.trim();
}

function normalizeAnalysis(
  value: UnknownAnalysis
): ConversationAnalysis {
  return {
    intent:
      normalizeString(
        value.intent,
        "Unknown"
      ),

    sentiment:
      normalizeString(
        value.sentiment,
        "Neutral"
      ),

    priority:
      normalizeString(
        value.priority,
        "Normal"
      ),

    followUp:
      typeof value.followUp ===
      "boolean"
        ? value.followUp
        : false,

    actionItems:
      Array.isArray(
        value.actionItems
      )
        ? value
            .actionItems
            .filter(
              (
                item
              ): item is string =>
                typeof item ===
                  "string" &&
                Boolean(
                  item.trim()
                )
            )
            .map(
              item =>
                item.trim()
            )
        : [],

    summary:
      normalizeString(
        value.summary,
        "No summary was generated."
      ),
  };
}

//--------------------------------------------------
// Generate Conversation Analysis
//--------------------------------------------------

export async function generateConversationAnalysis(
  transcript: string
): Promise<ConversationAnalysis> {
  const normalizedTranscript =
    transcript.trim();

  const prompt =
    `
You are an AI Call Center Analyst.

Analyze the following conversation.

Return ONLY one valid JSON object with exactly these fields:

{
  "intent": "Customer intent",
  "sentiment": "Positive, Neutral, or Negative",
  "priority": "Low, Normal, High, or Urgent",
  "followUp": false,
  "actionItems": [],
  "summary": "A concise factual summary"
}

Rules:

- Do not use markdown.
- Do not wrap JSON in code fences.
- Do not add text before or after JSON.
- Base the analysis only on the conversation.
- actionItems must always be an array of strings.
- followUp must always be true or false.

Conversation:

${normalizedTranscript}
`;

  const result =
    await generateAIResponse(
      prompt
    );

  const match =
    result.match(
      /\{[\s\S]*\}/
    );

  if (
    !match
  ) {
    log.warn(
      {
        event:
          "conversation.analysis.invalid_response",

        reason:
          "json_object_not_found",

        transcriptCharacterCount:
          normalizedTranscript.length,

        responseCharacterCount:
          result.length,
      },
      "AI analysis response did not contain a JSON object"
    );

    throw new Error(
      "No valid JSON object returned by AI"
    );
  }

  try {
    const parsed =
      JSON.parse(
        match[0]
      ) as UnknownAnalysis;

    const analysis =
      normalizeAnalysis(
        parsed
      );

    log.info(
      {
        event:
          "conversation.analysis.completed",

        transcriptCharacterCount:
          normalizedTranscript.length,

        responseCharacterCount:
          result.length,

        actionItemCount:
          analysis.actionItems.length,

        followUp:
          analysis.followUp,
      },
      "Conversation analysis completed"
    );

    return analysis;
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "conversation.analysis.parse_failed",

        transcriptCharacterCount:
          normalizedTranscript.length,

        responseCharacterCount:
          result.length,

        error:
          normalizeError(
            error
          ),
      },
      "Failed to parse conversation analysis"
    );

    throw error;
  }
}