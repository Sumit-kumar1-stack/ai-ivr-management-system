import {
  createCallLogger,
} from "@/lib/logger";

import {
  VoiceService,
} from "./voice.service";

import {
  voiceQueue,
} from "./voice-queue.service";

import {
  PlaybackState,
} from "./playback-state.service";

import {
  clearCallPlayback,
  streamToCall,
} from "@/providers/telephony/stream.service";


import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  AudioRouter,
} from "./audio-router.service";

import {
  sentenceBuffer,
} from "./sentence-buffer.service";

import {
  EventPublisher,
  AppEvent,
} from "@/core/events";

import {
  ConversationAbort,
} from "@/services/conversations/abort.service";


function sleep(
  ms: number
): Promise<void> {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}


/**
 * Prevent multiple workers from running
 * for the same internal call ID.
 */
const runningWorkers =
  new Set<string>();


export class VoiceWorker {

  //------------------------------------------------
  // Convert text → audio → queue
  //------------------------------------------------

  static async addText(
    callId: string,
    text: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    const normalizedText =
      text.trim();

    if (!normalizedText) {
      return;
    }

    try {
      //----------------------------------------
      // Generate TTS audio once
      //----------------------------------------

      const tts =
        await VoiceService.synthesize(
          callId,
          normalizedText
        );

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
          textLength:
            normalizedText.length,

          bytes:
            tts.audio.length,

          queueSize:
            voiceQueue.size(
              callId
            ),
        },
        "Audio added to queue"
      );
    } catch (error) {
      log.error(
        {
          error,
          textLength:
            normalizedText.length,
        },
        "Failed to synthesize speech"
      );
    }
  }


  //------------------------------------------------
  // Interrupt playback
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
      state === "ENDED"
    ) {
      return;
    }

    log.warn(
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
    // Clear pending generated speech
    //----------------------------------------

    voiceQueue.clear(
      callId
    );

    sentenceBuffer.clear(
      callId
    );

    //----------------------------------------
    // Abort active LLM/conversation work
    //----------------------------------------

    ConversationAbort.abort(
      callId
    );

    //----------------------------------------
    // Stop local playback state
    //----------------------------------------

    PlaybackState.stop(
      callId
    );

    //----------------------------------------
    // Clear audio already buffered by Twilio
    //----------------------------------------

    const cleared =
      clearCallPlayback(
        callId
      );

    log.debug(
      {
        twilioPlaybackCleared:
          cleared,
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
  }


  //------------------------------------------------
  // Stop worker
  //------------------------------------------------

  static stop(
    callId: string
  ): void {
    const log =
      createCallLogger(
        callId
      );

    log.info(
      "Stopping voice worker"
    );

    //----------------------------------------
    // End conversation first
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
    // Clear Twilio buffered playback
    //----------------------------------------

    clearCallPlayback(
      callId
    );

    //----------------------------------------
    // Clear queued and buffered content
    //----------------------------------------

    voiceQueue.clear(
      callId
    );

    sentenceBuffer.clear(
      callId
    );

    //----------------------------------------
    // Abort active conversation operation
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
      "Voice worker stopped"
    );
  }


  //------------------------------------------------
  // Playback worker
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
        "Voice worker already running"
      );

      return;
    }

    runningWorkers.add(
      callId
    );

    log.info(
      "Voice worker started"
    );

    try {
      while (true) {
        //----------------------------------------
        // Read current conversation state
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
            "Conversation ended; stopping voice worker"
          );

          return;
        }

        //----------------------------------------
        // Playback interrupted
        //----------------------------------------

        if (
          state === "INTERRUPTING"
        ) {
          PlaybackState.stop(
            callId
          );

          voiceQueue.clear(
            callId
          );

          clearCallPlayback(
            callId
          );

          ConversationStateService.setState(
            callId,
            "LISTENING"
          );

          log.warn(
            "Playback interrupted, returning to LISTENING"
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
        // Get next queued audio item
        //----------------------------------------

        const audio =
          voiceQueue.dequeue(
            callId
          );

        log.debug(
          {
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
        // Do not speak after call ended
        //----------------------------------------

        const currentState =
          ConversationStateService.getState(
            callId
          );

        if (
          currentState === "ENDED" ||
          currentState === "INTERRUPTING"
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
              audio,
            },
            "Queued audio is not a Buffer"
          );

          continue;
        }

        if (
          audio.audio.length === 0
        ) {
          log.warn(
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
          // Observation/routing hook
          //----------------------------------------

          await AudioRouter.routeOutgoing({
            callId,

            data:
              audio.audio,

            timestamp:
              Date.now(),
          });

          //----------------------------------------
          // Stream queued audio to Twilio
          //----------------------------------------

          await streamToCall(
            callId,
            audio
          );

          log.debug(
            {
              bytes:
                audio.audio.length,
            },
            "Queued audio streamed successfully"
          );
        } catch (error) {
          log.error(
            {
              error,
            },
            "Audio playback failed"
          );

          const failureState =
            ConversationStateService.getState(
              callId
            );

          if (
            failureState !== "ENDED" &&
            failureState !== "INTERRUPTING"
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
        // Return to listening after playback
        //----------------------------------------

        if (
          ConversationStateService.getState(
            callId
          ) === "SPEAKING"
        ) {
          ConversationStateService.setState(
            callId,
            "LISTENING"
          );
        }

        //----------------------------------------
        // Yield to event loop
        //----------------------------------------

        await sleep(
          5
        );
      }
    } catch (error) {
      log.error(
        {
          error,
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
        state !== "ENDED"
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