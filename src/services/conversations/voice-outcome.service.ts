import {
  getCall,
} from "@/services/calls/call.service";

import {
  beginCallbackConversation,
} from "./callback-conversation.service";

import {
  ConversationService,
} from "./conversation.service";

import {
  routeConversationMessage,
} from "./conversation-route.service";

import {
  routeLocalIntent,
  type LocalIntentResult,
} from "./local-intent-router.service";

import {
  extractCallbackDateTimeFromTurn,
  extractEmailFromTurn,
  extractInterestFromTurn,
  extractNameFromTurn,
  extractPhoneFromTurn,
  extractTimezoneFromTurn,
} from "./business-workflow-input.service";

//--------------------------------------------------
// Intent
//--------------------------------------------------

export type ConversationVoiceIntent =
  | "CONTINUE_CONVERSATION"
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "REQUEST_CALLBACK"
  | "REQUEST_HUMAN"
  | "SEND_INFORMATION";

//--------------------------------------------------
// Requested Action
//--------------------------------------------------

export type ConversationRequestedAction =
  | "CONTINUE_CONVERSATION"
  | "START_CALLBACK_WORKFLOW"
  | "REQUEST_HUMAN"
  | "SEND_INFORMATION";

//--------------------------------------------------
// Entities
//--------------------------------------------------

export interface ConversationVoiceEntities {
  name:
    string | null;

  phone:
    string | null;

  email:
    string | null;

  interest:
    string | null;

  callbackTime:
    string | null;

  timezone:
    string | null;
}

//--------------------------------------------------
// Outcome
//--------------------------------------------------

export interface ConversationVoiceOutcome {
  intent:
    ConversationVoiceIntent;

  confidence:
    number;

  entities:
    ConversationVoiceEntities;

  requestedAction:
    ConversationRequestedAction;

  requiresConfirmation:
    boolean;

  handled:
    boolean;

  response:
    string | null;
}

//--------------------------------------------------
// Resolve Outcome
//--------------------------------------------------

export async function resolveVoiceConversationOutcome(
  callId:
    string,

  transcript:
    string
): Promise<ConversationVoiceOutcome> {
  const normalized =
    transcript.trim();

  const localIntent =
    routeLocalIntent(
      normalized
    );

  if (
    localIntent.handled
  ) {
    return outcomeFromLocalIntent(
      localIntent
    );
  }

  const callbackOutcome =
    await maybeResolveCallbackOutcome(
      callId,
      normalized
    );

  if (
    callbackOutcome
  ) {
    return callbackOutcome;
  }

  const humanOutcome =
    resolveHumanOutcome(
      normalized
    );

  if (
    humanOutcome
  ) {
    return humanOutcome;
  }

  const interestOutcome =
    resolveInterestOutcome(
      normalized
    );

  if (
    interestOutcome
  ) {
    return interestOutcome;
  }

  const conversation =
    await ConversationService.getConversation(
      callId
    );

  const history =
    conversation?.messages ?? [];

  const transcriptForRouting =
    history
      .map(
        message =>
          `${message.role}: ${message.content}`
      )
      .join(
        "\n"
      );

  const route =
    routeConversationMessage(
      transcriptForRouting,
      normalized
    );

  if (
    route.route ===
    "CONTEXT_ONLY"
  ) {
    return {
      intent:
        "CONTINUE_CONVERSATION",

      confidence:
        0.72,

      entities:
        emptyEntities(),

      requestedAction:
        "CONTINUE_CONVERSATION",

      requiresConfirmation:
        false,

      handled:
        false,

      response:
        null,
    };
  }

  return {
    intent:
      "SEND_INFORMATION",

    confidence:
      route.route ===
        "KNOWLEDGE"
        ? 0.68
        : 0.64,

    entities:
      emptyEntities(),

    requestedAction:
      "SEND_INFORMATION",

    requiresConfirmation:
      false,

    handled:
      false,

    response:
      null,
  };
}

//--------------------------------------------------
// Local Intent Outcome
//--------------------------------------------------

function outcomeFromLocalIntent(
  localIntent:
    LocalIntentResult
): ConversationVoiceOutcome {
  switch (
    localIntent.type
  ) {
    case "HUMAN_AGENT":
      return {
        intent:
          "REQUEST_HUMAN",

        confidence:
          0.99,

        entities:
          emptyEntities(),

        requestedAction:
          "REQUEST_HUMAN",

        requiresConfirmation:
          false,

        handled:
          true,

        response:
          localIntent.reply ??
          "I can arrange assistance from a representative.",
      };

    case "STOP":
      return {
        intent:
          "NOT_INTERESTED",

        confidence:
          0.86,

        entities:
          emptyEntities(),

        requestedAction:
          "CONTINUE_CONVERSATION",

        requiresConfirmation:
          false,

        handled:
          true,

        response:
          localIntent.reply ??
          "Okay.",
      };

    case "CONFIRM_NO":
      return {
        intent:
          "NOT_INTERESTED",

        confidence:
          0.96,

        entities:
          emptyEntities(),

        requestedAction:
          "CONTINUE_CONVERSATION",

        requiresConfirmation:
          false,

        handled:
          true,

        response:
          localIntent.reply ??
          "Okay.",
      };

    case "CONFIRM_YES":
      return {
        intent:
          "CONTINUE_CONVERSATION",

        confidence:
          0.96,

        entities:
          emptyEntities(),

        requestedAction:
          "CONTINUE_CONVERSATION",

        requiresConfirmation:
          false,

        handled:
          true,

        response:
          localIntent.reply ??
          "Okay.",
      };

    case "WAIT":
    case "REPEAT":
    case "GREETING":
    case "END_CALL":
    case "NONE":
    default:
      return {
        intent:
          "CONTINUE_CONVERSATION",

        confidence:
          0.78,

        entities:
          emptyEntities(),

        requestedAction:
          "CONTINUE_CONVERSATION",

        requiresConfirmation:
          false,

        handled:
          Boolean(
            localIntent.reply
          ),

        response:
          localIntent.reply ??
          null,
      };
  }
}

