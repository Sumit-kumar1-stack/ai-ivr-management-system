class PlaybackStateManager {

  private speaking =
    new Map<string, boolean>();

  start(callId: string) {

    this.speaking.set(callId, true);

    console.log(
      `🔊 SPEAKING (${callId})`
    );

  }

  stop(callId: string) {

    this.speaking.set(callId, false);

    console.log(
      `🔇 STOPPED (${callId})`
    );

  }

  isSpeaking(callId: string) {

    return (
      this.speaking.get(callId) ??
      false
    );

  }

  // Sprint C.4.6 compatibility
  isPlaying(callId: string) {

    return this.isSpeaking(callId);

  }

}

export const PlaybackState =
  new PlaybackStateManager();

export type PlaybackStateType =
  | "SPEAKING"
  | "STOPPED";  