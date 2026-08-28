import {
  NextRequest,
} from "next/server";

import {
  createLogger,
  maskPhoneNumber,
  normalizeError,
} from "@/lib/logger";

import {
  createTwilioAuthErrorResponse,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

import {
  createOrGetInboundCall,
} from "@/services/calls/inbound-call.service";

import {
  resolveActiveInboundConfiguration,
} from "@/services/calls/inbound-number.service";

import {
  createErrorTwiml,
  createMediaStreamTwiml,
  createTwimlResponse,
} from "@/providers/telephony/twilio-media-twiml.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createLogger({
    component:
      "twilio-inbound-route",
  });

//--------------------------------------------------
// POST
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<Response> {
  let twilioCallSid =
    "";

  let callerNumber =
    "";

  let calledNumber =
    "";

  try {
    //------------------------------------------------
    // Verify Twilio Signature
    //------------------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    //------------------------------------------------
    // Extract Twilio Fields
    //------------------------------------------------

    twilioCallSid =
      String(
        params.CallSid ??
        ""
      ).trim();

    callerNumber =
      String(
        params.From ??
        ""
      ).trim();

    calledNumber =
      String(
        params.To ??
        ""
      ).trim();

    //------------------------------------------------
    // Required Inputs
    //------------------------------------------------

    if (
      !twilioCallSid ||
      !callerNumber ||
      !calledNumber
    ) {
      log.warn(
        {
          event:
            "twilio.inbound.invalid_payload",

          hasCallSid:
            Boolean(
              twilioCallSid
            ),

          hasFrom:
            Boolean(
              callerNumber
            ),

          hasTo:
            Boolean(
              calledNumber
            ),
        },
        "Inbound Twilio webhook is missing required fields"
      );

      return createTwimlResponse(
        createErrorTwiml(
          "We could not initialize your call."
        )
      );
    }

    //------------------------------------------------
    // Resolve Tenant From Registered Provider Number
    //------------------------------------------------

    const inboundConfiguration =
      await resolveActiveInboundConfiguration({
        provider: "TWILIO",
        calledNumber,
      });

    if (
      !inboundConfiguration.configured
    ) {
      log.warn(
        {
          event: "twilio.inbound.unconfigured_number",
          reason: inboundConfiguration.reason,
          calledNumber: maskPhoneNumber(
            calledNumber
          ),
        },
        "Inbound Twilio call rejected because no eligible tenant configuration was resolved"
      );

      return createTwimlResponse(
        createErrorTwiml(
          "This number is not available for incoming calls right now."
        )
      );
    }

    //------------------------------------------------
    // Create / Recover Internal Call
    //------------------------------------------------

    const inboundCall =
      await createOrGetInboundCall({
        providerCallId:
          twilioCallSid,

        callerNumber,

        calledNumber,

        language:
          inboundConfiguration
            .configuration
            .defaultLanguage,

        tenantId:
          inboundConfiguration
            .configuration
            .tenantId,

        inboundProfileId:
          inboundConfiguration
            .configuration
            .inboundProfileId,

        ivrFlowVersionId:
          inboundConfiguration
            .configuration
            .ivrFlowVersionId,

        requestedRuntime:
          inboundConfiguration
            .configuration
            .requestedRuntime,
      });

    //------------------------------------------------
    // Log
    //------------------------------------------------

    log.info(
      {
        event:
          "twilio.inbound.initialized",

        callId:
          inboundCall.callId,

        campaignId:
          inboundCall.campaignId,

        tenantId:
          inboundCall.tenantId,

        inboundProfileId:
          inboundCall.inboundProfileId,

        requestedRuntime:
          inboundConfiguration
            .configuration
            .requestedRuntime,

        providerCallIdPresent:
          true,

        callerNumber:
          maskPhoneNumber(
            callerNumber
          ),

        calledNumber:
          maskPhoneNumber(
            calledNumber
          ),

        created:
          inboundCall.created,
      },
      "Inbound Twilio call initialized"
    );

    //------------------------------------------------
    // Start Existing Realtime Runtime
    //------------------------------------------------

    return createTwimlResponse(
      createMediaStreamTwiml({
        internalCallId:
          inboundCall.callId,

        twilioCallSid,

        direction:
          "INBOUND",
      })
    );
  } catch (
    error
  ) {
    //------------------------------------------------
    // Twilio Authentication Error
    //------------------------------------------------

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    //------------------------------------------------
    // Initialization Failure
    //------------------------------------------------

    log.error(
      {
        event:
          "twilio.inbound.failed",

        providerCallIdPresent:
          Boolean(
            twilioCallSid
          ),

        callerNumber:
          callerNumber
            ? maskPhoneNumber(
                callerNumber
              )
            : undefined,

        calledNumber:
          calledNumber
            ? maskPhoneNumber(
                calledNumber
              )
            : undefined,

        error:
          normalizeError(
            error
          ),
      },
      "Inbound Twilio webhook failed"
    );

    return createTwimlResponse(
      createErrorTwiml(
        "A call initialization error occurred."
      )
    );
  }
}

//--------------------------------------------------
// Reject GET
//--------------------------------------------------

export async function GET():
  Promise<Response> {
  return new Response(
    "Method Not Allowed",
    {
      status:
        405,

      headers: {
        Allow:
          "POST",

        "Cache-Control":
          "no-store",
      },
    }
  );
}
