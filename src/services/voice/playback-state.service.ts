class PlaybackStateManager {

  private speaking =
    new Map<string, boolean>();

  start(callId: string) {

    this.speaking.set(
      callId,
      true
    );

    console.log(
      `🔊 SPEAKING (${callId})`
    );

  }

  stop(callId: string) {

    this.speaking.set(
      callId,
      false
    );

    console.log(
      `🔇 STOPPED (${callId})`
    );

  }

  isSpeaking(
    callId: string
  ) {

    return (
      this.speaking.get(callId)
      ?? false
    );

  }

}

export const PlaybackState =
  new PlaybackStateManager();