import {
  twiml,
} from "twilio";

import {
  twilioClient,
} from "@/providers/twilio/twilio.client";

import {
  getTwilioConfig,
} from "@/providers/twilio/twilio.config";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import type {
  HumanTransferAdapter,
  HumanTransferRequest,
  HumanTransferResult,
} from "@/services/telephony/human-transfer.types";

//--------------------------------------------------
// Adapter
//--------------------------------------------------

export class TwilioHumanTransferAdapter
  implements HumanTransferAdapter
{
  readonly provider =
    "TWILIO" as const;

  //------------------------------------------------
  // Configured
  //------------------------------------------------

  isConfigured():
    boolean {
    try {
      const config =
        getTwilioConfig();

      return Boolean(
        config.accountSid &&
        config.authToken &&
        config.phoneNumber &&
        config.publicBaseUrl
      );
    } catch {
      return false;
    }
  }

  //------------------------------------------------
  // Transfer
  //------------------------------------------------

  async transfer(
    request:
      HumanTransferRequest
  ): Promise<HumanTransferResult> {
    const log =
      createCallLogger(
        request.callId
      );

    const providerCallId =
      request.providerCallId
        .trim();

    const destination =
      request.destination
        .trim();

    //------------------------------------------------
    // Validate Parent Twilio SID
    //------------------------------------------------

    if (
      !isTwilioCallSid(
        providerCallId
      )
    ) {
      return {
        success:
          false,

        provider:
          "TWILIO",

        providerCallId,

        code:
          "INVALID_TWILIO_CALL_SID",

        message:
          "The active Twilio call identifier is invalid.",
      };
    }

    //------------------------------------------------
    // Abort Guard
    //------------------------------------------------

    if (
      request.signal?.aborted
    ) {
      return {
        success:
          false,

        provider:
          "TWILIO",

        providerCallId,

        code:
          "TRANSFER_ABORTED",

        message:
          "Human transfer was cancelled.",
      };
    }

    //------------------------------------------------
    // Strategy
    //------------------------------------------------

    if (
      request.strategy !==
      "DIRECT_NUMBER"
    ) {
      return {
        success:
          false,

        provider:
          "TWILIO",

        providerCallId,

        code:
          "TRANSFER_STRATEGY_NOT_SUPPORTED",

        message:
          `Twilio transfer strategy ${request.strategy} is not implemented yet.`,
      };
    }

    //------------------------------------------------
    // Normalize Destination
    //------------------------------------------------

    const normalizedDestination =
      normalizePhoneNumber(
        destination
      );

    if (
      !normalizedDestination
    ) {
      return {
        success:
          false,

        provider:
          "TWILIO",

        providerCallId,

        code:
          "INVALID_TRANSFER_DESTINATION",

        message:
          "The human-agent phone number is invalid.",
      };
    }

    //------------------------------------------------
    // Twilio Configuration
    //------------------------------------------------

    const config =
      getTwilioConfig();

    //------------------------------------------------
    // Child-Leg Status Callback
    //------------------------------------------------

    const statusCallbackUrl =
      buildTransferStatusCallbackUrl(
        config.publicBaseUrl,
        request.callId
      );

    //------------------------------------------------
    // Build Transfer TwiML
    //------------------------------------------------

    const voiceResponse =
      new twiml.VoiceResponse();

    if (
      request.announcement
        ?.trim()
    ) {
      voiceResponse.say(
        {
          voice:
            "alice",
        },
        request.announcement
          .trim()
      );
    }

    const dial =
      voiceResponse.dial({
        timeout:
          clampTimeout(
            request.timeoutSeconds
          ),

        answerOnBridge:
          true,
      });

    //------------------------------------------------
    // Human Agent Child Call
    //------------------------------------------------

    dial.number(
      {
        statusCallback:
          statusCallbackUrl,

        statusCallbackMethod:
          "POST",

        statusCallbackEvent: [
  "initiated",
  "ringing",
  "answered",
  "completed",
],
      },
      normalizedDestination
    );

    const transferTwiml =
      voiceResponse.toString();

    //------------------------------------------------
    // Execute Parent Call Redirect
    //------------------------------------------------

    try {
      log.info(
        {
          event:
            "twilio.human_transfer.started",

          providerCallId,

          strategy:
            request.strategy,

          destinationMasked:
            maskPhoneNumber(
              normalizedDestination
            ),

          reasonPresent:
            Boolean(
              request.reason
            ),

          statusCallbackConfigured:
            true,
        },
        "Starting Twilio human transfer"
      );

      const updatedCall =
        await twilioClient
          .calls(
            providerCallId
          )
          .update({
            twiml:
              transferTwiml,
          });

      /*
       * This only means Twilio accepted the new TwiML.
       *
       * It does NOT mean:
       *
       * - the destination is ringing
       * - the agent answered
       * - the transfer completed
       *
       * Those states are driven by the child-leg
       * status callback.
       */

      log.info(
        {
          event:
            "twilio.human_transfer.accepted",

          providerCallId:
            updatedCall.sid,

          twilioCallStatus:
            updatedCall.status,

          destinationMasked:
            maskPhoneNumber(
              normalizedDestination
            ),

          childStatusCallbackConfigured:
            true,
        },
        "Twilio accepted human transfer instructions"
      );

      return {
        success:
          true,

        provider:
          "TWILIO",

        providerCallId:
          updatedCall.sid,

        destination:
          normalizedDestination,

        transferReference:
          updatedCall.sid,

        message:
          "Twilio accepted the human transfer instruction.",
      };
    } catch (
      error
    ) {
      log.error(
        {
          event:
            "twilio.human_transfer.failed",

          providerCallId,

          destinationMasked:
            maskPhoneNumber(
              normalizedDestination
            ),

          error:
            normalizeError(
              error
            ),
        },
        "Twilio human transfer failed"
      );

      return {
        success:
          false,

        provider:
          "TWILIO",

        providerCallId,

        code:
          "TWILIO_TRANSFER_FAILED",

        message:
          "Twilio could not start the human transfer.",
      };
    }
  }
}

