import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

//--------------------------------------------------
// Production Resilience Limits
//--------------------------------------------------

const MAX_RECONNECT_ATTEMPTS =
  3;

const MAX_CONSECUTIVE_AUDIO_FAILURES =
  5;

const MAX_CONSECUTIVE_TOOL_FAILURES =
  3;

const DEFAULT_TOOL_TIMEOUT_MS =
  10_000;

const GO_AWAY_RECONNECT_LEAD_MS =
  1_500;

//--------------------------------------------------
// Session Resumption Update
//--------------------------------------------------

export interface GeminiLiveResumptionUpdate {
  resumable?:
    boolean;

  newHandle?:
    string;

  lastConsumedClientMessageIndex?:
    string;
}

//--------------------------------------------------
// GoAway State
//--------------------------------------------------

export interface GeminiLiveGoAwayState {
  receivedAt:
    number;

  timeLeftMs:
    number |
    null;

  disconnectDeadline:
    number |
    null;
}

//--------------------------------------------------
// Resilience Snapshot
//--------------------------------------------------

export interface GeminiLiveResilienceSnapshot {
  callId:
    string;

  connectionStartedAt:
    number |
    null;

  latestResumptionHandle:
    string |
    null;

  resumable:
    boolean;

  lastConsumedClientMessageIndex:
    string |
    null;

  reconnectAttempts:
    number;

  consecutiveAudioFailures:
    number;

  consecutiveToolFailures:
    number;

  totalAudioFailures:
    number;

  totalToolFailures:
    number;

  goAway:
    GeminiLiveGoAwayState |
    null;
}

//--------------------------------------------------
// Internal State
//--------------------------------------------------

interface GeminiLiveResilienceState {
  callId:
    string;

  connectionStartedAt:
    number |
    null;

  latestResumptionHandle:
    string |
    null;

  resumable:
    boolean;

  lastConsumedClientMessageIndex:
    string |
    null;

  reconnectAttempts:
    number;

  consecutiveAudioFailures:
    number;

  consecutiveToolFailures:
    number;

  totalAudioFailures:
    number;

  totalToolFailures:
    number;

  goAway:
    GeminiLiveGoAwayState |
    null;
}

//--------------------------------------------------
// Failure Result
//--------------------------------------------------

export interface GeminiLiveFailureResult {
  count:
    number;

  terminate:
    boolean;
}

//--------------------------------------------------
// Reconnect Result
//--------------------------------------------------

export interface GeminiLiveReconnectResult {
  allowed:
    boolean;

  attempt:
    number;

  maxAttempts:
    number;

  resumeHandle:
    string |
    null;
}

//--------------------------------------------------
// Timeout Error
//--------------------------------------------------

export class GeminiLiveOperationTimeoutError
  extends Error {
  readonly code =
    "GEMINI_LIVE_OPERATION_TIMEOUT";

  readonly operation:
    string;

  readonly timeoutMs:
    number;

  constructor(
    operation:
      string,

    timeoutMs:
      number
  ) {
    super(
      `Gemini Live operation timed out: ${operation}`
    );

    this.name =
      "GeminiLiveOperationTimeoutError";

    this.operation =
      operation;

    this.timeoutMs =
      timeoutMs;
  }
}

//--------------------------------------------------
// Resilience Manager
//--------------------------------------------------

class GeminiLiveResilienceManager {
  private readonly states =
    new Map<
      string,
      GeminiLiveResilienceState
    >();

  //------------------------------------------------
  // Begin Connection
  //------------------------------------------------

  beginConnection(
    callId:
      string
  ): GeminiLiveResilienceSnapshot {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const state =
      this.ensureState(
        normalizedCallId
      );

    state.connectionStartedAt =
      Date.now();

    state.consecutiveAudioFailures =
      0;

    state.consecutiveToolFailures =
      0;

    /*
     * Do not clear:
     *
     * latestResumptionHandle
     * reconnectAttempts
     *
     * here because this may be a replacement
     * WebSocket for the same Gemini Live session.
     */

    state.goAway =
      null;

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.info(
      {
        event:
          "gemini.live.resilience_connection_started",

        reconnectAttempts:
          state.reconnectAttempts,

        resumeHandlePresent:
          Boolean(
            state
              .latestResumptionHandle
          ),
      },
      "Gemini Live resilient connection started"
    );

    return cloneState(
      state
    );
  }

  //------------------------------------------------
  // Session Resumption Update
  //------------------------------------------------

