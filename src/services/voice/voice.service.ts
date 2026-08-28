import {
  randomUUID,
} from "crypto";

import {
  GoogleGenAI,
} from "@google/genai";

import {
  AI_CONFIG,
} from "@/config/ai";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  AudioConverter,
} from "./audio-converter.service";

import {
  CascadedTurnLatency,
} from "@/services/voice-runtime/cascaded-turn-latency.service";

import { StandardRuntimeUsage } from "@/services/voice-runtime/standard-runtime-usage.service";

import {
  TTSAudioChunk,
} from "./types";

//--------------------------------------------------
// Gemini Client
//--------------------------------------------------

let ai: GoogleGenAI | undefined;

function getGeminiClient(): GoogleGenAI {
  ai ??= new GoogleGenAI({
    apiKey: AI_CONFIG.geminiApiKey,
  });
  return ai;
}

const MAX_RETRYABLE_TTS_ATTEMPTS =
  2;

//--------------------------------------------------
// Helpers
//--------------------------------------------------

function delay(
  milliseconds: number
): Promise<void> {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

function getHttpStatus(
  error: unknown
): number | undefined {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return undefined;
  }

  const candidate =
    error as {
      status?: number;

      statusCode?: number;

      response?: {
        status?: number;
      };
    };

  return (
    candidate.status ??
    candidate.statusCode ??
    candidate.response
      ?.status
  );
}

//--------------------------------------------------
// Voice Service
//--------------------------------------------------

export class VoiceService {
  //--------------------------------------------------
  // Gemini Text → PCM → Twilio μ-law
  //--------------------------------------------------

  static async synthesize(
    callId: string,
    text: string
  ): Promise<TTSAudioChunk> {
    const log =
      createCallLogger(
        callId
      );

    const normalizedText =
      text.trim();

    if (
      !normalizedText
    ) {
      throw new Error(
        "Cannot synthesize empty text"
      );
    }

    if (
      !AI_CONFIG.geminiApiKey
    ) {
      throw new Error(
        "Gemini API key is missing"
      );
    }

    const model =
      process.env
        .GEMINI_TTS_MODEL
        ?.trim() ||
      "gemini-3.1-flash-tts-preview";

    const voice =
      process.env
        .GEMINI_TTS_VOICE
        ?.trim() ||
      "Kore";

    const style =
      process.env
        .GEMINI_TTS_STYLE
        ?.trim() ||
      (
        "Speak clearly and naturally in a warm, " +
        "professional customer-service tone. " +
        "Use a moderate pace suitable for a phone call."
      );

    const prompt =
      `${style}\n\n` +
      "Read the following text exactly:\n" +
      normalizedText;

    const startedAt =
      performance.now();

    log.info(
      {
        event:
          "voice.tts.generation_started",

        textCharacterCount:
          normalizedText.length,

        promptCharacterCount:
          prompt.length,

        model,

        voice,
      },
      "Gemini speech generation started"
    );

    CascadedTurnLatency.startTts(
      callId,
      "GEMINI",
      model,
      voice
    );

    //----------------------------------------------
    // Generate Raw 24 kHz PCM Audio
    //----------------------------------------------

    let response:
      Awaited<
        ReturnType<
          GoogleGenAI["models"]["generateContent"]
        >
      >;

    let attempt =
      0;

    while (
      true
    ) {
      try {
        attempt +=
          1;

        response =
          await getGeminiClient().models
            .generateContent({
              model,

              contents: [
                {
                  role:
                    "user",

                  parts: [
                    {
                      text:
                        prompt,
                    },
                  ],
                },
              ],

              config: {
                responseModalities: [
                  "AUDIO",
                ],

                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName:
                        voice,
                    },
                  },
                },
              },
            });

        break;
      } catch (
        error
      ) {
        const status =
          getHttpStatus(
            error
          );

        log.error(
          {
            event:
              "voice.tts.generation_attempt_failed",

            attempt,

            status:
              status ??
              null,

            error:
              normalizeError(
                error
              ),
          },
          "Gemini TTS synthesis attempt failed"
        );

        const retryable =
          typeof status === "number" &&
          (
            status === 429 ||
            (
              status >= 500 &&
              status < 600
            )
          ) &&
          attempt < MAX_RETRYABLE_TTS_ATTEMPTS;

        if (
          retryable
        ) {
          log.warn(
            {
              event:
                "voice.tts.retry_scheduled",

              attempt,

              delayMs:
                attempt * 500,

              status,
            },
            "Transient Gemini TTS failure; retry scheduled"
          );

          await delay(
            attempt * 500
          );

          continue;
        }

        CascadedTurnLatency.fail(
          callId,
          "TTS"
        );

        throw error;
      }
    }

    //----------------------------------------------
    // Extract Base64 PCM
    //----------------------------------------------

    const part =
      response.candidates
        ?.[0]
        ?.content
        ?.parts
        ?.[0];

    const base64Audio =
      part?.inlineData
        ?.data;

    const mimeType =
      part?.inlineData
        ?.mimeType;

    if (
      !base64Audio
    ) {
      log.error(
        {
          event:
            "voice.tts.audio_missing",

          candidateCount:
            response.candidates
              ?.length ??
            0,

          model,

          voice,
        },
        "Gemini TTS returned no audio"
      );

      throw new Error(
        "Gemini TTS returned no audio data"
      );
    }

    const pcmAudio =
      Buffer.from(
        base64Audio,
        "base64"
      );

    if (
      pcmAudio.length ===
      0
    ) {
      CascadedTurnLatency.fail(
        callId,
        "TTS"
      );

      CascadedTurnLatency.fail(
        callId,
        "TTS"
      );

      throw new Error(
        "Gemini returned an empty PCM audio buffer"
      );
    }

    //----------------------------------------------
    // Convert PCM To Twilio μ-law
    //----------------------------------------------

    const mulawAudio =
      AudioConverter
        .pcm24kToMulaw8k(
          pcmAudio
        );

    if (
      mulawAudio.length ===
      0
    ) {
      CascadedTurnLatency.fail(
        callId,
        "TTS"
      );

      throw new Error(
        "μ-law conversion returned empty audio"
      );
    }

    const generationDurationMs =
      Math.round(
        performance.now() -
          startedAt
      );

    log.info(
      {
        event:
          "voice.tts.generation_completed",

        model,

        voice,

        mimeType:
          mimeType ??
          "unknown",

        textCharacterCount:
          normalizedText.length,

        pcmSizeBytes:
          pcmAudio.length,

        mulawSizeBytes:
          mulawAudio.length,

        generationDurationMs,

        attempts:
          attempt,
      },
      "Gemini speech generated"
    );

    CascadedTurnLatency.markTtsAudioReady(
      callId
    );

    StandardRuntimeUsage.recordTts(
      callId,
      "GEMINI",
      normalizedText.length,
      mulawAudio.length
    );

    return {
      id:
        randomUUID(),

      callId,

      text:
        normalizedText,

      audio:
        mulawAudio,

      createdAt:
        new Date(),
    };
  }

  //--------------------------------------------------
  // Batch Synthesis
  //--------------------------------------------------

  static async synthesizeBatch(
    callId: string,
    chunks: string[]
  ): Promise<TTSAudioChunk[]> {
    const result:
      TTSAudioChunk[] =
      [];

    for (
      const chunk of
      chunks
    ) {
      const normalizedChunk =
        chunk.trim();

      if (
        !normalizedChunk
      ) {
        continue;
      }

      result.push(
        await this.synthesize(
          callId,
          normalizedChunk
        )
      );
    }

    return result;
  }
}
