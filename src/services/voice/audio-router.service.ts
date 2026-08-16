import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioChunk,
} from "./audio-stream.types";

import {
  AudioStreamService,
} from "./audio-stream.service";

//--------------------------------------------------
// Audio Router
//--------------------------------------------------

export class AudioRouter {
  //--------------------------------------------
  // Caller Audio Entering The System
  //--------------------------------------------

  static async routeIncoming(
    chunk: AudioChunk
  ): Promise<void> {
    await AudioStreamService.receive(
      chunk
    );
  }

  //--------------------------------------------
  // Generated Audio Leaving The System
  //--------------------------------------------

  static async routeOutgoing(
    chunk: AudioChunk
  ): Promise<void> {
    /*
     * Observation hook only.
     *
     * Actual Twilio playback:
     *
     * VoiceWorker
     * → streamToCall
     * → streamAudioToTwilio
     * → AudioSessionService
     */

    const log =
      createCallLogger(
        chunk.callId
      );

    log.debug(
      {
        event:
          "voice.audio.outgoing_routed",

        audioByteCount:
          chunk.data.length,

        timestampPresent:
          Number.isFinite(
            chunk.timestamp
          ),
      },
      "Outgoing audio routed"
    );
  }
}