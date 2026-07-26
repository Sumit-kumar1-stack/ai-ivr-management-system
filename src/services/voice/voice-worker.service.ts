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
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

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

/**
 * Pause execution without blocking Node.js.
 */
function sleep(
  milliseconds: number
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

/**
 * Prevent multiple playback workers from
 * running for the same call.
 */
const runningWorkers =
  new Set<string>();

export class VoiceWorker {
  //------------------------------------------------
  // Convert text to audio and enqueue it
  //------------------------------------------------

  static async addText(
    callId: string,
    text: string
  ): Promise<boolean> {
    const log =
      createCallLogger(
        callId
      );

    //----------------------------------------
    // Confirm call exists before TTS
    //----------------------------------------

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

    if (!normalizedText) {
      return false;
    }

    //----------------------------------------
    // Do not start TTS after call ended
    //----------------------------------------

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
      //----------------------------------------
      // Generate speech
      //----------------------------------------

      const tts =
        await VoiceService.synthesize(
          callId,
          normalizedText
        );

      //----------------------------------------
      // Call may have ended during TTS
      //----------------------------------------

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

      //----------------------------------------
      // Check state again after TTS
      //----------------------------------------

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

      //----------------------------------------
      // Validate generated audio
      //----------------------------------------

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

      //----------------------------------------
      // Queue generated audio
      //----------------------------------------

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
    } catch (error) {
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

  //------------------------------------------------
  // Interrupt current playback
  //------------------------------------------------

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

    //----------------------------------------
    // Mark interruption first
    //----------------------------------------

    ConversationStateService.setState(
      callId,
      "INTERRUPTING"
    );

    //----------------------------------------
    // Clear pending speech
    //----------------------------------------

    voiceQueue.clear(
      callId
    );

    sentenceBuffer.clear(
      callId
    );

    //----------------------------------------
    // Abort active conversation work
    //----------------------------------------

    ConversationAbort.abort(
      callId
    );

    //----------------------------------------
    // Stop local playback
    //----------------------------------------

    PlaybackState.stop(
      callId
    );

    //----------------------------------------
    // Clear Twilio playback buffer
    //----------------------------------------

    const playbackCleared =
      clearCallPlayback(
        callId
      );

    //----------------------------------------
    // Mark interruption complete
    //----------------------------------------

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

    //----------------------------------------
    // Publish interruption event
    //----------------------------------------

    await EventPublisher.publish(
      AppEvent.VOICE_INTERRUPTED,
      {
        callId,

        timestamp:
          Date.now(),
      }
    );

    //----------------------------------------
    // Return to listening if call exists
    //----------------------------------------

    if (
      AudioSessionService.getByCallId(
        callId
      )
    ) {
      ConversationStateService.setState(
        callId,
        "LISTENING"
      );
    }
  }

  //------------------------------------------------
  // Stop worker and clean resources
  //------------------------------------------------

  static stop(
    callId: string
  ): void {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      {
        callId,
      },
      "Stopping voice worker"
    );

    //----------------------------------------
    // End conversation
    //----------------------------------------

    ConversationStateService.setState(
      callId,
      "ENDED"
    );

    //----------------------------------------
    // Stop local playback
    //----------------------------------------

    PlaybackState.stop(
      callId
    );

    //----------------------------------------
    // Clear Twilio playback
    //----------------------------------------

    clearCallPlayback(
      callId
    );

    //----------------------------------------
    // Clear queues and buffers
    //----------------------------------------

    voiceQueue.clear(
      callId
    );

    sentenceBuffer.clear(
      callId
    );

    //----------------------------------------
    // Abort conversation operation
    //----------------------------------------

    ConversationAbort.abort(
      callId
    );

    //----------------------------------------
    // Release worker lock
    //----------------------------------------

    runningWorkers.delete(
      callId
    );

    log.info(
      {
        callId,
      },
      "Voice worker stopped"
    );
  }

  //------------------------------------------------
  // Start playback worker
  //------------------------------------------------

  static async start(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    //----------------------------------------
    // Prevent duplicate workers
    //----------------------------------------

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
      while (true) {
        //----------------------------------------
        // Read current state
        //----------------------------------------

        const state =
          ConversationStateService.getState(
            callId
          );

        //----------------------------------------
        // Conversation ended
        //----------------------------------------

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

          log.info(
            {
              callId,
            },
            "Conversation ended; stopping voice worker"
          );

          return;
        }

        //----------------------------------------
        // Call session disappeared
        //----------------------------------------

        if (
          !AudioSessionService.getByCallId(
            callId
          )
        ) {
          log.warn(
            {
              callId,
            },
            "Call session no longer exists; stopping voice worker"
          );

          ConversationStateService.setState(
            callId,
            "ENDED"
          );

          PlaybackState.stop(
            callId
          );

          voiceQueue.clear(
            callId
          );

          sentenceBuffer.clear(
            callId
          );

          ConversationAbort.abort(
            callId
          );

          return;
        }

        //----------------------------------------
        // Playback interrupted
        //----------------------------------------

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

        //----------------------------------------
        // Queue empty
        //----------------------------------------

        if (
          !voiceQueue.hasItems(
            callId
          )
        ) {
          await sleep(
            15
          );

          continue;
        }

        //----------------------------------------
        // Dequeue next audio
        //----------------------------------------

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

        if (!audio) {
          await sleep(
            10
          );

          continue;
        }

        //----------------------------------------
        // Do not speak after end/interruption
        //----------------------------------------

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

        //----------------------------------------
        // Validate queued audio
        //----------------------------------------

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

        //----------------------------------------
        // Start speaking state
        //----------------------------------------

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
          //----------------------------------------
          // Confirm session before routing
          //----------------------------------------

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

          //----------------------------------------
          // Route outgoing audio
          //----------------------------------------

          await AudioRouter.routeOutgoing({
            callId,

            data:
              audio.audio,

            timestamp:
              Date.now(),
          });

          //----------------------------------------
          // Confirm session after routing
          //----------------------------------------

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

          //----------------------------------------
          // Stream audio to Twilio
          //----------------------------------------

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
        } catch (error) {
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
          }
        } finally {
          PlaybackState.stop(
            callId
          );
        }

        //----------------------------------------
        // Return to LISTENING only when all
        // queued audio has finished
        //----------------------------------------

        const stateAfterPlayback =
          ConversationStateService.getState(
            callId
          );

        const hasMoreAudio =
          voiceQueue.hasItems(
            callId
          );

        if (
          stateAfterPlayback === "SPEAKING" &&
          !hasMoreAudio &&
          AudioSessionService.getByCallId(
            callId
          )
        ) {
          ConversationStateService.setState(
            callId,
            "LISTENING"
          );

          log.info(
            {
              callId,
            },
            "All queued audio finished; returning to LISTENING"
          );
        } else if (
          stateAfterPlayback === "SPEAKING" &&
          hasMoreAudio
        ) {
          log.debug(
            {
              callId,

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
    } catch (error) {
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
      }
    } finally {
      runningWorkers.delete(
        callId
      );

      PlaybackState.stop(
        callId
      );

      log.info(
        {
          callId,
        },
        "Voice worker execution finished"
      );
    }
  }

  //------------------------------------------------
  // Worker status
  //------------------------------------------------

  static isRunning(
    callId: string
  ): boolean {
    return runningWorkers.has(
      callId
    );
  }
}