//--------------------------------------------------
// Transfer Status Callback URL
//--------------------------------------------------

function buildTransferStatusCallbackUrl(
  publicBaseUrl:
    string,

  internalCallId:
    string
): string {
  const normalizedBaseUrl =
    publicBaseUrl
      .trim()
      .replace(
        /\/+$/,
        ""
      );

  const url =
    new URL(
      "/api/twilio/human-transfer/status",
      `${normalizedBaseUrl}/`
    );

  url.searchParams.set(
    "callId",
    internalCallId
  );

  return url.toString();
}

//--------------------------------------------------
// Twilio SID Validation
//--------------------------------------------------

function isTwilioCallSid(
  value:
    string
): boolean {
  return /^CA[a-fA-F0-9]{32}$/.test(
    value
  );
}

//--------------------------------------------------
// Phone Normalization
//--------------------------------------------------

function normalizePhoneNumber(
  phone:
    string
): string | null {
  const normalized =
    phone
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  if (
    !/^\+[1-9]\d{7,14}$/.test(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

//--------------------------------------------------
// Timeout
//--------------------------------------------------

function clampTimeout(
  timeoutSeconds:
    number |
    undefined
): number {
  const value =
    timeoutSeconds ??
    30;

  return Math.min(
    120,
    Math.max(
      5,
      Math.round(
        value
      )
    )
  );
}

//--------------------------------------------------
// Phone Mask
//--------------------------------------------------

function maskPhoneNumber(
  phone:
    string
): string {
  if (
    phone.length <=
    4
  ) {
    return "****";
  }

  return `${"*".repeat(
    Math.max(
      0,
      phone.length -
        4
    )
  )}${phone.slice(-4)}`;
}