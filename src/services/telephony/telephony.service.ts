import {
  CallStatus,
} from "@prisma/client";

import {
  ProviderFactory,
} from "@/providers/telephony/provider.factory";

import {
  CallRequest,
  CallResponse,
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

//--------------------------------------------------
// Start Outbound Call
//--------------------------------------------------

export async function startCall(
  request: CallRequest
): Promise<CallResponse> {
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
  // Resolve Attempt Metadata
  //----------------------------------------

  const attemptNumber =
    request.attemptNumber ??
    1;

  const maxAttempts =
    request.maxAttempts ??
    3;

  if (
    !Number.isInteger(
      attemptNumber
    ) ||
    attemptNumber <
      1
  ) {
    throw new Error(
      "Call attempt number must be a positive integer"
    );
  }

  if (
    !Number.isInteger(
      maxAttempts
    ) ||
    maxAttempts <
      1
  ) {
    throw new Error(
      "Maximum call attempts must be a positive integer"
    );
  }

  if (
    attemptNumber >
    maxAttempts
  ) {
    throw new Error(
      "Call attempt number cannot exceed maximum attempts"
    );
  }

  //----------------------------------------
  // Atomically Create Idempotent Call
  //----------------------------------------

  const {
    call,
    created,
  } =
    await createCall({
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

      attemptNumber,

      maxAttempts,

      retryOfCallId:
        request.retryOfCallId,

      retryReason:
        request.retryReason,
    });

  const log =
    createCallLogger(
      call.id
    );

  //----------------------------------------
  // Existing Campaign Call Attempt
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

        attemptNumber:
          call.attemptNumber,

        maxAttempts:
          call.maxAttempts,

        retryOfCallId:
          call.retryOfCallId,

        retryReason:
          call.retryReason,

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
      "Duplicate campaign call attempt prevented"
    );

    /*
     * Never contact the provider again when the same
     * campaign-run/contact/attempt already exists.
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

      attemptNumber:
        call.attemptNumber,
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

      attemptNumber:
        call.attemptNumber,

      maxAttempts:
        call.maxAttempts,

      retryOfCallId:
        call.retryOfCallId,

      retryReason:
        call.retryReason,

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
      {
        attemptNumber:
          call.attemptNumber,
      },
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

        attemptNumber:
          call.attemptNumber,

        maxAttempts:
          call.maxAttempts,

        retryOfCallId:
          call.retryOfCallId ??
          undefined,

        retryReason:
          call.retryReason ??
          undefined,

        callId:
          call.id,
      };

    log.info(
      {
        provider:
          provider.constructor.name,

        destination:
          normalizedProviderDestination,

        attemptNumber:
          call.attemptNumber,
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

        attemptNumber:
          call.attemptNumber,
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
         * Twilio accepting the REST request does not
         * mean the call was answered.
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
         * Do not set answeredAt here. It must come
         * from a verified provider status callback.
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

        ringingAt:
          status ===
          CallStatus.RINGING
            ? acceptedAt
            : undefined,

        usedDevelopmentOverride:
          request.usedDevelopmentOverride ??
          false,

        attemptNumber:
          call.attemptNumber,
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

      attemptNumber:
        call.attemptNumber,
    };
  } catch (error) {
    const failedAt =
      new Date();

    log.error(
      {
        error:
          error instanceof
          Error
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

        attemptNumber:
          call.attemptNumber,

        maxAttempts:
          call.maxAttempts,

        retryOfCallId:
          call.retryOfCallId,

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

          endedAt:
            failedAt,
        }
      );

      log.info(
        {
          failedAt,

          attemptNumber:
            call.attemptNumber,
        },
        "Call record marked as failed"
      );
    } catch (
      updateError
    ) {
      log.error(
        {
          error:
            updateError instanceof
            Error
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

          attemptNumber:
            call.attemptNumber,
        },
        "Failed to mark call record as failed"
      );
    }

    throw error;
  }
}