  noteSessionResumptionUpdate(
    callId:
      string,

    update:
      GeminiLiveResumptionUpdate
  ): void {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const state =
      this.ensureState(
        normalizedCallId
      );

    const resumable =
      update.resumable ===
      true;

    state.resumable =
      resumable;

    //------------------------------------------------
    // Save Latest Valid Handle
    //------------------------------------------------

    const newHandle =
      update
        .newHandle
        ?.trim() ??
      "";

    if (
      resumable &&
      newHandle
    ) {
      state.latestResumptionHandle =
        newHandle;
    }

    //------------------------------------------------
    // Track Transparent-Resume Boundary
    //------------------------------------------------

    const consumedIndex =
      update
        .lastConsumedClientMessageIndex
        ?.trim() ??
      "";

    if (
      consumedIndex
    ) {
      state.lastConsumedClientMessageIndex =
        consumedIndex;
    }

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.debug(
      {
        event:
          "gemini.live.session_resumption_update",

        resumable,

        newHandlePresent:
          Boolean(
            newHandle
          ),

        consumedIndexPresent:
          Boolean(
            consumedIndex
          ),
      },
      "Gemini Live session resumption state updated"
    );
  }

  //------------------------------------------------
  // Resume Handle
  //------------------------------------------------

  getResumeHandle(
    callId:
      string
  ):
    string |
    null {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return null;
    }

    const state =
      this.states.get(
        normalizedCallId
      );

    if (
      !state ||
      !state.resumable
    ) {
      return null;
    }

