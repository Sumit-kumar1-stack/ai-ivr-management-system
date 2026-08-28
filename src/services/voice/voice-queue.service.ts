import {
  createCallLogger,
} from "@/lib/logger";

import {
  TTSAudioChunk,
} from "./types";


//--------------------------------------------------
// Voice Queue
//--------------------------------------------------

class VoiceQueue {
  private queues =
    new Map<
      string,
      TTSAudioChunk[]
    >();

  enqueue(
    callId: string,
    chunk: TTSAudioChunk
  ): void {
    if (
      !this.queues.has(
        callId
      )
    ) {
      this.queues.set(
        callId,
        []
      );
    }

    const queue = this.queues.get(callId)!;
    queue.push(chunk);

    const log =
      createCallLogger(
        callId
      );

    log.debug(
      {
        event:
          "voice.queue.enqueued",

        queueSize:
          this.size(
            callId
          ),
      },
      "Voice queue item added"
    );
  }

  flush(
    callId: string
  ): TTSAudioChunk[] {
    const queue =
      this.queues.get(
        callId
      );

    if (
      !queue
    ) {
      return [];
    }

    this.queues.delete(
      callId
    );

    const log =
      createCallLogger(
        callId
      );

    log.debug(
      {
        event:
          "voice.queue.flushed",

        flushedItemCount:
          queue.length,
      },
      "Voice queue flushed"
    );

    return queue;
  }

  isEmpty(
    callId: string
  ): boolean {
    return (
      this.size(
        callId
      ) ===
      0
    );
  }

  dequeue(
    callId: string
  ): TTSAudioChunk |
    undefined {
    const queue =
      this.queues.get(
        callId
      );

    if (
      !queue
    ) {
      return undefined;
    }

    const chunk =
      queue.shift();

    const log =
      createCallLogger(
        callId
      );

    log.debug(
      {
        event:
          "voice.queue.dequeued",

        queueSize:
          this.size(
            callId
          ),

        itemReturned:
          Boolean(
            chunk
          ),
      },
      "Voice queue item removed"
    );

    return chunk;
  }

  peek(
    callId: string
  ): TTSAudioChunk |
    undefined {
    return this
      .queues
      .get(
        callId
      )?.[0];
  }

  size(
    callId: string
  ): number {
    return (
      this.queues
        .get(
          callId
        )
        ?.length ??
      0
    );
  }

  clear(
    callId: string
  ): void {
    const clearedItemCount =
      this.size(
        callId
      );

    this.queues.delete(
      callId
    );

    const log =
      createCallLogger(
        callId
      );

    log.debug(
      {
        event:
          "voice.queue.cleared",

        clearedItemCount,
      },
      "Voice queue cleared"
    );
  }

  hasItems(
    callId: string
  ): boolean {
    return (
      this.size(
        callId
      ) >
      0
    );
  }
}

export const voiceQueue =
  new VoiceQueue();
