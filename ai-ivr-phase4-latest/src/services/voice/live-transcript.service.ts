class LiveTranscript {

  private transcripts =
    new Map<string, string>();

  append(
    callId: string,
    text: string
  ) {

    const previous =
      this.transcripts.get(callId) ?? "";

    this.transcripts.set(
      callId,
      `${previous} ${text}`.trim()
    );

  }

  get(
    callId: string
  ) {

    return (
      this.transcripts.get(callId) ?? ""
    );

  }

  clear(
    callId: string
  ) {

    this.transcripts.delete(callId);

  }

}

export const liveTranscript =
  new LiveTranscript();