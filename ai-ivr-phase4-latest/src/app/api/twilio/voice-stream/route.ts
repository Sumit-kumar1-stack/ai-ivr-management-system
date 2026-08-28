import {
  NextRequest,
  NextResponse,
} from "next/server";

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
  createErrorTwiml,
  createMediaStreamTwiml,
  createTwimlResponse,
} from "@/providers/telephony/twilio-media-twiml.service";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const serviceLog =
  createServerLogger(
    "twilio-voice-stream-route"
  );

//--------------------------------------------------
// Twilio Voice Stream Webhook
//--------------------------------------------------

export async function POST(
  request:
    NextRequest
): Promise<Response> {
  let internalCallId =
    "";

  let twilioCallSid =
    "";

  try {
    //----------------------------------------------
    // Validate Twilio HTTP Signature
    //----------------------------------------------

    const {
      params,
    } =
      await validateTwilioWebhook(
        request
      );

    //----------------------------------------------
    // Read Internal Call ID
    //----------------------------------------------

    internalCallId =
      request.nextUrl
        .searchParams
        .get(
          "callId"
        )
        ?.trim() ??
      "";

    //----------------------------------------------
    // Read Twilio Call SID
    //----------------------------------------------

    twilioCallSid =
      String(
        params.CallSid ??
          ""
      ).trim();

    //----------------------------------------------
    // Validate Internal Call ID
    //----------------------------------------------

    if (
      !internalCallId
    ) {
      serviceLog.warn(
        {
          event:
            "twilio.voice_stream.rejected",

          reason:
            "missing_internal_call_id",

          twilioCallSidPresent:
            Boolean(
              twilioCallSid
            ),
        },
        "Twilio voice stream request rejected"
      );

      return createTwimlResponse(
        createErrorTwiml(
          "We could not initialize this call."
        )
      );
    }

    //----------------------------------------------
    // Call Logger
    //----------------------------------------------

    const log =
      createCallLogger(
        internalCallId
      );

    //----------------------------------------------
    // Validate Twilio Call SID
    //----------------------------------------------

    if (
      !twilioCallSid
    ) {
      log.warn(
        {
          event:
            "twilio.voice_stream.rejected",

          reason:
            "missing_provider_call_id",
        },
        "Twilio voice stream request rejected"
      );

      return createTwimlResponse(
        createErrorTwiml(
          "We could not verify this call."
        )
      );
    }

    //----------------------------------------------
    // Load Internal Call
    //----------------------------------------------

    let call =
      await prisma.call
        .findUnique({
          where: {
            id:
              internalCallId,
          },

          select: {
            id:
              true,

            providerCallId:
              true,

            status:
              true,

            direction:
              true,
          },
        });

    //----------------------------------------------
    // Call Must Exist
    //----------------------------------------------

    if (
      !call
    ) {
      log.warn(
        {
          event:
            "twilio.voice_stream.rejected",

          reason:
            "internal_call_not_found",

          twilioCallSidPresent:
            true,
        },
        "Internal call record not found"
      );

      return createTwimlResponse(
        createErrorTwiml(
          "The call session could not be found."
        )
      );
    }

    //----------------------------------------------
    // Outbound Route Ownership
    //----------------------------------------------

    /*
     * /voice-stream is the outbound Twilio
     * continuation route.
     *
     * Inbound calls enter through /twilio/inbound,
     * which creates INBOUND Media Stream TwiML.
     */
    if (
      call.direction !==
      "OUTBOUND"
    ) {
      log.warn(
        {
          event:
            "twilio.voice_stream.rejected",

          reason:
            "non_outbound_call",

          direction:
            call.direction,
        },
        "Non-outbound call attempted to use outbound voice stream route"
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

    //----------------------------------------------
    // Verify Existing Provider Association
    //----------------------------------------------

    if (
      call.providerCallId &&
      call.providerCallId !==
        twilioCallSid
    ) {
      log.warn(
        {
          event:
            "twilio.voice_stream.rejected",

          reason:
            "provider_call_id_mismatch",

          storedProviderCallIdPresent:
            true,

          receivedProviderCallIdPresent:
            true,
        },
        "Twilio call association mismatch"
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

    //----------------------------------------------
    // Associate Provider Call SID If Missing
    //----------------------------------------------

    if (
      !call.providerCallId
    ) {
      /*
       * updateMany with providerCallId:null creates
       * a compare-and-set operation.
       *
       * Only one concurrent webhook may establish
       * the provider association.
       */
      const associationResult =
        await prisma.call
          .updateMany({
            where: {
              id:
                internalCallId,

              providerCallId:
                null,
            },

            data: {
              providerCallId:
                twilioCallSid,
            },
          });

      //--------------------------------------------
      // Association Won
      //--------------------------------------------

      if (
        associationResult.count ===
        1
      ) {
        log.info(
          {
            event:
              "twilio.voice_stream.provider_id_associated",

            updatedRecordCount:
              1,

            providerCallIdPresent:
              true,
          },
          "Twilio provider call ID associated with internal call"
        );

        call = {
          ...call,

          providerCallId:
            twilioCallSid,
        };
      } else {
        //------------------------------------------
        // Concurrent Association Race
        //------------------------------------------

        const currentCall =
          await prisma.call
            .findUnique({
              where: {
                id:
                  internalCallId,
              },

              select: {
                id:
                  true,

                providerCallId:
                  true,

                status:
                  true,

                direction:
                  true,
              },
            });

        //------------------------------------------
        // Call Disappeared
        //------------------------------------------

        if (
          !currentCall
        ) {
          log.warn(
            {
              event:
                "twilio.voice_stream.rejected",

              reason:
                "call_disappeared_during_association",
            },
            "Internal call disappeared during provider association"
          );

          return createTwimlResponse(
            createErrorTwiml(
              "The call session could not be found."
            )
          );
        }

        //------------------------------------------
        // Another SID Won The Race
        //------------------------------------------

        if (
          currentCall.providerCallId !==
          twilioCallSid
        ) {
          log.warn(
            {
              event:
                "twilio.voice_stream.rejected",

              reason:
                "provider_association_race_mismatch",

              storedProviderCallIdPresent:
                Boolean(
                  currentCall.providerCallId
                ),

              receivedProviderCallIdPresent:
                true,
            },
            "Twilio provider association changed concurrently"
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

        call =
          currentCall;

        log.info(
          {
            event:
              "twilio.voice_stream.provider_id_already_associated",

            providerCallIdPresent:
              true,
          },
          "Twilio provider call ID was associated concurrently"
        );
      }
    }

    //----------------------------------------------
    // Build Canonical Outbound Media Stream TwiML
    //----------------------------------------------

    const twiml =
      createMediaStreamTwiml({
        internalCallId,

        twilioCallSid,

        direction:
          "OUTBOUND",
      });

    //----------------------------------------------
    // Log Successful Initialization
    //----------------------------------------------

    log.info(
      {
        event:
          "twilio.voice_stream.twiml_created",

        direction:
          "OUTBOUND",

        providerCallIdPresent:
          true,

        callStatus:
          call.status,
      },
      "Authenticated outbound Twilio Media Stream TwiML created"
    );

    //----------------------------------------------
    // Return TwiML
    //----------------------------------------------

    return createTwimlResponse(
      twiml
    );
  } catch (
    error
  ) {
    //----------------------------------------------
    // Twilio Authentication Error
    //----------------------------------------------

    const authResponse =
      createTwilioAuthErrorResponse(
        error
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    //----------------------------------------------
    // Generic Initialization Error
    //----------------------------------------------

    const log =
      internalCallId
        ? createCallLogger(
            internalCallId
          )
        : serviceLog;

    log.error(
      {
        event:
          "twilio.voice_stream.initialization_failed",

        internalCallIdPresent:
          Boolean(
            internalCallId
          ),

        twilioCallSidPresent:
          Boolean(
            twilioCallSid
          ),

        error:
          normalizeError(
            error
          ),
      },
      "Failed to initialize Twilio voice stream"
    );

    return createTwimlResponse(
      createErrorTwiml(
        "A call initialization error occurred."
      )
    );
  }
}

//--------------------------------------------------
// Reject GET Requests
//--------------------------------------------------

export async function GET():
  Promise<NextResponse> {
  return NextResponse.json(
    {
      success:
        false,

      message:
        "Method not allowed",
    },
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