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
  // Create Internal Call Record
  //----------------------------------------

  const call =
    await createCall({
      campaignId:
        request.campaignId,

      contactId:
        request.contactId,

      phone:
        request.to,

      language:
        request.language,
    });

  const log =
    createCallLogger(call.id);

  log.info(
    {
      campaignId:
        request.campaignId,

      contactId:
        request.contactId,

      to:
        request.to,

      from:
        request.from,

      language:
        request.language,
    },
    "Outbound call initialization started"
  );

  try {

    //----------------------------------------
    // Create Empty Conversation Record
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

        callId:
          call.id,
      };

    log.info(
      {
        provider:
          provider.constructor.name,
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
         * Do not set startedAt here.
         *
         * A queued Twilio response does not mean
         * the recipient answered the call.
         *
         * Set startedAt when the provider sends
         * an answered/in-progress status callback.
         */
      }
    );

    log.info(
      {
        providerCallId:
          result.callId,

        internalStatus:
          status,
      },
      "Outbound call queued successfully"
    );

    //----------------------------------------
    // Important
    //----------------------------------------

    /*
     * Do not call startConversation() here.
     *
     * The Twilio REST response only confirms
     * that the outbound request was accepted.
     *
     * The conversation must start from the
     * Twilio Media Streams "start" event after:
     *
     * 1. The recipient answers.
     * 2. Twilio opens the WebSocket.
     * 3. A streamSid is available.
     * 4. The audio session is registered.
     */

    return {
      callId:
        call.id,

      providerCallId:
        result.callId,

      status,
    };

  } catch (error) {

    log.error(
      {
        error,
      },
      "Outbound call initialization failed"
    );

    //----------------------------------------
    // Mark Call as Failed
    //----------------------------------------

    try {

      await updateCall(
        call.id,
        {
          status:
            "FAILED",
        }
      );

      log.info(
        "Call record marked as failed"
      );

    } catch (
      updateError
    ) {

      log.error(
        {
          error:
            updateError,
        },
        "Failed to update call status"
      );

    }

    throw error;

  }

}