import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  getCall,
} from "@/services/calls/call.service";

import {
  IVRFlowService,
} from "@/services/ivr-flow.service";

import {
  executeIVRAction,
} from "./ivr-action-executor.service";

import {
  resolveIVRVoiceInput,
} from "./ivr-voice-resolver.service";

import type {
  IVRActionExecutionResult,
} from "./ivr-action-executor.service";

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface HybridVoiceRouteResult {
  matched:
    boolean;

  confidence:
    number;

  action:
    string | null;

  execution:
    IVRActionExecutionResult | null;

  continueConversation:
    boolean;
}

//--------------------------------------------------
// No Match
//--------------------------------------------------

function noMatch(
  confidence = 0
): HybridVoiceRouteResult {
  return {
    matched:
      false,

    confidence,

    action:
      null,

    execution:
      null,

    continueConversation:
      true,
  };
}

//--------------------------------------------------
// Route Spoken Input
//--------------------------------------------------

export async function routeVoiceThroughIVR(
  callId: string,
  transcript: string
): Promise<HybridVoiceRouteResult> {
  const log =
    createCallLogger(
      callId
    );

  try {
    //------------------------------------------------
    // Call
    //------------------------------------------------

    const call =
      await getCall(
        callId
      );

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "ivr.voice.route_skipped",

          reason:
            "call_not_found",
        },
        "Voice IVR routing skipped"
      );

      return noMatch();
    }

    //------------------------------------------------
    // Published Menu
    //------------------------------------------------

    const menu =
      await IVRFlowService
        .findRuntimeMenuForCampaign(
          call.campaignId
        );

    if (
      !menu
    ) {
      log.debug(
        {
          event:
            "ivr.voice.route_skipped",

          reason:
            "no_published_menu",

          campaignId:
            call.campaignId,
        },
        "No published IVR menu available for voice routing"
      );

      return noMatch();
    }

    //------------------------------------------------
    // Resolve
    //------------------------------------------------

    const resolution =
      resolveIVRVoiceInput(
        menu,
        transcript
      );

    if (
      !resolution.matched ||
      !resolution.action ||
      !resolution.option
    ) {
      log.debug(
        {
          event:
            "ivr.voice.no_match",

          campaignId:
            call.campaignId,

          confidence:
            resolution.confidence,

          reason:
            resolution.reason,

          transcriptCharacterCount:
            transcript.length,
        },
        "Voice input did not match published IVR action"
      );

      return noMatch(
        resolution.confidence
      );
    }

    //------------------------------------------------
    // Execute Same Action As DTMF
    //------------------------------------------------

    const execution =
      await executeIVRAction(
        callId,
        resolution.action,
        resolution.option.response,
        resolution.option.value
      );

    //------------------------------------------------
    // AI Categories Continue Into Conversation
    //------------------------------------------------

    const continueConversation =
      execution.requiresAI;

    log.info(
      {
        event:
          "ivr.voice.action_routed",

        campaignId:
          call.campaignId,

        action:
          resolution.action,

        confidence:
          resolution.confidence,

        handled:
          execution.handled,

        completed:
          execution.completed,

        requiresAI:
          execution.requiresAI,

        shouldRepeatMenu:
          execution.shouldRepeatMenu,

        shouldEndCall:
          execution.shouldEndCall,

        shouldTransferToHuman:
          execution.shouldTransferToHuman,

        callbackRequested:
          execution.callbackRequested,

        transcriptCharacterCount:
          transcript.length,
      },
      "Voice input routed through shared IVR action executor"
    );

    return {
      matched:
        true,

      confidence:
        resolution.confidence,

      action:
        resolution.action,

      execution,

      continueConversation,
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "ivr.voice.routing_failed",

        transcriptCharacterCount:
          transcript.length,

        error:
          normalizeError(
            error
          ),
      },
      "Hybrid voice IVR routing failed"
    );

    /*
     * Failure of deterministic IVR routing must not
     * kill normal conversational AI.
     */
    return noMatch();
  }
}