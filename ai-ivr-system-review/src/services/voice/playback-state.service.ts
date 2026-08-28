import {
  createCallLogger,
} from "@/lib/logger";

//--------------------------------------------------
// Playback State Manager
//--------------------------------------------------

class PlaybackStateManager {
  private speaking =
    new Map<
      string,
      boolean
    >();

  start(
    callId: string
  ): void {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    const alreadySpeaking =
      this.speaking.get(
        normalizedCallId
      ) ===
      true;

    this.speaking.set(
      normalizedCallId,
      true
    );

    if (
      alreadySpeaking
    ) {
      return;
    }

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.debug(
      {
        event:
          "voice.playback.started",
      },
      "Voice playback started"
    );
  }

  stop(
    callId: string
  ): void {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    const wasSpeaking =
      this.speaking.get(
        normalizedCallId
      ) ===
      true;

    /*
     * Delete instead of retaining false entries so
     * completed calls do not accumulate in memory.
     */
    this.speaking.delete(
      normalizedCallId
    );

    if (
      !wasSpeaking
    ) {
      return;
    }

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.debug(
      {
        event:
          "voice.playback.stopped",
      },
      "Voice playback stopped"
    );
  }

  isSpeaking(
    callId: string
  ): boolean {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return false;
    }

    return (
      this.speaking.get(
        normalizedCallId
      ) ??
      false
    );
  }

  // Sprint C.4.6 compatibility
  isPlaying(
    callId: string
  ): boolean {
    return this.isSpeaking(
      callId
    );
  }
}

export const PlaybackState =
  new PlaybackStateManager();

export type PlaybackStateType =
  | "SPEAKING"
  | "STOPPED";