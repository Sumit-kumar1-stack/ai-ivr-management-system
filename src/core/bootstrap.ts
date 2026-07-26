import {
  EventRegistry,
} from "./events";

import {
  TranscriptSubscriber,
} from "@/services/speech/transcript.subscriber";

import {
  RealtimeSubscriber,
} from "@/services/realtime/realtime-subscriber";

//--------------------------------------------------
// Process-Global Bootstrap State
//--------------------------------------------------

type BootstrapGlobal =
  typeof globalThis & {
    __ivrApplicationBootstrapped?:
      boolean;
  };

const bootstrapGlobal =
  globalThis as BootstrapGlobal;

//--------------------------------------------------
// Initialize Application Subscribers
//--------------------------------------------------

export function bootstrap():
  void {
  if (
    bootstrapGlobal
      .__ivrApplicationBootstrapped
  ) {
    console.log(
      "Application already bootstrapped"
    );

    return;
  }

  /*
   * Claim initialization before registering
   * subscribers. This prevents simultaneous imports
   * from registering the same handlers twice.
   */
  bootstrapGlobal
    .__ivrApplicationBootstrapped =
    true;

  try {
    EventRegistry.initialize();

    TranscriptSubscriber.register();

    RealtimeSubscriber.register();

    console.log(
      "Application bootstrapped"
    );
  } catch (
    error
  ) {
    /*
     * Allow another attempt if initialization failed
     * before completing.
     */
    bootstrapGlobal
      .__ivrApplicationBootstrapped =
      false;

    console.error(
      "Application bootstrap failed",
      {
        error:
          normalizeError(
            error
          ),
      }
    );

    throw error;
  }
}

//--------------------------------------------------
// Reset Bootstrap State
//--------------------------------------------------

export function resetBootstrapState():
  void {
  bootstrapGlobal
    .__ivrApplicationBootstrapped =
    false;
}

//--------------------------------------------------
// Normalize Error
//--------------------------------------------------

function normalizeError(
  error: unknown
) {
  if (
    error instanceof
    Error
  ) {
    return {
      name:
        error.name,

      message:
        error.message,

      stack:
        error.stack,
    };
  }

  return {
    message:
      String(
        error
      ),
  };
}