import {
  redisConnection,
} from "@/lib/redis";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const SESSION_TTL_SECONDS =
  60 * 60;

const KEY_PREFIX =
  "ivr:menu-session";

//--------------------------------------------------
// Types
//--------------------------------------------------

export type IVRMenuFailureReason =
  | "INVALID"
  | "TIMEOUT";

export interface IVRMenuAttemptState {
  attempts: number;

  maxAttempts: number;

  remainingAttempts: number;

  exhausted: boolean;

  lastFailure:
    | IVRMenuFailureReason
    | null;
}

//--------------------------------------------------
// Key
//--------------------------------------------------

function buildKey(
  callId: string
): string {
  return `${KEY_PREFIX}:${callId}`;
}

//--------------------------------------------------
// Normalize Maximum
//--------------------------------------------------

function normalizeMaxAttempts(
  maxAttempts: number
): number {
  if (
    Number.isInteger(
      maxAttempts
    ) &&
    maxAttempts >= 1 &&
    maxAttempts <= 5
  ) {
    return maxAttempts;
  }

  return 3;
}

//--------------------------------------------------
// Parse State
//--------------------------------------------------

function parseStoredState(
  raw: string | null,
  maxAttempts: number
): IVRMenuAttemptState {
  const safeMaxAttempts =
    normalizeMaxAttempts(
      maxAttempts
    );

  if (
    !raw
  ) {
    return {
      attempts:
        0,

      maxAttempts:
        safeMaxAttempts,

      remainingAttempts:
        safeMaxAttempts,

      exhausted:
        false,

      lastFailure:
        null,
    };
  }

  try {
    const parsed =
      JSON.parse(
        raw
      ) as Partial<
        IVRMenuAttemptState
      >;

    const attempts =
      typeof parsed.attempts ===
        "number" &&
      Number.isInteger(
        parsed.attempts
      ) &&
      parsed.attempts >= 0
        ? parsed.attempts
        : 0;

    const exhausted =
      attempts >=
      safeMaxAttempts;

    return {
      attempts,

      maxAttempts:
        safeMaxAttempts,

      remainingAttempts:
        Math.max(
          0,
          safeMaxAttempts -
            attempts
        ),

      exhausted,

      lastFailure:
        parsed.lastFailure ===
          "INVALID" ||
        parsed.lastFailure ===
          "TIMEOUT"
          ? parsed.lastFailure
          : null,
    };
  } catch {
    return {
      attempts:
        0,

      maxAttempts:
        safeMaxAttempts,

      remainingAttempts:
        safeMaxAttempts,

      exhausted:
        false,

      lastFailure:
        null,
    };
  }
}

//--------------------------------------------------
// Service
//--------------------------------------------------

export const IVRMenuSessionService = {
  //------------------------------------------------
  // Get
  //------------------------------------------------

  async getState(
    callId: string,
    maxAttempts: number
  ): Promise<IVRMenuAttemptState> {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return parseStoredState(
        null,
        maxAttempts
      );
    }

    const raw =
      await redisConnection.get(
        buildKey(
          normalizedCallId
        )
      );

    return parseStoredState(
      raw,
      maxAttempts
    );
  },

  //------------------------------------------------
  // Record Failure
  //------------------------------------------------

  async recordFailure(
    callId: string,
    maxAttempts: number,
    reason: IVRMenuFailureReason
  ): Promise<IVRMenuAttemptState> {
    const normalizedCallId =
      callId.trim();

    const safeMaxAttempts =
      normalizeMaxAttempts(
        maxAttempts
      );

    if (
      !normalizedCallId
    ) {
      return {
        attempts:
          safeMaxAttempts,

        maxAttempts:
          safeMaxAttempts,

        remainingAttempts:
          0,

        exhausted:
          true,

        lastFailure:
          reason,
      };
    }

    const key =
      buildKey(
        normalizedCallId
      );

    /*
     * Read/update/write is intentionally serialized
     * using WATCH/MULTI so simultaneous Twilio
     * callbacks cannot lose an attempt.
     */
    for (
      let retry = 0;
      retry < 3;
      retry += 1
    ) {
      await redisConnection.watch(
        key
      );

      try {
        const currentRaw =
          await redisConnection.get(
            key
          );

        const current =
          parseStoredState(
            currentRaw,
            safeMaxAttempts
          );

        const attempts =
          Math.min(
            current.attempts + 1,
            safeMaxAttempts
          );

        const nextState:
          IVRMenuAttemptState =
          {
            attempts,

            maxAttempts:
              safeMaxAttempts,

            remainingAttempts:
              Math.max(
                0,
                safeMaxAttempts -
                  attempts
              ),

            exhausted:
              attempts >=
              safeMaxAttempts,

            lastFailure:
              reason,
          };

        const transaction =
          redisConnection.multi();

        transaction.set(
          key,
          JSON.stringify(
            nextState
          )
        );

        transaction.expire(
          key,
          SESSION_TTL_SECONDS
        );

        const result =
          await transaction.exec();

        /*
         * null means WATCH detected a concurrent
         * modification. Retry with fresh state.
         */
        if (
          result !==
          null
        ) {
          return nextState;
        }
      } finally {
        await redisConnection.unwatch();
      }
    }

    /*
     * Extremely rare contention fallback.
     * Fail closed so callers cannot loop forever.
     */
    return {
      attempts:
        safeMaxAttempts,

      maxAttempts:
        safeMaxAttempts,

      remainingAttempts:
        0,

      exhausted:
        true,

      lastFailure:
        reason,
    };
  },

  //------------------------------------------------
  // Reset
  //------------------------------------------------

  async reset(
    callId: string
  ): Promise<void> {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    await redisConnection.del(
      buildKey(
        normalizedCallId
      )
    );
  },
};