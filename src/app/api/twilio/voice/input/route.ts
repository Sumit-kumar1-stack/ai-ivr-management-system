import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  twiml,
} from "twilio";

import {
  createCallLogger,
  createServerLogger,
  normalizeError,
} from "@/lib/logger";

import {
  prisma,
} from "@/lib/prisma";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

import {
  IVRFlowService,
} from "@/services/ivr-flow.service";

import {
  executeIVRAction,
} from "@/services/ivr/ivr-action-executor.service";

import {
  IVRMenuSessionService,
} from "@/services/ivr/ivr-menu-session.service";

import {
  resolveIVRDigit,
} from "@/services/ivr/ivr-menu-resolver.service";

import {
  orchestrateHumanTransfer,
} from "@/services/telephony/human-transfer-orchestrator.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "twilio-voice-input-route"
  );

//--------------------------------------------------
// POST
//--------------------------------------------------

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  let internalCallId =
    "";

  let twilioCallSid =
    "";

  try {
    //------------------------------------------------
    // Authenticate Twilio
    //------------------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    //------------------------------------------------
    // Inputs
    //------------------------------------------------

    internalCallId =
      request.nextUrl
        .searchParams
        .get(
          "callId"
        )
        ?.trim() ??
      "";

    twilioCallSid =
      String(
        params.CallSid ??
          ""
      ).trim();

    const digits =
      String(
        params.Digits ??
          ""
      ).trim();

    //------------------------------------------------
    // Validate Identifiers
    //------------------------------------------------

    if (
      !internalCallId ||
      !twilioCallSid
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.dtmf.rejected",

          reason:
            "missing_call_identifiers",

          internalCallIdPresent:
            Boolean(
              internalCallId
            ),

          providerCallIdPresent:
            Boolean(
              twilioCallSid
            ),

          digitPresent:
            Boolean(
              digits
            ),
        },
        "Twilio DTMF request rejected"
      );

      return createErrorResponse(
        "The call session could not be verified."
      );
    }

    const log =
      createCallLogger(
        internalCallId
      );

    //------------------------------------------------
    // Validate Call Association
    //------------------------------------------------

    const call =
      await prisma.call.findFirst({
        where: {
          id:
            internalCallId,

          providerCallId:
            twilioCallSid,
        },

        select: {
          id:
            true,

          campaignId:
            true,

          status:
            true,
        },
      });

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "twilio.dtmf.rejected",

          reason:
            "call_association_failed",

          providerCallIdPresent:
            true,
        },
        "DTMF call association rejected"
      );

      return new NextResponse(
        "Forbidden",
        {
          status:
            403,

          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    //------------------------------------------------
    // Published Menu
    //------------------------------------------------

    if (!call.campaignId) {
      return NextResponse.json({ success: false, message: "Legacy campaign context is unavailable" }, { status: 400 });
    }

    const menu =
      await IVRFlowService
        .findRuntimeMenuForCampaign(
          call.campaignId
        );

    if (
      !menu
    ) {
      await IVRMenuSessionService
        .reset(
          internalCallId
        );

      log.warn(
        {
          event:
            "ivr.menu.not_found",

          campaignId:
            call.campaignId,
        },
        "No published runtime IVR menu found"
      );

      return createErrorResponse(
        "This call does not currently have a keypad menu configured."
      );
    }

    //------------------------------------------------
    // Timeout
    //------------------------------------------------

    if (
      !digits
    ) {
      const attempt =
        await IVRMenuSessionService
          .recordFailure(
            internalCallId,
            menu.maxAttempts,
            "TIMEOUT"
          );

      log.info(
        {
          event:
            "ivr.dtmf.timeout",

          campaignId:
            call.campaignId,

          attempts:
            attempt.attempts,

          maxAttempts:
            attempt.maxAttempts,

          remainingAttempts:
            attempt.remainingAttempts,

          exhausted:
            attempt.exhausted,
        },
        "No DTMF input was received"
      );

      if (
        attempt.exhausted
      ) {
        return createVoiceFallbackResponse({
          callId:
            internalCallId,

          prompt:
            menu.exhaustedPrompt,
        });
      }

      return createMenuResponse({
        callId:
          internalCallId,

        prompt:
          buildRetryPrompt(
            menu.timeoutPrompt,
            attempt.remainingAttempts
          ),

        menuPrompt:
          menu.prompt,
      });
    }

    //------------------------------------------------
    // Resolve Digit
    //------------------------------------------------

    const result =
      resolveIVRDigit(
        menu,
        digits
      );

    log.info(
      {
        event:
          "ivr.dtmf.resolved",

        campaignId:
          call.campaignId,

        digit:
          result.digit,

        valid:
          result.valid,

        action:
          result.action,

        optionLabel:
          result.label ??
          null,
      },
      "DTMF input resolved against published IVR configuration"
    );

    //------------------------------------------------
    // Invalid Selection
    //------------------------------------------------

    if (
      !result.valid
    ) {
      const attempt =
        await IVRMenuSessionService
          .recordFailure(
            internalCallId,
            menu.maxAttempts,
            "INVALID"
          );

      log.info(
        {
          event:
            "ivr.dtmf.invalid_attempt",

          campaignId:
            call.campaignId,

          digit:
            digits,

          attempts:
            attempt.attempts,

          maxAttempts:
            attempt.maxAttempts,

          remainingAttempts:
            attempt.remainingAttempts,

          exhausted:
            attempt.exhausted,
        },
        "Invalid DTMF attempt recorded"
      );

      if (
        attempt.exhausted
      ) {
        return createVoiceFallbackResponse({
          callId:
            internalCallId,

          prompt:
            menu.exhaustedPrompt,
        });
      }

      return createMenuResponse({
        callId:
          internalCallId,

        prompt:
          buildRetryPrompt(
            result.response,
            attempt.remainingAttempts
          ),

        menuPrompt:
          menu.prompt,
      });
    }

    //------------------------------------------------
    // Valid Input Resets Attempts
    //------------------------------------------------

    await IVRMenuSessionService
      .reset(
        internalCallId
      );

//--------------------------------------------------
// Invalid Action Guard
//--------------------------------------------------

if (
  result.action ===
  "INVALID"
) {
  throw new Error(
    "Invalid IVR action cannot be executed"
  );
}

    //------------------------------------------------
    // Shared Semantic Action
    //------------------------------------------------

    const execution =
      await executeIVRAction(
        internalCallId,
        result.action,
        result.response,
        result.value
      );

    log.info(
      {
        event:
          "ivr.dtmf.action_executed",

        action:
          execution.action,

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

callbackBooked:
  execution.callbackBooked,

callbackNeedsDetails:
  execution.callbackNeedsDetails,
      },
      "DTMF semantic action executed"
    );

    //------------------------------------------------
    // End Call
    //------------------------------------------------

    if (
      execution.shouldEndCall
    ) {
      const response =
        new twiml.VoiceResponse();

      response.say(
        {
          voice:
            "alice",
        },
        execution.message
      );

      response.hangup();

      return createXmlResponse(
        response.toString()
      );
    }

    //------------------------------------------------
    // Repeat Menu
    //------------------------------------------------

    if (
      execution.shouldRepeatMenu
    ) {
      return createMenuResponse({
        callId:
          internalCallId,

        prompt:
          execution.message,

        menuPrompt:
          menu.prompt,
      });
    }

  //------------------------------------------------
// Callback Intent
//------------------------------------------------

if (
  execution.callbackRequested
) {
  /*
   * A keypad selection only tells us that the
   * caller wants a callback.
   *
   * It does NOT provide enough verified data to
   * create a CallbackRequest.
   *
   * Hand the call into the conversational voice
   * runtime where phone number, preferred time,
   * timezone and explicit confirmation can be
   * collected.
   */
  log.info(
    {
      event:
        "ivr.callback.voice_handoff",

      callbackNeedsDetails:
        execution.callbackNeedsDetails,

      callbackBooked:
        execution.callbackBooked,
    },
    "Callback intent handed to conversational voice runtime"
  );

  return createVoiceFallbackResponse({
    callId:
      internalCallId,

    prompt:
      execution.message,
  });
}

    //------------------------------------------------
    // AI-Assisted Category
    //------------------------------------------------

    if (
      execution.requiresAI
    ) {
      /*
       * Valid DTMF category selected.
       *
       * Phase 12F already established the shared
       * semantic action path. We now hand the call
       * into the existing bidirectional Media Stream
       * runtime instead of trapping the caller in
       * repeated Gather prompts.
       */
      return createVoiceFallbackResponse({
        callId:
          internalCallId,

        prompt:
          execution.message,
      });
    }

//------------------------------------------------
// Human Transfer Requested
//------------------------------------------------

if (
  execution.shouldTransferToHuman
) {
  const transfer =
    await orchestrateHumanTransfer(
      internalCallId,
      "Caller selected the human-agent IVR option"
    );

  log.info(
    {
      event:
        "ivr.human_transfer.result",

      requested:
        transfer.requested,

      transferred:
        transfer.transferred,

      code:
        transfer.code,
    },
    "Human-agent IVR request processed"
  );

  //------------------------------------------------
  // Provider Accepted Transfer
  //------------------------------------------------

  if (
    transfer.transferred
  ) {
    /*
     * The active Twilio call has already been
     * redirected by the provider adapter.
     *
     * Do not issue another Gather or Media Stream
     * redirect here because that can race with the
     * provider-side Call.update({ twiml }).
     */

    const response =
      new twiml.VoiceResponse();

    return createXmlResponse(
      response.toString()
    );
  }

  //------------------------------------------------
  // Transfer Unavailable
  //------------------------------------------------

  return createVoiceFallbackResponse({
    callId:
      internalCallId,

    prompt:
      transfer.message,
  });
}

    //------------------------------------------------
    // Other Completed Action
    //------------------------------------------------

    return createMenuResponse({
      callId:
        internalCallId,

      prompt:
        execution.message,

      menuPrompt:
        menu.prompt,
    });
  } catch (
    error
  ) {
    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse as
        NextResponse;
    }

    const log =
      internalCallId
        ? createCallLogger(
            internalCallId
          )
        : serviceLog;

    log.error(
      {
        event:
          "twilio.dtmf.failed",

        internalCallIdPresent:
          Boolean(
            internalCallId
          ),

        providerCallIdPresent:
          Boolean(
            twilioCallSid
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Twilio DTMF processing failed"
    );

    return createErrorResponse(
      "An error occurred while processing your selection."
    );
  }
}

//--------------------------------------------------
// Retry Prompt
//--------------------------------------------------

function buildRetryPrompt(
  basePrompt: string,
  remainingAttempts: number
): string {
  if (
    remainingAttempts <=
    0
  ) {
    return basePrompt;
  }

  if (
    remainingAttempts ===
    1
  ) {
    return `${basePrompt} You have one attempt remaining.`;
  }

  return `${basePrompt} You have ${remainingAttempts} attempts remaining.`;
}

//--------------------------------------------------
// Menu Response
//--------------------------------------------------

function createMenuResponse(
  input: {
    callId:
      string;

    prompt:
      string;

    menuPrompt?:
      string;

    includeMenuPrompt?:
      boolean;
  }
): NextResponse {
  const response =
    new twiml.VoiceResponse();

  if (
    input.prompt
  ) {
    response.say(
      {
        voice:
          "alice",
      },
      input.prompt
    );
  }

  const gather =
    response.gather({
      input: [
        "dtmf",
      ],

      numDigits:
        1,

      timeout:
        5,

      action:
        `/api/twilio/voice/input?callId=${encodeURIComponent(
          input.callId
        )}`,

      method:
        "POST",
    });

  if (
    input.includeMenuPrompt !==
      false &&
    input.menuPrompt
  ) {
    gather.say(
      {
        voice:
          "alice",
      },
      input.menuPrompt
    );
  }

  /*
   * No key before timeout.
   */
  response.redirect(
    {
      method:
        "POST",
    },
    `/api/twilio/voice/input?callId=${encodeURIComponent(
      input.callId
    )}`
  );

  return createXmlResponse(
    response.toString()
  );
}

//--------------------------------------------------
// Conversational Voice Handoff
//--------------------------------------------------

function createVoiceFallbackResponse(
  input: {
    callId:
      string;

    prompt?:
      string;
  }
): NextResponse {
  const response =
    new twiml.VoiceResponse();

  if (
    input.prompt
  ) {
    response.say(
      {
        voice:
          "alice",
      },
      input.prompt
    );
  }

  /*
   * POST is important because the existing
   * /voice-stream endpoint rejects GET requests.
   */
  response.redirect(
    {
      method:
        "POST",
    },
    `/api/twilio/voice-stream?callId=${encodeURIComponent(
      input.callId
    )}`
  );

  return createXmlResponse(
    response.toString()
  );
}

//--------------------------------------------------
// Error Response
//--------------------------------------------------

function createErrorResponse(
  message: string
): NextResponse {
  const response =
    new twiml.VoiceResponse();

  response.say(
    {
      voice:
        "alice",
    },
    message
  );

  response.hangup();

  return createXmlResponse(
    response.toString()
  );
}

//--------------------------------------------------
// XML Response
//--------------------------------------------------

function createXmlResponse(
  xml: string
): NextResponse {
  return new NextResponse(
    xml,
    {
      status:
        200,

      headers: {
        "Content-Type":
          "text/xml; charset=utf-8",

        "Cache-Control":
          "no-store",
      },
    }
  );
}
