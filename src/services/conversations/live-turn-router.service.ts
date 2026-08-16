import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import {
  ConversationEvents,
} from "./conversation-events.service";

import {
  ConversationService,
} from "./conversation.service";

import {
  ConversationStateService,
} from "./conversation-state.service";

import {
  routeBusinessWorkflowTurn,
} from "./business-workflow-turn-router.service";

import {
  VoiceWorker,
} from "@/services/voice/voice-worker.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface LiveTurnRouteResult {
  handled:
    boolean;

  response:
    string | null;

  reason:
    | "BUSINESS_WORKFLOW"
    | "NORMAL_CONVERSATION";

  audioQueued:
    boolean;
}

//--------------------------------------------------
// Route Live Turn
//--------------------------------------------------

export async function routeLiveTurn(
  callId:
    string,

  transcript:
    string,

  signal?:
    AbortSignal,

  turnId?:
    number
): Promise<LiveTurnRouteResult> {
  const normalized =
    transcript.trim();

  if (
    !normalized
  ) {
    return normalConversation();
  }

  const log =
    createCallLogger(
      callId
    );

  //--------------------------------------------------
  // Abort Before Work
  //--------------------------------------------------

  if (
    signal?.aborted
  ) {
    return normalConversation();
  }

  try {
    //------------------------------------------------
    // Business Workflow First
    //------------------------------------------------

    const business =
      await routeBusinessWorkflowTurn(
        callId,
        normalized,
        signal
      );

    //------------------------------------------------
    // Not A Workflow Turn
    //------------------------------------------------

    if (
      !business.handled
    ) {
      return normalConversation();
    }

    //------------------------------------------------
    // Abort After Workflow
    //------------------------------------------------

    if (
      signal?.aborted
    ) {
      return {
        handled:
          true,

        response:
          null,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Persist Customer Message
    //------------------------------------------------

    await ConversationService.addMessage({
      callId,

      role:
        "USER",

      content:
        normalized,
    });

    await EventPublisher.publish(
      AppEvent.CONVERSATION_MESSAGE,
      {
        callId,

        role:
          "USER",

        text:
          normalized,

        timestamp:
          Date.now(),
      }
    );

    //------------------------------------------------
    // No Spoken Response
    //------------------------------------------------

    const response =
      business.response
        ?.trim() ??
      "";

    if (
      !response
    ) {
      return {
        handled:
          true,

        response:
          null,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Verify Call Session Still Exists
    //------------------------------------------------

    const audioSession =
      AudioSessionService
        .getByCallId(
          callId
        );

    if (
      !audioSession
    ) {
      log.warn(
        {
          event:
            "conversation.workflow.response_not_spoken",

          reason:
            "audio_session_missing",

          workflowType:
            business.workflowType,
        },
        "Workflow response could not be spoken because audio session no longer exists"
      );

      //------------------------------------------------
      // Still Persist Assistant Response
      //------------------------------------------------

      await persistAssistantResponse(
        callId,
        response
      );

      return {
        handled:
          true,

        response,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Thinking State
    //------------------------------------------------

    ConversationStateService.setState(
      callId,
      "THINKING"
    );

    ConversationEvents.emit(
      "thinking",
      callId
    );

    //------------------------------------------------
    // Start Playback Runtime
    //------------------------------------------------

    void VoiceWorker.start(
      callId
    );

    //------------------------------------------------
    // Generate / Queue Speech
    //------------------------------------------------

    const audioQueued =
      await VoiceWorker.addText(
        callId,
        response,
        turnId
      );

    //------------------------------------------------
    // Abort Check After TTS
    //------------------------------------------------

    if (
      signal?.aborted
    ) {
      return {
        handled:
          true,

        response,

        reason:
          "BUSINESS_WORKFLOW",

        audioQueued:
          false,
      };
    }

    //------------------------------------------------
    // Persist Assistant Message
    //------------------------------------------------

    await persistAssistantResponse(
      callId,
      response
    );

    //------------------------------------------------
    // TTS Failed
    //------------------------------------------------

    if (
      !audioQueued
    ) {
      returnToListening(
        callId
      );
    }

    log.info(
      {
        event:
          "conversation.live_turn.routed",

        destination:
          "business_workflow",

        workflowType:
          business.workflowType,

        completed:
          business.completed,

        responseCharacterCount:
          response.length,

        audioQueued,
      },
      "Live customer turn handled by business workflow"
    );

    return {
      handled:
        true,

      response,

      reason:
        "BUSINESS_WORKFLOW",

      audioQueued,
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "conversation.live_turn.router_failed",

        error:
          normalizeError(
            error
          ),
      },
      "Live-turn routing failed"
    );

    /*
     * Fail open.
     *
     * The caller's transcript will continue through
     * the existing normal conversation path instead
     * of being lost.
     */
    return normalConversation();
  }
}

//--------------------------------------------------
// Persist Assistant Response
//--------------------------------------------------

async function persistAssistantResponse(
  callId:
    string,

  response:
    string
): Promise<void> {
  await ConversationService.addMessage({
    callId,

    role:
      "ASSISTANT",

    content:
      response,
  });

  await EventPublisher.publish(
    AppEvent.CONVERSATION_MESSAGE,
    {
      callId,

      role:
        "ASSISTANT",

      text:
        response,

      timestamp:
        Date.now(),
    }
  );
}

//--------------------------------------------------
// Return To Listening
//--------------------------------------------------

function returnToListening(
  callId:
    string
): void {
  const currentState =
    ConversationStateService
      .getState(
        callId
      );

  if (
    currentState ===
      "ENDED" ||
    currentState ===
      "INTERRUPTING" ||
    currentState ===
      "INTERRUPTED"
  ) {
    return;
  }

  if (
    !AudioSessionService
      .getByCallId(
        callId
      )
  ) {
    return;
  }

  ConversationStateService.setState(
    callId,
    "LISTENING"
  );

  ConversationEvents.emit(
    "listening",
    callId
  );
}

//--------------------------------------------------
// Normal Conversation
//--------------------------------------------------

function normalConversation():
  LiveTurnRouteResult {
  return {
    handled:
      false,

    response:
      null,

    reason:
      "NORMAL_CONVERSATION",

    audioQueued:
      false,
  };
}