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
  TTSAudioChunk,
} from "./types";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioConverter,
} from "./audio-converter.service";


const ai =
  new GoogleGenAI({
    apiKey:
      AI_CONFIG.geminiApiKey,
  });


export class VoiceService {

  //--------------------------------------------------
  // Gemini text → PCM → Twilio μ-law
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
      process.env.GEMINI_TTS_MODEL?.trim() ||
"gemini-3.1-flash-tts-preview";

    const voice =
      process.env.GEMINI_TTS_VOICE ||
      "Kore";

    const style =
      process.env.GEMINI_TTS_STYLE ||
      (
        "Speak clearly and naturally in a warm, " +
        "professional customer-service tone. " +
        "Use a moderate pace suitable for a phone call."
      );

    const prompt =
      `${style}\n\n` +
      `Read the following text exactly:\n` +
      normalizedText;

    log.info(
      {
        textLength:
          normalizedText.length,

        model,

        voice,
      },
      "Generating Gemini speech"
    );

    console.log(
      "\n========== GEMINI TTS =========="
    );

    console.log(
      "Text:"
    );

    console.log(
      normalizedText
    );

    console.log(
      "Model:",
      model
    );

    console.log(
      "Voice:",
      voice
    );

    const started =
      performance.now();

    //----------------------------------------------
    // Generate raw 24 kHz PCM audio
    //----------------------------------------------

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    let response;
    let attempt = 0;
    while (true) {
      try {
        attempt++;
        response =
          await ai.models.generateContent({
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
      } catch (error) {
        const err = error as { status?: number; statusCode?: number; response?: { status?: number } };
        const status = err.status || err.statusCode || err.response?.status;
        log.error({ error, attempt, status }, `Gemini TTS synthesis attempt ${attempt} failed`);

        if (status === 429) {
          log.error("HTTP 429 Rate Limit Exceeded. Disabling retry. Final failure.");
          throw error;
        }

        const is5xx = typeof status === "number" && status >= 500 && status < 600;
        if (is5xx && attempt === 1) {
          log.warn(`Transient 5xx error encountered. Retrying in 1000ms...`);
          await sleep(1000);
          continue;
        }

        log.error(`Gemini TTS synthesis failed permanently after attempt ${attempt}`);
        throw error;
      }
    }

    //----------------------------------------------
    // Extract base64 PCM
    //----------------------------------------------

    const part =
      response.candidates
        ?.[0]
        ?.content
        ?.parts
        ?.[0];

    const base64Audio =
      part?.inlineData?.data;

    const mimeType =
      part?.inlineData?.mimeType;

    if (
      !base64Audio
    ) {
      log.error(
        {
          candidates:
            response.candidates,
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
      pcmAudio.length === 0
    ) {
      throw new Error(
        "Gemini returned an empty PCM audio buffer"
      );
    }

    //----------------------------------------------
    // Convert Gemini PCM to Twilio μ-law
    //----------------------------------------------

    const mulawAudio =
      AudioConverter
        .pcm24kToMulaw8k(
          pcmAudio
        );

    if (
      mulawAudio.length === 0
    ) {
      throw new Error(
        "μ-law conversion returned empty audio"
      );
    }

    const elapsed =
      (
        performance.now() -
        started
      ).toFixed(
        0
      );

    console.log(
      "Mime Type:",
      mimeType ?? "unknown"
    );

    console.log(
      "PCM Size:",
      pcmAudio.length,
      "bytes"
    );

    console.log(
      "μ-law Size:",
      mulawAudio.length,
      "bytes"
    );

    console.log(
      "Generation:",
      `${elapsed} ms`
    );

    console.log(
      "================================\n"
    );

    log.info(
      {
        model,

        voice,

        mimeType,

        pcmBytes:
          pcmAudio.length,

        mulawBytes:
          mulawAudio.length,

        generationTime:
          elapsed,
      },
      "Gemini speech generated"
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
  // Batch synthesis
  //--------------------------------------------------

  static async synthesizeBatch(
    callId: string,
    chunks: string[]
  ): Promise<TTSAudioChunk[]> {

    const result:
      TTSAudioChunk[] = [];

    for (
      const chunk of chunks
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