    return state
      .latestResumptionHandle;
  }

  //------------------------------------------------
  // GoAway
  //------------------------------------------------

  noteGoAway(
    callId:
      string,

    timeLeft:
      unknown
  ): GeminiLiveGoAwayState {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const state =
      this.ensureState(
        normalizedCallId
      );

    const now =
      Date.now();

    const timeLeftMs =
      parseDurationMs(
        timeLeft
      );

    const goAway:
      GeminiLiveGoAwayState =
    {
      receivedAt:
        now,

      timeLeftMs,

      disconnectDeadline:
        timeLeftMs ===
        null
          ? null
          : now +
            timeLeftMs,
    };

    state.goAway =
      goAway;

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.warn(
      {
        event:
          "gemini.live.go_away_received",

        timeLeftMs,

        disconnectDeadline:
          goAway
            .disconnectDeadline,

        resumeHandlePresent:
          Boolean(
            state
              .latestResumptionHandle
          ),

        resumable:
          state.resumable,
      },
      "Gemini Live server announced upcoming disconnect"
    );

    return {
      ...goAway,
    };
  }

  //------------------------------------------------
  // Should Reconnect For GoAway
  //------------------------------------------------

  shouldReconnectForGoAway(
    callId:
      string
  ): boolean {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return false;
    }

    const state =
      this.states.get(
        normalizedCallId
      );

    if (
      !state ||
      !state.goAway
    ) {
      return false;
    }

    if (
      !state.resumable ||
      !state.latestResumptionHandle
    ) {
      return false;
    }

    //------------------------------------------------
    // Unknown Deadline
    //
    // GoAway itself is sufficient reason to prepare
    // a reconnect.
    //------------------------------------------------

    if (
      state
        .goAway
        .disconnectDeadline ===
      null
    ) {
      return true;
    }

    return (
      Date.now() >=
      state
        .goAway
        .disconnectDeadline -
      GO_AWAY_RECONNECT_LEAD_MS
    );
  }

  //------------------------------------------------
  // Begin Reconnect
  //------------------------------------------------

  beginReconnect(
    callId:
      string
  ): GeminiLiveReconnectResult {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const state =
      this.ensureState(
        normalizedCallId
      );

    //------------------------------------------------
    // Maximum Attempts Reached
    //------------------------------------------------

    if (
      state.reconnectAttempts >=
      MAX_RECONNECT_ATTEMPTS
    ) {
      return {
        allowed:
          false,

        attempt:
          state
            .reconnectAttempts,

        maxAttempts:
          MAX_RECONNECT_ATTEMPTS,

        resumeHandle:
          state
            .latestResumptionHandle,
      };
    }

    //------------------------------------------------
    // Increment Attempt
    //------------------------------------------------

    state.reconnectAttempts +=
      1;

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.warn(
      {
        event:
          "gemini.live.reconnect_started",

        attempt:
          state
            .reconnectAttempts,

        maxAttempts:
          MAX_RECONNECT_ATTEMPTS,

        resumable:
          state.resumable,

        resumeHandlePresent:
          Boolean(
            state
              .latestResumptionHandle
          ),
      },
      "Gemini Live reconnect attempt started"
    );

    return {
      allowed:
        true,

      attempt:
        state
          .reconnectAttempts,

      maxAttempts:
        MAX_RECONNECT_ATTEMPTS,

      resumeHandle:
        state.resumable
          ? state
              .latestResumptionHandle
          : null,
    };
  }

  //------------------------------------------------
  // Reconnect Success
  //------------------------------------------------

  recordReconnectSuccess(
    callId:
      string
  ): void {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const state =
      this.ensureState(
        normalizedCallId
      );

    state.reconnectAttempts =
      0;

    state.goAway =
      null;

    state.consecutiveAudioFailures =
      0;

    state.consecutiveToolFailures =
      0;

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.info(
      {
        event:
          "gemini.live.reconnect_succeeded",
      },
      "Gemini Live reconnect succeeded"
    );
  }

  //------------------------------------------------
  // Audio Success
  //------------------------------------------------

  recordAudioSuccess(
    callId:
      string
  ): void {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    const state =
      this.ensureState(
        normalizedCallId
      );

    state.consecutiveAudioFailures =
      0;
  }

  //------------------------------------------------
  // Audio Failure
  //------------------------------------------------

  recordAudioFailure(
    callId:
      string,

    error:
      unknown
  ): GeminiLiveFailureResult {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const state =
      this.ensureState(
        normalizedCallId
      );

    state.consecutiveAudioFailures +=
      1;

    state.totalAudioFailures +=
      1;

    const terminate =
      state
        .consecutiveAudioFailures >=
      MAX_CONSECUTIVE_AUDIO_FAILURES;

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.warn(
      {
        event:
          "gemini.live.audio_failure",

        consecutiveFailures:
          state
            .consecutiveAudioFailures,

        totalFailures:
          state
            .totalAudioFailures,

        terminate,

        error:
          normalizeError(
            error
          ),
      },
      "Gemini Live audio operation failed"
    );

    return {
      count:
        state
          .consecutiveAudioFailures,

      terminate,
    };
  }

  //------------------------------------------------
  // Tool Success
  //------------------------------------------------

  recordToolSuccess(
    callId:
      string
  ): void {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    const state =
      this.ensureState(
        normalizedCallId
      );

    state.consecutiveToolFailures =
      0;
  }

  //------------------------------------------------
  // Tool Failure
  //------------------------------------------------

  recordToolFailure(
    callId:
      string,

    error:
      unknown
  ): GeminiLiveFailureResult {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const state =
      this.ensureState(
        normalizedCallId
      );

    state.consecutiveToolFailures +=
      1;

    state.totalToolFailures +=
      1;

    /*
     * Tool failure should not normally terminate
     * voice immediately.
     *
     * The boolean indicates that the tool subsystem
     * is unhealthy and should fail closed / stop
     * accepting additional mutating actions.
     */

    const terminate =
      state
        .consecutiveToolFailures >=
      MAX_CONSECUTIVE_TOOL_FAILURES;

    const log =
      createCallLogger(
        normalizedCallId
      );

    log.warn(
      {
        event:
          "gemini.live.tool_failure",

        consecutiveFailures:
          state
            .consecutiveToolFailures,

        totalFailures:
          state
            .totalToolFailures,

        failureThresholdReached:
          terminate,

        error:
          normalizeError(
            error
          ),
      },
      "Gemini Live business tool operation failed"
    );

    return {
      count:
        state
          .consecutiveToolFailures,

      terminate,
    };
  }

  //------------------------------------------------
  // Run With Timeout
  //------------------------------------------------

  async runWithTimeout<T>(
    callId:
      string,

    operation:
      string,

    task:
      Promise<T>,

    timeoutMs:
      number =
        DEFAULT_TOOL_TIMEOUT_MS
  ): Promise<T> {
    const normalizedCallId =
      requireCallId(
        callId
      );

    const safeTimeout =
      Number.isFinite(
        timeoutMs
      ) &&
      timeoutMs >
        0
        ? Math.floor(
            timeoutMs
          )
        : DEFAULT_TOOL_TIMEOUT_MS;

    let timeout:
      ReturnType<
        typeof setTimeout
      > |
      null =
        null;

    try {
      const timeoutPromise =
        new Promise<
          never
        >(
          (
            _resolve,
            reject
          ) => {
            timeout =
              setTimeout(
                () => {
                  reject(
                    new GeminiLiveOperationTimeoutError(
                      operation,
                      safeTimeout
                    )
                  );
                },
                safeTimeout
              );
          }
        );

      return await Promise.race([
        task,
        timeoutPromise,
      ]);
    } catch (
      error
    ) {
      const log =
        createCallLogger(
          normalizedCallId
        );

      log.warn(
        {
          event:
            "gemini.live.operation_failed",

          operation,

          timeoutMs:
            safeTimeout,

          error:
            normalizeError(
              error
            ),
        },
        "Gemini Live protected operation failed"
      );

      throw error;
    } finally {
      if (
        timeout
      ) {
        clearTimeout(
          timeout
        );
      }
    }
  }

  //------------------------------------------------
  // Snapshot
  //------------------------------------------------

  getSnapshot(
    callId:
      string
  ):
    GeminiLiveResilienceSnapshot |
    null {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return null;
    }

    const state =
      this.states.get(
        normalizedCallId
      );

    if (
      !state
    ) {
      return null;
    }

    return cloneState(
      state
    );
  }

  //------------------------------------------------
  // Clear Call
  //------------------------------------------------

  clearCall(
    callId:
      string
  ): void {
    const normalizedCallId =
      callId.trim();

    if (
      !normalizedCallId
    ) {
      return;
    }

    this.states.delete(
      normalizedCallId
    );
  }

  //------------------------------------------------
  // Ensure State
  //------------------------------------------------

  private ensureState(
    callId:
      string
  ): GeminiLiveResilienceState {
    const existing =
      this.states.get(
        callId
      );

    if (
      existing
    ) {
      return existing;
    }

    const state:
      GeminiLiveResilienceState =
    {
      callId,

      connectionStartedAt:
        null,

      latestResumptionHandle:
        null,

      resumable:
        false,

      lastConsumedClientMessageIndex:
        null,

      reconnectAttempts:
        0,

      consecutiveAudioFailures:
        0,

      consecutiveToolFailures:
        0,

      totalAudioFailures:
        0,

      totalToolFailures:
        0,

      goAway:
        null,
    };

    this.states.set(
      callId,
      state
    );

    return state;
  }
}

