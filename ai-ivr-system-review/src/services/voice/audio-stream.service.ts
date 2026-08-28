import { AudioChunk } from "./audio-stream.types";

import {
  createCallLogger,
} from "@/lib/logger";

import { STTProviderFactory } from "@/services/stt/providers/provider.factory";

export class AudioStreamService {

  //----------------------------------------
  // Incoming audio from Twilio
  //----------------------------------------

static async receive(
    chunk: AudioChunk
) {

    const log =
        createCallLogger(chunk.callId);

    log.debug(
        {
            bytes: chunk.data.length,
        },
        "Incoming audio chunk"
    );

    await STTProviderFactory
        .get()
        .sendAudio(
            chunk.callId,
            chunk.data
        );

}

  //----------------------------------------
  // Outgoing audio to Twilio
  //----------------------------------------

  static async send(
    chunk: AudioChunk
  ) {

    const log =
      createCallLogger(chunk.callId);

    log.debug(
      {
        bytes:
          chunk.data.length,
      },
      "Outgoing audio chunk"
    );

    //----------------------------------------
    // Future
    // Send generated TTS audio back
    // to Twilio Media Streams
    //----------------------------------------

    // AudioSessionService.sendAudio(chunk);

  }

}