import {
  twilioClient,
} from "@/providers/twilio/twilio.client";

import {
  twilioConfig,
} from "@/providers/twilio/twilio.config";

import {
  BaseTelephonyProvider,
} from "./base.provider";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  ProviderCallRequest,
  CallResponse,
} from "@/services/telephony/types";

export class TwilioProvider
  extends BaseTelephonyProvider {

  //--------------------------------------------------
  // Normalize Phone Number
  //--------------------------------------------------

  private formatPhoneNumber(
    phone: string
  ): string {
    const cleaned =
      phone
        .trim()
        .replace(
          /\s+/g,
          ""
        )
        .replace(
          /-/g,
          ""
        )
        .replace(
          /\(/g,
          ""
        )
        .replace(
          /\)/g,
          ""
        );

    //------------------------------------------------
    // Already E.164 format
    //------------------------------------------------

    if (
      cleaned.startsWith(
        "+"
      )
    ) {
      return cleaned;
    }

    //------------------------------------------------
    // Indian 10-digit number
    //------------------------------------------------

    if (
      /^\d{10}$/.test(
        cleaned
      )
    ) {
      return `+91${cleaned}`;
    }

    //------------------------------------------------
    // Indian number beginning with 91
    //------------------------------------------------

    if (
      /^91\d{10}$/.test(
        cleaned
      )
    ) {
      return `+${cleaned}`;
    }

    throw new Error(
      `Invalid phone number format: ${phone}`
    );
  }

  //--------------------------------------------------
  // Make Outbound Call
  //--------------------------------------------------

  async makeCall(
    request: ProviderCallRequest
  ): Promise<CallResponse> {
    const log =
      createCallLogger(
        request.callId
      );

    try {
      //------------------------------------------------
      // Validate request
      //------------------------------------------------

      if (
        !request.callId
      ) {
        throw new Error(
          "callId is required to create a Twilio call"
        );
      }

      if (
        !request.to
      ) {
        throw new Error(
          "Destination phone number is required"
        );
      }

      //------------------------------------------------
      // Format destination number
      //------------------------------------------------

      const formattedNumber =
        this.formatPhoneNumber(
          request.to
        );

      //------------------------------------------------
      // Build Twilio webhook URLs
      //------------------------------------------------

      const voiceUrl =
        `${twilioConfig.appUrl}` +
        `/api/twilio/voice-stream` +
        `?callId=${encodeURIComponent(
          request.callId
        )}`;

      const statusCallbackUrl =
        `${twilioConfig.appUrl}` +
        `/api/twilio/status` +
        `?callId=${encodeURIComponent(
          request.callId
        )}`;

      const recordingCallbackUrl =
        `${twilioConfig.appUrl}` +
        `/api/twilio/recording` +
        `?callId=${encodeURIComponent(
          request.callId
        )}`;

      log.info(
        {
          callId:
            request.callId,

          originalNumber:
            request.to,

          formattedNumber,

          voiceUrl,

          statusCallbackUrl,

          recordingCallbackUrl,
        },

        "Creating Twilio outbound call"
      );

      //------------------------------------------------
      // Create Twilio call
      //------------------------------------------------

      const call =
        await twilioClient.calls.create({
          to:
            formattedNumber,

          from:
            twilioConfig.phoneNumber,

          url:
            voiceUrl,

          method:
            "POST",

          //------------------------------------------
          // Call lifecycle callback
          //------------------------------------------

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

          //------------------------------------------
          // Call recording
          //------------------------------------------

          record:
            true,

          recordingChannels:
            "dual",

          trim:
            "do-not-trim",

          recordingStatusCallback:
            recordingCallbackUrl,

          recordingStatusCallbackMethod:
            "POST",

          recordingStatusCallbackEvent: [
            "completed",
            "absent",
          ],
        });

      log.info(
        {
          callId:
            request.callId,

          providerCallId:
            call.sid,

          status:
            call.status,

          to:
            formattedNumber,

          recordingEnabled:
            true,

          recordingChannels:
            "dual",
        },

        "Twilio call created successfully"
      );

      //------------------------------------------------
      // Return provider response
      //------------------------------------------------

      return {
        callId:
          call.sid,

        status:
          call.status,
      };
    } catch (
      error
    ) {
      log.error(
        {
          callId:
            request.callId,

          destination:
            request.to,

          error:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        },

        "Failed to create Twilio outbound call"
      );

      throw error;
    }
  }

  //--------------------------------------------------
  // End Call
  //--------------------------------------------------

  async endCall(
    callId: string
  ): Promise<void> {
    const log =
      createCallLogger(
        callId
      );

    try {
      if (
        !callId
      ) {
        throw new Error(
          "Twilio provider call ID is required"
        );
      }

      log.info(
        {
          providerCallId:
            callId,
        },

        "Ending Twilio call"
      );

      await twilioClient
        .calls(
          callId
        )
        .update({
          status:
            "completed",
        });

      log.info(
        {
          providerCallId:
            callId,
        },

        "Twilio call ended successfully"
      );
    } catch (
      error
    ) {
      log.error(
        {
          providerCallId:
            callId,

          error:
            error instanceof Error
              ? error.message
              : String(
                  error
                ),
        },

        "Failed to end Twilio call"
      );

      throw error;
    }
  }

  //--------------------------------------------------
  // Handle Webhook
  //--------------------------------------------------

  async handleWebhook(
    body: unknown
  ): Promise<void> {
    console.log(
      "Twilio webhook received"
    );

    console.dir(
      body,
      {
        depth:
          null,
      }
    );
  }
}