import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  TranscriptBuffer,
} from "@/services/speech/transcript-buffer.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

type SilenceCallback =
  () =>
    Promise<void> |
    void;

//--------------------------------------------------
// Timer Storage
//--------------------------------------------------

const timers =
  new Map<
    string,
    NodeJS.Timeout
  >();

const DEFAULT_TIMEOUT =
  2000;

//--------------------------------------------------
// Silence Detector
//--------------------------------------------------

export const SilenceDetector =
  {
    start(
      callId: string,
      callback: SilenceCallback,
      timeout =
        DEFAULT_TIMEOUT
    ): void {
      this.stop(
        callId
      );

      const log =
        createCallLogger(
          callId
        );

      log.debug(
        {
          event:
            "silence.timer.started",

          timeoutMilliseconds:
            timeout,
        },
        "Silence timer started"
      );

      const timer =
        setTimeout(
          async () => {
            timers.delete(
              callId
            );

            log.debug(
              {
                event:
                  "silence.detected",

                timeoutMilliseconds:
                  timeout,
              },
              "Silence detected"
            );

            //----------------------------------
            // Flush Transcript First
            //----------------------------------

            TranscriptBuffer.flush(
              callId
            );

            try {
              await callback();
            } catch (
              error
            ) {
              log.error(
                {
                  event:
                    "silence.callback.failed",

                  error:
                    normalizeError(
                      error
                    ),
                },
                "Silence callback failed"
              );
            }
          },
          timeout
        );

      timers.set(
        callId,
        timer
      );
    },

    reset(
      callId: string,
      callback: SilenceCallback,
      timeout =
        DEFAULT_TIMEOUT
    ): void {
      const log =
        createCallLogger(
          callId
        );

      log.debug(
        {
          event:
            "silence.timer.reset",

          timeoutMilliseconds:
            timeout,
        },
        "Silence timer reset"
      );

      this.start(
        callId,
        callback,
        timeout
      );
    },

    stop(
      callId: string
    ): void {
      const timer =
        timers.get(
          callId
        );

      if (
        !timer
      ) {
        return;
      }

      clearTimeout(
        timer
      );

      timers.delete(
        callId
      );

      const log =
        createCallLogger(
          callId
        );

      log.debug(
        {
          event:
            "silence.timer.stopped",
        },
        "Silence timer stopped"
      );
    },

    hasTimer(
      callId: string
    ): boolean {
      return timers.has(
        callId
      );
    },
  };