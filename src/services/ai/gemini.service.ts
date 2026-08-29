import {
  GoogleGenAI,
} from "@google/genai";

import {
  AI_CONFIG,
} from "@/config/ai";

import {
  createServerLogger,
} from "@/lib/logger";

//--------------------------------------------------
// Gemini Client
//--------------------------------------------------

const ai =
  new GoogleGenAI({
    apiKey:
      AI_CONFIG.geminiApiKey,
  });

const GEMINI_TEXT_MODEL =
  process.env
    .GEMINI_TEXT_MODEL
    ?.trim() ||
  "gemini-3.6-flash";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "gemini-service"
  );

//--------------------------------------------------
// Error Types
//--------------------------------------------------

interface GeminiApiError
  extends Error {
  status?:
    number;

  statusCode?:
    number;

  code?:
    string |
    number;
}

function normalizeGeminiError(
  error: unknown
): GeminiApiError {
  if (
    error instanceof
    Error
  ) {
    return error as
      GeminiApiError;
  }

  return new Error(
    String(
      error
    )
  ) as GeminiApiError;
}

//--------------------------------------------------
// Safe Error Logging
//--------------------------------------------------

function logGeminiError(
  error: unknown,
  modelName: string,
  promptLength: number
): void {
  const normalized =
    normalizeGeminiError(
      error
    );

  log.error(
    {
      event:
        "gemini.request.failed",

      errorName:
        normalized.name ||
        "UnknownError",

      errorStatus:
        normalized.status ??
        normalized.statusCode ??
        null,

      errorCodePresent:
        normalized.code !==
          undefined &&
        normalized.code !==
          null,

      modelName,

      promptCharacterCount:
        promptLength,
    },
    "Gemini request failed"
  );
}

//--------------------------------------------------
// Standard Completion
//--------------------------------------------------

export async function askGemini(
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const normalizedPrompt =
    prompt.trim();

  if (
    !normalizedPrompt
  ) {
    throw new Error(
      "Gemini prompt cannot be empty"
    );
  }

  if (
    signal?.aborted
  ) {
    throw new DOMException(
      "Gemini request aborted",
      "AbortError"
    );
  }

  try {
    const response =
      await ai.models
        .generateContent({
          model:
            GEMINI_TEXT_MODEL,

          contents:
            normalizedPrompt,

          config: {
            abortSignal: signal,
          },
        });

    if (
      signal?.aborted
    ) {
      throw new DOMException(
        "Gemini request aborted",
        "AbortError"
      );
    }

    return (
      response.text
        ?.trim() ??
      ""
    );
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
      log.debug(
        {
          event:
            "gemini.request.aborted",

          modelName:
            GEMINI_TEXT_MODEL,
        },
        "Gemini request aborted"
      );

      throw error;
    }

    logGeminiError(
      error,
      GEMINI_TEXT_MODEL,
      normalizedPrompt.length
    );

    throw error;
  }
}

//--------------------------------------------------
// Streaming Completion
//--------------------------------------------------

export async function* askGeminiStream(
  prompt: string,
  signal?: AbortSignal,
  onUsage?: (usage: { inputTokens?: number | null; outputTokens?: number | null }) => void
): AsyncGenerator<string> {
  const normalizedPrompt =
    prompt.trim();

  if (
    !normalizedPrompt
  ) {
    throw new Error(
      "Gemini prompt cannot be empty"
    );
  }

  if (
    signal?.aborted
  ) {
    return;
  }

  try {
    const stream =
      await ai.models
        .generateContentStream({
          model:
            GEMINI_TEXT_MODEL,

          contents:
            normalizedPrompt,

          config: {
            abortSignal: signal,
          },
        });

    for await (
      const chunk of stream
    ) {
      // Gemini only supplies these provider-native billing units on some
      // stream responses. Do not derive them from text when absent.
      const usage = chunk.usageMetadata;
      if (usage) {
        onUsage?.({
          inputTokens: usage.promptTokenCount ?? null,
          outputTokens: usage.candidatesTokenCount ?? null,
        });
      }

      if (
        signal?.aborted
      ) {
        log.debug(
          {
            event:
              "gemini.stream.aborted",

            modelName:
              GEMINI_TEXT_MODEL,
          },
          "Gemini stream aborted"
        );

        return;
      }

      const text =
        chunk.text ??
        "";

      if (
        !text
      ) {
        continue;
      }

      yield text;
    }
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
      log.debug(
        {
          event:
            "gemini.stream.aborted",

          modelName:
            GEMINI_TEXT_MODEL,
        },
        "Gemini stream aborted"
      );

      throw error;
    }

    logGeminiError(
      error,
      GEMINI_TEXT_MODEL,
      normalizedPrompt.length
    );

    throw error;
  }
}
