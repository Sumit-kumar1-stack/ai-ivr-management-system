import { randomUUID } from "crypto";

import {
  AudioChunk,
} from "./types";

import {
  createCallLogger,
} from "@/lib/logger";

export class VoiceService {

  //--------------------------------------------------
  // Mock Text-To-Speech
  //--------------------------------------------------

  static async synthesize(
    callId: string,
    text: string
  ): Promise<AudioChunk> {

    const log =
      createCallLogger(callId);

    log.info({
      length: text.length,
    }, "Generating Speech");

    console.log(
      "\n========== TTS =========="
    );

    console.log(
      "Generating audio..."
    );

    console.log("Text:");

    console.log(text);

    //--------------------------------------------------
    // Mock Audio Buffer
    //--------------------------------------------------

    const started =
      performance.now();

    const audio =
      Buffer.from(text);

    const elapsed =
      (
        performance.now() -
        started
      ).toFixed(0);

    console.log(
      "Audio Size:",
      audio.length,
      "bytes"
    );

    console.log(
      "Generation:",
      `${elapsed} ms`
    );

    console.log(
      "=========================\n"
    );

    log.info({

      size: audio.length,

      generationTime: elapsed,

    }, "Speech Generated");

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

  //--------------------------------------------------
  // Batch Synthesis
  //--------------------------------------------------

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