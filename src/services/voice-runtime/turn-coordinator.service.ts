import {
  createCallLogger,
} from "@/lib/logger";

import {
  ConversationAbort,
} from "@/services/conversations/abort.service";

import {
  CascadedTurnLatency,
} from "./cascaded-turn-latency.service";

import { StandardPartialPrefetch } from "./standard-partial-prefetch.service";
import { StandardRuntimeUsage } from "./standard-runtime-usage.service";

//--------------------------------------------------
// Types
//--------------------------------------------------

export type TurnStatus =
  | "PROCESSING"
  | "COMPLETED"
  | "INTERRUPTED"
  | "FAILED";

export interface ActiveTurn {
  turnId: number;

  generationId: string;

  callId: string;

  startedAt: number;

  status: TurnStatus;

  abortController:
    AbortController;
}

export interface BeginTurnResult {
  turnId: number;

  generationId: string;

  signal: AbortSignal;

  replacedTurnId:
    number | null;
}

//--------------------------------------------------
// Turn Coordinator
//--------------------------------------------------

class TurnCoordinatorService {
  /*
   * Monotonically increasing turn number for
   * every individual call.
   *
   * This ensures old async work can never
   * accidentally become the active turn again.
   */
  private turnCounters =
    new Map<
      string,
      number
    >();

  /*
   * Exactly one active turn is allowed
   * per call.
   */
  private activeTurns =
    new Map<
      string,
      ActiveTurn
    >();

  //------------------------------------------------
  // Begin Turn
  //------------------------------------------------

  beginTurn(
    callId: string
  ): BeginTurnResult {
    const log =
      createCallLogger(
        callId
      );

    const previousTurn =
      this.activeTurns.get(
        callId
      );

    //----------------------------------------------
    // Cancel Previous Turn
    //----------------------------------------------

    if (
      previousTurn &&
      previousTurn.status ===
        "PROCESSING"
    ) {
      previousTurn.status =
        "INTERRUPTED";

      if (
        !previousTurn
          .abortController
          .signal
          .aborted
      ) {
        previousTurn
          .abortController
          .abort();
      }

      /*
       * Keep the existing conversation-level
       * cancellation mechanism synchronized
       * with the new turn coordinator.
       */
      ConversationAbort.abort(
        callId
      );

      StandardPartialPrefetch.cancel(
        callId,
        "new_generation"
      );

      CascadedTurnLatency.interrupt(
        callId
      );

      void StandardRuntimeUsage.complete(callId, previousTurn.turnId);

      log.info(
        {
          event:
            "voice.turn.replaced",

          previousTurnId:
            previousTurn.turnId,
        },
        "Previous realtime conversation turn interrupted"
      );
    }

    //----------------------------------------------
    // Allocate New Turn ID
    //----------------------------------------------

    const nextTurnId =
      (
        this.turnCounters.get(
          callId
        ) ??
        0
      ) +
      1;

    this.turnCounters.set(
      callId,
      nextTurnId
    );

    //----------------------------------------------
    // Create Abort Controller
    //----------------------------------------------

    /*
     * ConversationAbort currently owns an
     * AbortController used by the existing
     * conversation engine.
     *
     * Re-create that controller for every
     * new customer turn.
     */
    const controller =
      ConversationAbort.create(
        callId
      );

    const activeTurn:
      ActiveTurn = {
        turnId:
          nextTurnId,

        generationId: `${callId}:${nextTurnId}`,

        callId,

        startedAt:
          Date.now(),

        status:
          "PROCESSING",

        abortController:
          controller,
      };

    this.activeTurns.set(
      callId,
      activeTurn
    );

    CascadedTurnLatency.beginTurn(
      callId,
      nextTurnId
    );

    CascadedTurnLatency.setGeneration(
      callId,
      activeTurn.generationId
    );

    log.info(
      {
        event:
          "voice.turn.started",

        turnId:
          nextTurnId,

        replacedTurnId:
          previousTurn
            ?.turnId ??
          null,

        generationId: activeTurn.generationId,
      },
      "Realtime conversation turn started"
    );

    return {
      turnId:
        nextTurnId,

      generationId: activeTurn.generationId,

      signal:
        controller.signal,

      replacedTurnId:
        previousTurn
          ?.turnId ??
        null,
    };
  }

  //------------------------------------------------
  // Is Current Turn
  //------------------------------------------------

  isCurrent(
    callId: string,
    turnId: number
  ): boolean {
    const active =
      this.activeTurns.get(
        callId
      );

    return (
      active !== undefined &&
      active.turnId ===
        turnId &&
      active.status ===
        "PROCESSING" &&
      !active
        .abortController
        .signal
        .aborted
    );
  }

  isCurrentGeneration(
    callId: string,
    generationId: string
  ): boolean {
    const active = this.activeTurns.get(callId);
    return Boolean(
      active &&
      active.generationId === generationId &&
      active.status === "PROCESSING" &&
      !active.abortController.signal.aborted
    );
  }

