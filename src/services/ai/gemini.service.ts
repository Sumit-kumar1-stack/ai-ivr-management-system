import { GoogleGenAI } from "@google/genai";

import { AI_CONFIG } from "@/config/ai";
import { Logger } from "@/lib/logger";

const ai = new GoogleGenAI({
  apiKey: AI_CONFIG.geminiApiKey,
});

const GEMINI_TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL?.trim() ||
  "gemini-3.6-flash";

interface ApiErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
}

interface GeminiApiError extends Error {
  status?: number;
  statusCode?: number;
  code?: string | number;
}

function normalizeGeminiError(
  error: unknown
): GeminiApiError {
  if (error instanceof Error) {
    return error as GeminiApiError;
  }

  return new Error(
    String(error)
  ) as GeminiApiError;
}

function logGeminiError(
  error: unknown,
  modelName: string,
  prompt: string
): void {
  const err =
    normalizeGeminiError(error);

  let apiDetails:
    unknown[] | null = null;

  let parsedMessage =
    err.message || String(error);

  if (err.message) {
    try {
      const parsed =
        JSON.parse(
          err.message
        ) as ApiErrorBody;

      if (parsed.error) {
        apiDetails =
          parsed.error.details ??
          null;

        parsedMessage =
          parsed.error.message ??
          err.message;
      }
    } catch {
      // Error message is not JSON.
    }
  }

  Logger.error(
    {
      geminiError: {
        errorName:
          err.name ||
          "UnknownError",

        status:
          err.status ??
          err.statusCode ??
          null,

        message:
          parsedMessage,

        errorCode:
          err.code ??
          null,

        apiDetails,

        stack:
          err.stack ??
          null,

        modelName,

        requestSummary: {
          promptLength:
            prompt.length,
        },
      },
    },
    `Gemini API Error: ${parsedMessage}`
  );
}

/**
 * Standard completion.
 */
export async function askGemini(
  prompt: string
): Promise<string> {
  const normalizedPrompt =
    prompt.trim();

  if (!normalizedPrompt) {
    throw new Error(
      "Gemini prompt cannot be empty"
    );
  }

  try {
    const response =
      await ai.models.generateContent({
        model:
          GEMINI_TEXT_MODEL,

        contents:
          normalizedPrompt,
      });

    return (
      response.text?.trim() ??
      ""
    );
  } catch (error) {
    logGeminiError(
      error,
      GEMINI_TEXT_MODEL,
      normalizedPrompt
    );

    throw error;
  }
}

/**
 * Streaming completion.
 */
export async function* askGeminiStream(
  prompt: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const normalizedPrompt =
    prompt.trim();

  if (!normalizedPrompt) {
    throw new Error(
      "Gemini prompt cannot be empty"
    );
  }

  if (signal?.aborted) {
    return;
  }

  try {
    const stream =
      await ai.models.generateContentStream({
        model:
          GEMINI_TEXT_MODEL,

        contents:
          normalizedPrompt,
      });

    for await (
      const chunk of stream
    ) {
      if (signal?.aborted) {
        console.log(
          "🛑 Gemini stream aborted"
        );

        return;
      }

      const text =
        chunk.text ?? "";

      if (!text) {
        continue;
      }

      yield text;
    }
  } catch (error) {
    logGeminiError(
      error,
      GEMINI_TEXT_MODEL,
      normalizedPrompt
    );

    throw error;
  }
}