//--------------------------------------------------
// Callback Outcome
//--------------------------------------------------

async function maybeResolveCallbackOutcome(
  callId:
    string,

  transcript:
    string
): Promise<ConversationVoiceOutcome | null> {
  const lower =
    transcript.toLowerCase();

  const callbackSignal =
    /callback|call me back|call me tomorrow|call me later|phone me|ring me back|follow up|book a callback|schedule a callback/.test(
      lower
    );

  const callbackTime =
    extractCallbackDateTimeFromTurn(
      transcript,
      "Asia/Kolkata"
    );

  const timezone =
    extractTimezoneFromTurn(
      transcript
    );

  const phone =
    extractPhoneFromTurn(
      transcript
    );

  if (
    !callbackSignal &&
    !callbackTime &&
    !timezone &&
    !phone
  ) {
    return null;
  }

  const call =
    await getCall(
      callId
    );

  const callbackPhone =
    phone ??
    call?.contactPhoneSnapshot ??
    call?.providerDestination ??
    null;

  const initial:
    Record<string, string> = {};

  if (
    callbackPhone
  ) {
    initial.phone =
      callbackPhone;
  }

  if (
    callbackTime
  ) {
    initial.scheduledFor =
      callbackTime;
  }

  if (
    timezone
  ) {
    initial.timezone =
      timezone;
  }

  const result =
    await beginCallbackConversation(
      callId,
      initial
    );

  return {
    intent:
      "REQUEST_CALLBACK",

    confidence:
      callbackTime ||
      timezone ||
      phone
        ? 0.95
        : 0.88,

    entities: {
      name:
        extractNameFromTurn(
          transcript
        ),

      phone:
        callbackPhone,

      email:
        extractEmailFromTurn(
          transcript
        ),

      interest:
        extractInterestFromTurn(
          transcript
        ),

      callbackTime:
        callbackTime,

      timezone:
        timezone,
    },

    requestedAction:
      "START_CALLBACK_WORKFLOW",

    requiresConfirmation:
      false,

    handled:
      result.handled,

    response:
      result.prompt,
  };
}

//--------------------------------------------------
// Human Outcome
//--------------------------------------------------

function resolveHumanOutcome(
  transcript:
    string
): ConversationVoiceOutcome | null {
  const lower =
    transcript.toLowerCase();

  if (
    !/\b(agent|human agent|representative|person|customer care|speak to someone|talk to someone|transfer me|human)\b/.test(
      lower
    )
  ) {
    return null;
  }

  return {
    intent:
      "REQUEST_HUMAN",

    confidence:
      0.96,

    entities:
      emptyEntities(),

    requestedAction:
      "REQUEST_HUMAN",

    requiresConfirmation:
      false,

    handled:
      true,

    response:
      "I can arrange assistance from a representative.",
  };
}

//--------------------------------------------------
// Interest Outcome
//--------------------------------------------------

function resolveInterestOutcome(
  transcript:
    string
): ConversationVoiceOutcome | null {
  const lower =
    transcript.toLowerCase();

  const interested =
    /\b(interested|tell me more|more details|more information|sounds good|sounds interesting|learn more)\b/.test(
      lower
    );

  const notInterested =
    /\b(not interested|not now|no thanks|no thank you|maybe later|not today)\b/.test(
      lower
    );

  if (
    notInterested
  ) {
    return {
      intent:
        "NOT_INTERESTED",

      confidence:
        0.94,

      entities:
        emptyEntities(),

      requestedAction:
        "CONTINUE_CONVERSATION",

      requiresConfirmation:
        false,

      handled:
        true,

      response:
        "Okay. I'll note that.",
    };
  }

  if (
    !interested
  ) {
    return null;
  }

  return {
    intent:
      "INTERESTED",

    confidence:
      0.93,

    entities: {
      name:
        extractNameFromTurn(
          transcript
        ),

      phone:
        extractPhoneFromTurn(
          transcript
        ),

      email:
        extractEmailFromTurn(
          transcript
        ),

      interest:
        extractInterestFromTurn(
          transcript
        ),

      callbackTime:
        null,

      timezone:
        null,
    },

    requestedAction:
      "CONTINUE_CONVERSATION",

    requiresConfirmation:
      false,

    handled:
      false,

    response:
      null,
  };
}

//--------------------------------------------------
// Entities
//--------------------------------------------------

function emptyEntities():
  ConversationVoiceEntities {
  return {
    name:
      null,

    phone:
      null,

    email:
      null,

    interest:
      null,

    callbackTime:
      null,

    timezone:
      null,
  };
}
