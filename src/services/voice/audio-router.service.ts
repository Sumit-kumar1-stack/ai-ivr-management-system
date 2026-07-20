import {
  AudioChunk,
} from "./audio-stream.types";

import {
  AudioStreamService,
} from "./audio-stream.service";

export class AudioRouter {
  //--------------------------------------------
  // Caller audio entering the system
  //--------------------------------------------

  static async routeIncoming(
    chunk: AudioChunk
  ): Promise<void> {
    await AudioStreamService.receive(
      chunk
    );
  }

  //--------------------------------------------
  // Generated audio leaving the system
  //--------------------------------------------

  static async routeOutgoing(
    chunk: AudioChunk
  ): Promise<void> {
    /*
     * This is currently only an observation hook.
     *
     * Actual Twilio playback is handled by:
     *
     * VoiceWorker
     * → streamToCall
     * → streamAudioToTwilio
     * → AudioSessionService
     */

    console.log(
      `🔀 Outgoing audio routed (${chunk.callId})`
    );

    console.log({
      bytes:
        chunk.data.length,

      timestamp:
        chunk.timestamp,
    });
  }
}