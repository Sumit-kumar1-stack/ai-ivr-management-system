import { TTSAudioChunk } from "./types";

class VoiceQueue {

  private queues =
    new Map<string, TTSAudioChunk[]>();

  enqueue(
    callId: string,
    chunk: TTSAudioChunk
  ) {

    if (!this.queues.has(callId)) {

      this.queues.set(
        callId,
        []
      );

    }

    this.queues
      .get(callId)!
      .push(chunk);

    console.log(
      `📥 Queue +1 (${callId}) Size=${this.size(callId)}`
    );

  }

  flush(
    callId: string
  ) {

    const queue =
      this.queues.get(callId);

    if (!queue) {

      return [];

    }

    this.queues.delete(
      callId
    );

    return queue;

  }

  isEmpty(
    callId: string
  ) {

    return (
      this.size(callId) === 0
    );

  }

  dequeue(
    callId: string
  ): TTSAudioChunk | undefined {

    const queue =
      this.queues.get(callId);

    if (!queue) {

      return undefined;

    }

    const chunk =
      queue.shift();

    console.log(
      `📤 Queue -1 (${callId}) Size=${this.size(callId)}`
    );

    return chunk;

  }

  peek(
    callId: string
  ) {

    return this
      .queues
      .get(callId)?.[0];

  }

  size(
    callId: string
  ) {

    return (
      this
        .queues
        .get(callId)
        ?.length ?? 0
    );

  }

  clear(
    callId: string
  ) {

    this.queues.delete(
      callId
    );

  }

  hasItems(
    callId: string
  ) {

    return (
      this.size(callId) > 0
    );

  }

}

export const voiceQueue =
  new VoiceQueue();