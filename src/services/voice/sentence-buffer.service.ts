type SentenceCallback = (
  sentence: string
) => Promise<void>;

class SentenceBuffer {

  private buffers =
    new Map<string, string>();

  append(
    callId: string,
    chunk: string
  ) {

    const current =
      this.buffers.get(callId) ?? "";

    this.buffers.set(
      callId,
      current + chunk
    );

  }

  async flushCompleteSentences(
    callId: string,
    callback: SentenceCallback
  ) {

    let buffer =
      this.buffers.get(callId) ?? "";

    const regex =
      /(.+?[.!?])(\s|$)/g;

    let match;

    while (
      (match = regex.exec(buffer)) !== null
    ) {

      const sentence =
        match[1].trim();

      await callback(
        sentence
      );

    }

    const consumed =
      regex.lastIndex;

    buffer =
      buffer.slice(consumed);

    this.buffers.set(
      callId,
      buffer
    );

  }

  async flushRemaining(
    callId: string,
    callback: SentenceCallback
  ) {

    const buffer =
      this.buffers.get(callId);

    if (
      buffer &&
      buffer.trim().length > 0
    ) {

      await callback(
        buffer.trim()
      );

    }

    this.buffers.delete(
      callId
    );

  }

  clear(
    callId: string
  ) {

    this.buffers.delete(
      callId
    );

    console.log(
      `🧹 Sentence buffer cleared (${callId})`
    );

  }

}

export const sentenceBuffer =
  new SentenceBuffer();