//--------------------------------------------------
// Require Call ID
//--------------------------------------------------

function requireCallId(
  callId:
    string
): string {
  const normalized =
    callId.trim();

  if (
    !normalized
  ) {
    throw new Error(
      "Call ID is required for Gemini Live resilience state"
    );
  }

  return normalized;
}

//--------------------------------------------------
// Clone State
//--------------------------------------------------

function cloneState(
  state:
    GeminiLiveResilienceState
): GeminiLiveResilienceSnapshot {
  return {
    callId:
      state.callId,

    connectionStartedAt:
      state.connectionStartedAt,

    latestResumptionHandle:
      state.latestResumptionHandle,

    resumable:
      state.resumable,

    lastConsumedClientMessageIndex:
      state
        .lastConsumedClientMessageIndex,

    reconnectAttempts:
      state.reconnectAttempts,

    consecutiveAudioFailures:
      state
        .consecutiveAudioFailures,

    consecutiveToolFailures:
      state
        .consecutiveToolFailures,

    totalAudioFailures:
      state.totalAudioFailures,

    totalToolFailures:
      state.totalToolFailures,

    goAway:
      state.goAway
        ? {
            ...state.goAway,
          }
        : null,
  };
}

//--------------------------------------------------
// Parse Gemini Duration
//
// Handles common protobuf / SDK representations:
//
// "10s"
// "1.5s"
// 5000
// { seconds: 10, nanos: 500000000 }
//--------------------------------------------------

function parseDurationMs(
  value:
    unknown
):
  number |
  null {
  //------------------------------------------------
  // Number — already milliseconds
  //------------------------------------------------

  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return Math.max(
      0,
      Math.floor(
        value
      )
    );
  }

  //------------------------------------------------
  // Duration String
  //------------------------------------------------

  if (
    typeof value ===
      "string"
  ) {
    const normalized =
      value.trim();

    const match =
      /^([0-9]+(?:\.[0-9]+)?)s$/
        .exec(
          normalized
        );

    if (
      !match
    ) {
      return null;
    }

    const seconds =
      Number(
        match[1]
      );

    if (
      !Number.isFinite(
        seconds
      )
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.floor(
        seconds *
        1000
      )
    );
  }

  //------------------------------------------------
  // Protobuf Duration Object
  //------------------------------------------------

  if (
    isRecord(
      value
    )
  ) {
    const seconds =
      parseNumericValue(
        value.seconds
      );

    const nanos =
      parseNumericValue(
        value.nanos
      ) ??
      0;

    if (
      seconds ===
      null
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.floor(
        seconds *
          1000 +
        nanos /
          1_000_000
      )
    );
  }

  return null;
}

//--------------------------------------------------
// Numeric Value
//--------------------------------------------------

function parseNumericValue(
  value:
    unknown
):
  number |
  null {
  if (
    typeof value ===
      "number" &&
    Number.isFinite(
      value
    )
  ) {
    return value;
  }

  if (
    typeof value ===
      "bigint"
  ) {
    return Number(
      value
    );
  }

  if (
    typeof value ===
      "string" &&
    value.trim()
  ) {
    const parsed =
      Number(
        value
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : null;
  }

  return null;
}

//--------------------------------------------------
// Record Guard
//--------------------------------------------------

function isRecord(
  value:
    unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !==
      null &&
    !Array.isArray(
      value
    )
  );
}

//--------------------------------------------------
// Singleton
//--------------------------------------------------

export const GeminiLiveResilienceService =
  new GeminiLiveResilienceManager();