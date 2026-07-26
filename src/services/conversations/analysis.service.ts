import {
  generateAIResponse,
} from "./ai-response.service";

export interface ConversationAnalysis {
  intent: string;

  sentiment: string;

  priority: string;

  followUp: boolean;

  actionItems: string[];

  summary: string;
}

type UnknownAnalysis =
  Partial<
    ConversationAnalysis
  >;

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
        ? value.actionItems
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
              (item) =>
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

export async function generateConversationAnalysis(
  transcript: string
): Promise<ConversationAnalysis> {
  const prompt = `
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

${transcript}
`;

  const result =
    await generateAIResponse(
      prompt
    );

  const match =
    result.match(
      /\{[\s\S]*\}/
    );

  if (!match) {
    console.error(
      "AI analysis response:",
      result
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

    return normalizeAnalysis(
      parsed
    );
  } catch (error) {
    console.error(
      "Failed analysis response:",
      result
    );

    throw error;
  }
}