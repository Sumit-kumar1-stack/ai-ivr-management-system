import { randomUUID } from "crypto";

import { AudioChunk } from "./types";

export class VoiceService {

  /**
   * Convert text into audio.
   * Currently mocked.
   */
  static async synthesize(
    callId: string,
    text: string
  ): Promise<AudioChunk> {

    console.log(
      "\n========== TTS =========="
    );

    console.log(
      "Generating audio..."
    );

    console.log(
      "Text:"
    );

    console.log(text);

    // -------------------------------------------------
    // Mock Audio Buffer
    // -------------------------------------------------

    const audio =
      Buffer.from(text);

    console.log(
      "Audio Size:",
      audio.length,
      "bytes"
    );

    console.log(
      "=========================\n"
    );

    return {

      id:
        randomUUID(),

      callId,

      text,

      audio,

      createdAt:
        new Date(),

    };

  }

  /**
   * Batch synthesis.
   * Useful later for buffering.
   */
  static async synthesizeBatch(
    callId: string,
    chunks: string[]
  ) {

    const result: AudioChunk[] = [];

    for (const chunk of chunks) {

      result.push(

        await this.synthesize(
          callId,
          chunk
        )

      );

    }

    return result;

  }

}