const transcripts =
  new Map<string, string>();

export const PartialTranscriptService = {

  update(
    callId: string,
    transcript: string
  ) {

    transcripts.set(
      callId,
      transcript
    );

    console.log(
      `📝 Partial Updated (${callId})`
    );

    console.log(transcript);

  },

  append(
    callId: string,
    text: string
  ) {

    const current =
      transcripts.get(callId) ?? "";

    const updated =
      current.length === 0
        ? text
        : `${current} ${text}`;

    transcripts.set(
      callId,
      updated
    );

    console.log(
      `📝 Transcript`
    );

    console.log(updated);

  },

  get(
    callId: string
  ) {

    return (
      transcripts.get(callId) ??
      ""
    );

  },

  clear(
    callId: string
  ) {

    transcripts.delete(callId);

  },

};