  getCurrentGenerationId(callId: string): string | null {
    return this.activeTurns.get(callId)?.generationId ?? null;
  }

  //------------------------------------------------
  // Require Current Turn
  //------------------------------------------------

  assertCurrent(
    callId: string,
    turnId: number
  ): void {
    if (
      !this.isCurrent(
        callId,
        turnId
      )
    ) {
      throw new DOMException(
        `Conversation turn ${turnId} is no longer active`,
        "AbortError"
      );
    }
  }

  //------------------------------------------------
  // Complete Turn
  //------------------------------------------------

  completeTurn(
    callId: string,
    turnId: number
  ): boolean {
    const active =
      this.activeTurns.get(
        callId
      );

    if (
      !active ||
      active.turnId !==
        turnId
    ) {
      return false;
    }

    active.status =
      "COMPLETED";

    // Speech generation has completed by this point, so finalizing here keeps
    // all incremental phrase requests in the provider-unit record.
    void StandardRuntimeUsage.complete(callId, turnId);

    const log =
      createCallLogger(
        callId
      );

    log.info(
      {
        event:
          "voice.turn.completed",

        turnId,

        durationMs:
          Date.now() -
          active.startedAt,
      },
      "Realtime conversation turn completed"
    );

    return true;
  }

  //------------------------------------------------
  // Fail Turn
  //------------------------------------------------

  failTurn(
    callId: string,
    turnId: number
  ): boolean {
    const active =
      this.activeTurns.get(
        callId
      );

    if (
      !active ||
      active.turnId !==
        turnId
    ) {
      return false;
    }

    active.status =
      "FAILED";

    void StandardRuntimeUsage.complete(callId, turnId);

    createCallLogger(
      callId
    ).warn(
      {
        event:
          "voice.turn.failed",

        turnId,

        durationMs:
          Date.now() -
          active.startedAt,
      },
      "Realtime conversation turn failed"
    );

    return true;
  }

  //------------------------------------------------
  // Interrupt Current Turn
  //------------------------------------------------

  interrupt(
    callId: string,
    reason:
      string =
      "superseded"
  ): number | null {
    const active =
      this.activeTurns.get(
        callId
      );

    if (
      !active
    ) {
      return null;
    }

    if (
      active.status ===
        "PROCESSING"
    ) {
      active.status =
        "INTERRUPTED";
    }

    if (
      !active
        .abortController
        .signal
        .aborted
    ) {
      active
        .abortController
        .abort();
    }

    ConversationAbort.abort(
      callId
    );

    StandardPartialPrefetch.cancel(
      callId,
      reason
    );

    CascadedTurnLatency.interrupt(
      callId
    );

    void StandardRuntimeUsage.complete(callId, active.turnId);

    createCallLogger(
      callId
    ).info(
      {
        event:
          "voice.turn.interrupted",

        turnId:
          active.turnId,

        reason,

        durationMs:
          Date.now() -
          active.startedAt,
      },
      "Realtime conversation turn interrupted"
    );

    return active.turnId;
  }

  //------------------------------------------------
  // Get Active Turn
  //------------------------------------------------

  getActiveTurn(
    callId: string
  ): ActiveTurn | null {
    return (
      this.activeTurns.get(
        callId
      ) ??
      null
    );
  }

  //------------------------------------------------
  // Get Current Turn ID
  //------------------------------------------------

  getCurrentTurnId(
    callId: string
  ): number | null {
    return (
      this.activeTurns.get(
        callId
      )
        ?.turnId ??
      null
    );
  }

  //------------------------------------------------
  // Has Active Processing Turn
  //------------------------------------------------

  hasActiveTurn(
    callId: string
  ): boolean {
    const active =
      this.activeTurns.get(
        callId
      );

    return (
      active !== undefined &&
      active.status ===
        "PROCESSING" &&
      !active
        .abortController
        .signal
        .aborted
    );
  }

  //------------------------------------------------
  // Cleanup Call
  //------------------------------------------------

  cleanup(
    callId: string
  ): void {
    const active =
      this.activeTurns.get(
        callId
      );

    if (
      active &&
      !active
        .abortController
        .signal
        .aborted
    ) {
      active
        .abortController
        .abort();
    }

    this.activeTurns.delete(
      callId
    );

    this.turnCounters.delete(
      callId
    );

    ConversationAbort.abort(
      callId
    );

    ConversationAbort.clear(
      callId
    );

    StandardPartialPrefetch.clear(
      callId
    );

    CascadedTurnLatency.cleanupCall(
      callId
    );

    if (active) {
      void StandardRuntimeUsage.complete(callId, active.turnId);
    }

    createCallLogger(
      callId
    ).debug(
      {
        event:
          "voice.turn.cleanup",
      },
      "Realtime turn state cleaned"
    );
  }
}

export const TurnCoordinator =
  new TurnCoordinatorService();
