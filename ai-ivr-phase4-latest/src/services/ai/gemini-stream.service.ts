import {
  GoogleGenAI,
} from "@google/genai";

import {
  AI_CONFIG,
} from "@/config/ai";

import {
  createServerLogger,
  getDurationMs,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "gemini-stream"
  );

//--------------------------------------------------
// Gemini Client
//--------------------------------------------------

const ai =
  new GoogleGenAI({
    apiKey:
      AI_CONFIG.geminiApiKey,
  });

//--------------------------------------------------
// Stream Gemini Response
//--------------------------------------------------

export async function* askGeminiStream(
  prompt: string
): AsyncGenerator<string> {
  const startedAt =
    process.hrtime.bigint();

  const model =
    process.env
      .GEMINI_TEXT_MODEL
      ?.trim() ||
    "gemini-3.5-flash";

  let receivedChunkCount =
    0;

  let receivedCharacterCount =
    0;

  let yieldedWordCount =
    0;

  log.debug(
    {
      event:
        "gemini.stream.started",

      model,

      promptCharacterCount:
        prompt.length,
    },
    "Gemini response stream started"
  );

  try {
    const stream =
      await ai.models
        .generateContentStream({
          model,

          contents:
            prompt,
        });

    for await (
      const chunk of
      stream
    ) {
      const text =
        chunk.text ??
        "";

      const normalizedText =
        text.trim();

      if (
        !normalizedText
      ) {
        continue;
      }

      receivedChunkCount +=
        1;

      receivedCharacterCount +=
        text.length;

      const words =
        text.split(
          /\s+/
        );

      for (
        const word of
        words
      ) {
        if (
          !word
        ) {
          continue;
        }

        yieldedWordCount +=
          1;

        yield `${word} `;
      }
    }

    log.info(
      {
        event:
          "gemini.stream.completed",

        model,

        receivedChunkCount,

        receivedCharacterCount,

        yieldedWordCount,

        durationMs:
          getDurationMs(
            startedAt
          ),
      },
      "Gemini response stream completed"
    );
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "gemini.stream.failed",

        model,

        promptCharacterCount:
          prompt.length,

        receivedChunkCount,

        receivedCharacterCount,

        durationMs:
          getDurationMs(
            startedAt
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Gemini response stream failed"
    );

    throw error;
  }
}