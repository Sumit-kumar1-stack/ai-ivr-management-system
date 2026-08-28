import {
  createCallLogger,
} from "@/lib/logger";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  TranscriptBuffer,
} from "@/services/speech/transcript-buffer.service";

import {
  TurnCoordinator,
} from "@/services/voice-runtime/turn-coordinator.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

import {
  CascadedTurnLatency,
} from "@/services/voice-runtime/cascaded-turn-latency.service";

import { STANDARD_REALTIME_CONFIG } from "@/config/standard-realtime";
import { StandardPartialPrefetch } from "@/services/voice-runtime/standard-partial-prefetch.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

interface DeepgramAlternative {
  transcript?: string;

  confidence?: number;
}

export interface DeepgramPayload {
  type?: string;

  is_final?: boolean;

  speech_final?: boolean;

  channel?: {
    alternatives?:
      DeepgramAlternative[];
  };
}

//--------------------------------------------------
// Deepgram Event Handler
//--------------------------------------------------

export class DeepgramEvents {
  static async handle(
    callId: string,
    payload: DeepgramPayload
  ): Promise<void> {
    if (
      payload.type &&
      payload.type !==
        "Results"
    ) {
      return;
    }

    const alternative =
      payload.channel
        ?.alternatives?.[0];

    const transcript =
      alternative
        ?.transcript
        ?.trim() ??
      "";

    if (
      !transcript
    ) {
      return;
    }

    //--------------------------------------------------
    // Realtime Caller Barge-In
    //--------------------------------------------------

    const currentState =
      ConversationStateService.getState(
        callId
      );

    /*
     * Any meaningful caller speech arriving while
     * the AI is thinking or speaking takes ownership
     * of the conversation immediately.
     *
     * We do this on partial speech rather than waiting
     * for the final transcript because waiting for
     * endpointing would make interruption feel slow.
     */
    if (
      (
        currentState ===
          "SPEAKING" ||
        currentState ===
          "THINKING"
      ) &&
      transcript.length >=
        STANDARD_REALTIME_CONFIG.bargeInMinCharacters
    ) {
      const interruptedTurnId =
        TurnCoordinator.interrupt(
          callId,
          "caller_barge_in"
        );

      try {
        await VoiceWorker.interrupt(
          callId
        );

        createCallLogger(
          callId
        ).info(
          {
            event:
              "voice.barge_in.detected",

            previousState:
              currentState,

            interruptedTurnId,

            transcriptCharacterCount:
              transcript.length,

            final:
              Boolean(
                payload.speech_final ||
                payload.is_final
              ),
          },
          "Caller speech interrupted active AI turn"
        );

        createCallLogger(callId).info(
          { event: "standard.barge_in", interruptedTurnId },
          "Standard generation invalidated by caller interruption"
        );
      } catch (
        error
      ) {
        createCallLogger(
          callId
        ).error(
          {
            event:
              "voice.barge_in.interrupt_failed",

            previousState:
              currentState,

            interruptedTurnId,

            transcriptCharacterCount:
              transcript.length,

            final:
              Boolean(
                payload.speech_final ||
                payload.is_final
              ),

            error:
              error instanceof
                Error
                ? {
                    name:
                      error.name,

                    message:
                      error.message,
                  }
                : {
                    name:
                      "UnknownError",

                    message:
                      String(
                        error
                      ),
                  },
          },
          "Caller barge-in was detected but voice interruption failed"
        );

        throw error;
      }
    }

    const isFinal =
      Boolean(
        payload.speech_final ||
        payload.is_final
      );

    CascadedTurnLatency.markSttPartial(
      callId
    );

    createCallLogger(callId).debug(
      {
        event: isFinal ? "standard.stt.final" : "standard.stt.partial",
        characterCount: transcript.length,
        confidence: alternative?.confidence ?? null,
      },
      "Standard STT progress recorded"
    );

    const log =
      createCallLogger(
        callId
      );

    await TranscriptBuffer.setPartial(
      callId,
      transcript
    );

    if (!isFinal) {
      if (transcript.length >= STANDARD_REALTIME_CONFIG.stablePartialMinCharacters) {
        CascadedTurnLatency.markSttStablePartial(callId);
      }
      StandardPartialPrefetch.observePartial(callId, transcript);
    }

    log.debug(
      {
        event:
          isFinal
            ? "deepgram.transcript.final_received"
            : "deepgram.transcript.partial_received",

        isFinal,

        characterCount:
          transcript.length,

        confidence:
          alternative
            ?.confidence ??
          null,
      },
      isFinal
        ? "Deepgram final transcript received"
        : "Deepgram partial transcript received"
    );

    if (
      isFinal
    ) {
      CascadedTurnLatency.markSttFinal(
        callId
      );

      TranscriptBuffer.flush(
        callId
      );
    }
  }
}
