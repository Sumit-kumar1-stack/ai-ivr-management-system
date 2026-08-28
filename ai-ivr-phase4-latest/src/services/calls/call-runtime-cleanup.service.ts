import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  IVRMenuSessionService,
} from "@/services/ivr/ivr-menu-session.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

//--------------------------------------------------
// Cleanup Runtime
//--------------------------------------------------

export async function cleanupCallRuntime(
  callId: string
): Promise<void> {
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

  const failures:
    string[] =
    [];

  //------------------------------------------------
  // Stop Voice Runtime
  //------------------------------------------------

  try {
    VoiceWorker.stop(
      normalizedCallId
    );
  } catch (
    error
  ) {
    failures.push(
      "voice-worker"
    );

    log.warn(
      {
        event:
          "call.runtime.cleanup_partial_failure",

        resource:
          "voice-worker",

        error:
          normalizeError(
            error
          ),
      },
      "Voice runtime cleanup failed"
    );
  }

  //------------------------------------------------
  // Clear IVR Attempt State
  //------------------------------------------------

  try {
    await IVRMenuSessionService
      .reset(
        normalizedCallId
      );
  } catch (
    error
  ) {
    failures.push(
      "ivr-menu-session"
    );

    log.warn(
      {
        event:
          "call.runtime.cleanup_partial_failure",

        resource:
          "ivr-menu-session",

        error:
          normalizeError(
            error
          ),
      },
      "IVR menu session cleanup failed"
    );
  }

  //------------------------------------------------
  // Result
  //------------------------------------------------

  log.info(
    {
      event:
        "call.runtime.cleanup_completed",

      partialFailureCount:
        failures.length,

      failedResources:
        failures,
    },
    "Call runtime cleanup completed"
  );
}