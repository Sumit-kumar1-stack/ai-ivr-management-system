import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  clearCallPlayback,
  streamToCall,
} from "@/providers/telephony/stream.service";

import {
  ConversationAbort,
} from "@/services/conversations/abort.service";

import {
  ConversationEvents,
} from "@/services/conversations/conversation-events.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  SpeechProduction,
} from "@/services/voice-runtime/speech-production.service";

import {
  TurnCoordinator,
} from "@/services/voice-runtime/turn-coordinator.service";

import {
  AudioRouter,
} from "./audio-router.service";

import {
  PlaybackState,
} from "./playback-state.service";

import {
  sentenceBuffer,
} from "./sentence-buffer.service";

import {
  VoiceService,
} from "./voice.service";

import {
  voiceQueue,
} from "./voice-queue.service";

function sleep(
  milliseconds: number
): Promise<void> {
  return new Promise(
    resolve => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

const runningWorkers =
  new Set<string>();

export class VoiceWorker {
  static async addText(
    callId: string,
    text: string,
    turnId?: number
  ): Promise<boolean> {
    const log =
      createCallLogger(
        callId
      );

    if (
      !AudioSessionService.getByCallId(
        callId
      )
    ) {
      log.warn(
        {
          callId,
        },
        "Skipping TTS because call session does not exist"
      );

      return false;
    }

    const normalizedText =
      text.trim();

    if (
      !normalizedText
    ) {
      return false;
    }

    if (
      turnId !== undefined &&
      !TurnCoordinator.isCurrent(
        callId,
        turnId
      )
    ) {
      log.info(
        {
          event:
            "voice.tts.skipped_stale_turn",
          turnId,
          currentTurnId:
            TurnCoordinator.getCurrentTurnId(
              callId
            ),
          textLength:
            normalizedText.length,
        },
        "Skipping TTS because conversation turn is stale"
      );

      return false;
    }

    const initialState =
      ConversationStateService.getState(
        callId
      );

    if (
      initialState === "ENDED" ||
      initialState === "INTERRUPTING" ||
      initialState === "INTERRUPTED"
    ) {
      log.warn(
        {
          callId,
          state:
            initialState,
        },
        "Skipping TTS because call is not active"
      );

      return false;
    }

    try {
      const tts =
        await VoiceService.synthesize(
          callId,
          normalizedText
        );

      if (
        turnId !== undefined &&
        !TurnCoordinator.isCurrent(
          callId,
          turnId
        )
      ) {
        log.info(
          {
            event:
              "voice.tts.discarded_stale_turn",
            turnId,
            currentTurnId:
              TurnCoordinator.getCurrentTurnId(
                callId
              ),
            generatedAudioBytes:
              Buffer.isBuffer(
                tts.audio
              )
                ? tts.audio.length
                : 0,
            textLength:
              normalizedText.length,
          },
          "Generated TTS discarded because a newer turn owns the call"
        );

        return false;
      }

      if (
        !AudioSessionService.getByCallId(
          callId
        )
      ) {
        log.warn(
          {
            callId,
          },
          "Discarding generated speech because call session ended"
        );

        return false;
      }

      const stateAfterTts =
        ConversationStateService.getState(
          callId
        );

      if (
        stateAfterTts === "ENDED" ||
        stateAfterTts === "INTERRUPTING" ||
        stateAfterTts === "INTERRUPTED"
      ) {
        log.warn(
          {
            callId,
            state:
              stateAfterTts,
          },
          "Discarding generated speech because call is not active"
        );

        return false;
      }

      if (
        !Buffer.isBuffer(
          tts.audio
        )
      ) {
        throw new TypeError(
          `TTS audio is not a Buffer for call ${callId}`
        );
      }

      if (
        tts.audio.length === 0
      ) {
        throw new Error(
          `TTS returned empty audio for call ${callId}`
        );
      }

      voiceQueue.enqueue(
        callId,
        tts
      );

      log.debug(
        {
          callId,
          textLength:
            normalizedText.length,
          bytes:
            tts.audio.length,
          queueSize:
            voiceQueue.size(
              callId
            ),
        },
        "Audio added to voice queue"
      );

      return true;
    } catch (
      error: unknown
    ) {
      log.error(
        {
          error,
          callId,
          textLength:
            normalizedText.length,
        },
        "Failed to synthesize speech"
      );

      return false;
    }
  }

  static async interrupt(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    const state =
      ConversationStateService.getState(
        callId
      );

    if (
      state === "INTERRUPTING" ||
      state === "INTERRUPTED" ||
      state === "ENDED"
    ) {
      return;
    }

    log.warn(
      {
        callId,
        state,
      },
      "Voice playback interrupted"
    );

    ConversationStateService.setState(
      callId,
      "INTERRUPTING"
    );

    voiceQueue.clear(
      callId
    );

    sentenceBuffer.clear(
      callId
    );

    SpeechProduction.clear(
      callId
    );

    ConversationAbort.abort(
      callId
    );

    PlaybackState.stop(
      callId
    );

    const playbackCleared =
      clearCallPlayback(
        callId
      );

    ConversationStateService.setState(
      callId,
      "INTERRUPTED"
    );

    log.debug(
      {
        callId,
        twilioPlaybackCleared:
          playbackCleared,
      },
      "Twilio playback interruption processed"
    );

    await EventPublisher.publish(
      AppEvent.VOICE_INTERRUPTED,
      {
        callId,
        timestamp:
          Date.now(),
      }
    );

    if (
      AudioSessionService.getByCallId(
        callId
      )
    ) {
      ConversationStateService.setState(
        callId,
        "LISTENING"
      );

      ConversationEvents.emit(
        "listening",
        callId
      );
    }
  }

  static stop(
    callId: string
  ): void {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    const log =
      createCallLogger(
        normalizedCallId
      );

    const previousState =
      ConversationStateService.getState(
        normalizedCallId
      );

    const workerWasRunning =
      runningWorkers.has(
        normalizedCallId
      );

    log.info(
      {
        event:
          "voice.worker.stop_started",
        previousState,
        workerWasRunning,
      },
      "Stopping voice worker"
    );

    if (
      previousState !== "ENDED"
    ) {
      ConversationStateService.setState(
        normalizedCallId,
        "ENDED"
      );
    }

    PlaybackState.stop(
      normalizedCallId
    );

    clearCallPlayback(
      normalizedCallId
    );

    voiceQueue.clear(
      normalizedCallId
    );

    sentenceBuffer.clear(
      normalizedCallId
    );

    SpeechProduction.clear(
      normalizedCallId
    );

    ConversationAbort.abort(
      normalizedCallId
    );

    ConversationAbort.clear(
      normalizedCallId
    );

    runningWorkers.delete(
      normalizedCallId
    );

    log.info(
      {
        event:
          "voice.worker.stop_completed",
        previousState,
        workerWasRunning,
        queueSize:
          voiceQueue.size(
            normalizedCallId
          ),
      },
      "Voice worker stopped"
    );
  }

  static async start(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    if (
      runningWorkers.has(
        callId
      )
    ) {
      log.debug(
        {
          callId,
        },
        "Voice worker already running"
      );

      return;
    }

    runningWorkers.add(
      callId
    );

    log.info(
      {
        callId,
      },
      "Voice worker started"
    );

    try {
      while (
        true
      ) {
        const state =
          ConversationStateService.getState(
            callId
          );

        if (
          state === "ENDED"
        ) {
          PlaybackState.stop(
            callId
          );

          voiceQueue.clear(
            callId
          );

          sentenceBuffer.clear(
            callId
          );

          SpeechProduction.clear(
            callId
          );

          ConversationAbort.abort(
            callId
          );

          ConversationAbort.clear(
            callId
          );

          log.info(
            {
              event:
                "voice.worker.ended",
            },
            "Conversation ended; stopping voice worker"
          );

          return;
        }

        if (
          !AudioSessionService.getByCallId(
            callId
          )
        ) {
          log.warn(
            {
              event:
                "voice.worker.session_missing",
            },
            "Call session no longer exists; stopping voice worker"
          );

          this.stop(
            callId
          );

          return;
        }

        if (
          state === "INTERRUPTING" ||
          state === "INTERRUPTED"
        ) {
          PlaybackState.stop(
            callId
          );

          voiceQueue.clear(
            callId
          );

          sentenceBuffer.clear(
            callId
          );

          SpeechProduction.clear(
            callId
          );

          clearCallPlayback(
            callId
          );

          if (
            AudioSessionService.getByCallId(
              callId
            )
          ) {
            ConversationStateService.setState(
              callId,
              "LISTENING"
            );

            ConversationEvents.emit(
              "listening",
              callId
            );
          }

          log.warn(
            {
              callId,
            },
            "Playback interrupted; returning to LISTENING"
          );

          await sleep(
            20
          );

          continue;
        }

        if (
          !voiceQueue.hasItems(
            callId
          )
        ) {
          const currentState =
            ConversationStateService.getState(
              callId
            );

          const speechProductionActive =
            SpeechProduction.isActive(
              callId
            );

          if (
            currentState === "THINKING" &&
            !speechProductionActive &&
            AudioSessionService.getByCallId(
              callId
            )
          ) {
            ConversationStateService.setState(
              callId,
              "LISTENING"
            );

            ConversationEvents.emit(
              "listening",
              callId
            );

            log.info(
              {
                event:
                  "voice.production.completed_without_pending_audio",
              },
              "Speech production completed with no pending playback"
            );
          }

          await sleep(
            15
          );

          continue;
        }

        const audio =
          voiceQueue.dequeue(
            callId
          );

        log.debug(
          {
            callId,
            queueSize:
              voiceQueue.size(
                callId
              ),
          },
          "Voice queue status"
        );

        if (
          !audio
        ) {
          await sleep(
            10
          );

          continue;
        }

        const currentState =
          ConversationStateService.getState(
            callId
          );

        if (
          currentState === "ENDED" ||
          currentState === "INTERRUPTING" ||
          currentState === "INTERRUPTED"
        ) {
          continue;
        }

        if (
          !Buffer.isBuffer(
            audio.audio
          )
        ) {
          log.error(
            {
              callId,
            },
            "Queued audio is not a Buffer"
          );

          continue;
        }

        if (
          audio.audio.length === 0
        ) {
          log.warn(
            {
              callId,
            },
            "Skipping empty queued audio"
          );

          continue;
        }

        PlaybackState.start(
          callId
        );

        ConversationStateService.setState(
          callId,
          "SPEAKING"
        );

        log.info(
          {
            callId,
            queueRemaining:
              voiceQueue.size(
                callId
              ),
            bytes:
              audio.audio.length,
          },
          "Playing queued audio"
        );

        try {
          if (
            !AudioSessionService.getByCallId(
              callId
            )
          ) {
            ConversationStateService.setState(
              callId,
              "ENDED"
            );

            return;
          }

          await AudioRouter.routeOutgoing({
            callId,
            data:
              audio.audio,
            timestamp:
              Date.now(),
          });

          if (
            !AudioSessionService.getByCallId(
              callId
            )
          ) {
            ConversationStateService.setState(
              callId,
              "ENDED"
            );

            return;
          }

          await streamToCall(
            callId,
            audio
          );

          log.debug(
            {
              callId,
              bytes:
                audio.audio.length,
            },
            "Queued audio streamed successfully"
          );
        } catch (
          error: unknown
        ) {
          log.error(
            {
              error,
              callId,
            },
            "Audio playback failed"
          );

          const failureState =
            ConversationStateService.getState(
              callId
            );

          if (
            failureState !== "ENDED" &&
            failureState !== "INTERRUPTING" &&
            failureState !== "INTERRUPTED" &&
            AudioSessionService.getByCallId(
              callId
            )
          ) {
            ConversationStateService.setState(
              callId,
              "LISTENING"
            );

            ConversationEvents.emit(
              "listening",
              callId
            );
          }
        } finally {
          PlaybackState.stop(
            callId
          );
        }

        const stateAfterPlayback =
          ConversationStateService.getState(
            callId
          );

        const hasMoreAudio =
          voiceQueue.hasItems(
            callId
          );

        const speechProductionActive =
          SpeechProduction.isActive(
            callId
          );

        if (
          stateAfterPlayback === "SPEAKING" &&
          !hasMoreAudio &&
          speechProductionActive &&
          AudioSessionService.getByCallId(
            callId
          )
        ) {
          ConversationStateService.setState(
            callId,
            "THINKING"
          );

          log.debug(
            {
              event:
                "voice.playback.waiting_for_production",
              activeTurnId:
                SpeechProduction.getTurnId(
                  callId
                ),
            },
            "Playback queue empty while current turn is still producing speech"
          );
        } else if (
          stateAfterPlayback === "SPEAKING" &&
          !hasMoreAudio &&
          !speechProductionActive &&
          AudioSessionService.getByCallId(
            callId
          )
        ) {
          ConversationStateService.setState(
            callId,
            "LISTENING"
          );

          ConversationEvents.emit(
            "listening",
            callId
          );

          log.info(
            {
              event:
                "voice.playback.completed",
            },
            "All speech production and playback finished; returning to LISTENING"
          );
        } else if (
          stateAfterPlayback === "SPEAKING" &&
          hasMoreAudio
        ) {
          log.debug(
            {
              event:
                "voice.playback.queue_continues",
              queueRemaining:
                voiceQueue.size(
                  callId
                ),
            },
            "More audio remains queued; keeping SPEAKING state"
          );
        }

        await sleep(
          5
        );
      }
    } catch (
      error: unknown
    ) {
      log.error(
        {
          error,
          callId,
        },
        "Voice worker crashed"
      );

      PlaybackState.stop(
        callId
      );

      SpeechProduction.clear(
        callId
      );

      const state =
        ConversationStateService.getState(
          callId
        );

      if (
        state !== "ENDED" &&
        AudioSessionService.getByCallId(
          callId
        )
      ) {
        ConversationStateService.setState(
          callId,
          "LISTENING"
        );

        ConversationEvents.emit(
          "listening",
          callId
        );
      }
    } finally {
      runningWorkers.delete(
        callId
      );

      PlaybackState.stop(
        callId
      );

      const finalState =
        ConversationStateService.getState(
          callId
        );

      if (
        finalState === "ENDED"
      ) {
        ConversationAbort.clear(
          callId
        );

        SpeechProduction.clear(
          callId
        );
      }

      log.info(
        {
          event:
            "voice.worker.execution_finished",
          finalState,
        },
        "Voice worker execution finished"
      );
    }
  }

  static isRunning(
    callId: string
  ): boolean {
    return runningWorkers.has(
      callId
    );
  }
}