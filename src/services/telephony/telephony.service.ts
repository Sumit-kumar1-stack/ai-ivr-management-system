import {
  CallStatus,
} from "@prisma/client";

import {
  ProviderFactory,
} from "@/providers/telephony/provider.factory";

import {
  CallRequest,
  ProviderCallRequest,
} from "./types";

import {
  createCall,
  updateCall,
} from "../calls/call.service";

import {
  createConversation,
} from "@/services/conversations/conversation.service";

import {
  mapProviderStatus,
} from "@/providers/telephony/status-map";

import {
  createCallLogger,
} from "@/lib/logger";


export async function startCall(
  request: CallRequest
) {

  //----------------------------------------
  // Get Telephony Provider
  //----------------------------------------

  const provider =
    ProviderFactory.getProvider();


  //----------------------------------------
  // Normalize Phone Values
  //----------------------------------------

  const normalizedContactPhone =
    request.contactPhone.trim();


  const normalizedProviderDestination =
    request.to.trim();


  if (
    !normalizedContactPhone
  ) {
    throw new Error(
      "Contact phone number is required"
    );
  }


  if (
    !normalizedProviderDestination
  ) {
    throw new Error(
      "Provider destination is required"
    );
  }


  //----------------------------------------
  // Atomically Create Idempotent Call
  //----------------------------------------

  const {
    call,
    created,
  } = await createCall({
    campaignId:
      request.campaignId,

    campaignRunId:
      request.campaignRunId,

    contactId:
      request.contactId,

    contactPhoneSnapshot:
      normalizedContactPhone,

    providerDestination:
      normalizedProviderDestination,

    usedDevelopmentOverride:
      request.usedDevelopmentOverride ??
      false,

    destinationOverrideSource:
      request.destinationOverrideSource,

    language:
      request.language,
  });


  const log =
    createCallLogger(
      call.id
    );


  //----------------------------------------
  // Existing Campaign Call
  //----------------------------------------

  if (
    !created
  ) {

    log.warn(
      {
        campaignId:
          request.campaignId,

        campaignRunId:
          request.campaignRunId,

        contactId:
          request.contactId,

        contactPhoneSnapshot:
          call.contactPhoneSnapshot,

        providerDestination:
          call.providerDestination,

        usedDevelopmentOverride:
          call.usedDevelopmentOverride,

        providerCallId:
          call.providerCallId,

        status:
          call.status,
      },
      "Duplicate campaign call prevented"
    );


    /*
     * Never contact the provider again when
     * the campaign-run/contact call already exists.
     */
    return {
      callId:
        call.id,

      providerCallId:
        call.providerCallId ??
        undefined,

      status:
        call.status,

      duplicate:
        true,
    };

  }


  //----------------------------------------
  // Initialization Log
  //----------------------------------------

  log.info(
    {
      campaignId:
        request.campaignId,

      campaignRunId:
        request.campaignRunId,

      contactId:
        request.contactId,

      contactPhoneSnapshot:
        normalizedContactPhone,

      providerDestination:
        normalizedProviderDestination,

      usedDevelopmentOverride:
        request.usedDevelopmentOverride ??
        false,

      destinationOverrideSource:
        request.destinationOverrideSource,

      from:
        request.from,

      language:
        request.language,

      requestedAt:
        call.requestedAt,
    },
    "Outbound call initialization started"
  );


  try {

    //----------------------------------------
    // Create Conversation Record
    //----------------------------------------

    await createConversation(
      call.id
    );


    log.info(
      "Conversation record created"
    );


    //----------------------------------------
    // Build Provider Request
    //----------------------------------------

    const providerRequest:
      ProviderCallRequest = {
        ...request,

        contactPhone:
          normalizedContactPhone,

        to:
          normalizedProviderDestination,

        callId:
          call.id,
      };


    log.info(
      {
        provider:
          provider.constructor.name,

        destination:
          normalizedProviderDestination,
      },
      "Sending outbound call request to provider"
    );


    //----------------------------------------
    // Request Outbound Call
    //----------------------------------------

    const result =
      await provider.makeCall(
        providerRequest
      );


    log.info(
      {
        providerCallId:
          result.callId,

        providerStatus:
          result.status,

        providerDestination:
          normalizedProviderDestination,
      },
      "Provider accepted outbound call request"
    );


    //----------------------------------------
    // Map Provider Status
    //----------------------------------------

    const status =
      mapProviderStatus(
        result.status
      );


    const acceptedAt =
      new Date();


    //----------------------------------------
    // Save Provider Details
    //----------------------------------------

    await updateCall(
      call.id,
      {
        providerCallId:
          result.callId,

        status,

        /*
         * Twilio accepting the REST request
         * does not mean that the call was answered.
         */
        queuedAt:
          status ===
          CallStatus.QUEUED
            ? acceptedAt
            : undefined,

        ringingAt:
          status ===
          CallStatus.RINGING
            ? acceptedAt
            : undefined,

        /*
         * Do not set answeredAt here.
         * It must come from a verified provider
         * status callback.
         */
      }
    );


    log.info(
      {
        providerCallId:
          result.callId,

        internalStatus:
          status,

        queuedAt:
          status ===
          CallStatus.QUEUED
            ? acceptedAt
            : undefined,

        usedDevelopmentOverride:
          request.usedDevelopmentOverride ??
          false,
      },
      "Outbound call request accepted by provider"
    );


    return {
      callId:
        call.id,

      providerCallId:
        result.callId,

      status,

      duplicate:
        false,
    };

  } catch (error) {

    const failedAt =
      new Date();


    log.error(
      {
        error:
          error instanceof Error
            ? {
                name:
                  error.name,

                message:
                  error.message,

                stack:
                  error.stack,
              }
            : String(
                error
              ),

        providerDestination:
          normalizedProviderDestination,

        usedDevelopmentOverride:
          request.usedDevelopmentOverride ??
          false,

        failedAt,
      },
      "Outbound call initialization failed"
    );


    //----------------------------------------
    // Mark Internal Call As Failed
    //----------------------------------------

    try {

      await updateCall(
        call.id,
        {
          status:
            CallStatus.FAILED,

          failedAt,

          completedAt:
            failedAt,
        }
      );


      log.info(
        {
          failedAt,
        },
        "Call record marked as failed"
      );

    } catch (updateError) {

      log.error(
        {
          error:
            updateError instanceof Error
              ? {
                  name:
                    updateError.name,

                  message:
                    updateError.message,

                  stack:
                    updateError.stack,
                }
              : String(
                  updateError
                ),
        },
        "Failed to mark call record as failed"
      );

    }


    throw error;

  }

}