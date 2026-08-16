import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  resolveMessagingChannel,
} from "./messaging-policy.service";

import {
  requestSms,
} from "@/services/tools/send-sms.service";

import {
  requestWhatsApp,
} from "@/services/tools/send-whatsapp.service";

//--------------------------------------------------
// Input
//--------------------------------------------------

export interface SendCallbackConfirmationInput {
  callId:
    string;

  phone:
    string;

  scheduledFor:
    string;

  timezone:
    string;

  callbackIdempotencyKey:
    string;

  customerName?:
    string;

  signal?:
    AbortSignal;
}

//--------------------------------------------------
// Result
//--------------------------------------------------

export interface CallbackConfirmationNotificationResult {
  attempted:
    boolean;

  sent:
    boolean;

  channel:
    "SMS" |
    "WHATSAPP" |
    null;

  code:
    string | null;

  message:
    string;
}

//--------------------------------------------------
// Send Confirmation
//--------------------------------------------------

export async function sendCallbackConfirmation(
  input:
    SendCallbackConfirmationInput
): Promise<CallbackConfirmationNotificationResult> {
  const log =
    createCallLogger(
      input.callId
    );

  try {
    //------------------------------------------------
    // Resolve Allowed Channel
    //------------------------------------------------

    const decision =
      await resolveMessagingChannel(
        input.phone
      );

    if (
      !decision.allowed ||
      !decision.phone ||
      !decision.channel
    ) {
      log.info(
        {
          event:
            "callback.notification.skipped",

          reason:
            decision.reason,
        },
        "Callback confirmation skipped because no consented messaging channel is available"
      );

      return {
        attempted:
          false,

        sent:
          false,

        channel:
          null,

        code:
          "NO_CONSENTED_CHANNEL",

        message:
          decision.reason ||
          "No consented messaging channel is available.",
      };
    }

    //------------------------------------------------
    // Human-Friendly Callback Time
    //------------------------------------------------

    const callbackTime =
      formatCallbackTime(
        input.scheduledFor,
        input.timezone
      );

    const businessName =
      process.env
        .MESSAGING_BUSINESS_NAME
        ?.trim() ||
      "our team";

    //------------------------------------------------
    // WhatsApp
    //------------------------------------------------

    if (
      decision.channel ===
      "WHATSAPP"
    ) {
      const result =
        await requestWhatsApp({
          callId:
            input.callId,

          recipient:
            decision.phone,

          templateKey:
            "CALLBACK_CONFIRMATION",

          variables: {
            customerName:
              input.customerName,

            callbackTime,

            businessName,
          },

          /*
           * Explicit WHATSAPP OPTED_IN consent was
           * already verified by messaging policy.
           *
           * This is a transactional confirmation of
           * the callback that the caller just
           * explicitly requested and confirmed.
           */
          confirmed:
            true,

          requestedBy:
            "SYSTEM",

          idempotencyKey:
            buildNotificationIdempotencyKey(
              "whatsapp",
              input.callbackIdempotencyKey
            ),

          signal:
            input.signal,
        });

      if (
        !result.success
      ) {
        log.warn(
          {
            event:
              "callback.notification.whatsapp_failed",

            code:
              result.error.code,

            durationMs:
              result.durationMs,
          },
          "Callback WhatsApp confirmation failed"
        );

        return {
          attempted:
            true,

          sent:
            false,

          channel:
            "WHATSAPP",

          code:
            result.error.code,

          message:
            result.error.message,
        };
      }

      log.info(
        {
          event:
            "callback.notification.whatsapp_accepted",

          durationMs:
            result.durationMs,
        },
        "Callback confirmation accepted through WhatsApp Tool Gateway"
      );

      return {
        attempted:
          true,

        /*
         * Here sent means the provider accepted the
         * Tool Gateway request.
         *
         * Delivery/read status is tracked later by
         * the WhatsApp webhook.
         */
        sent:
          true,

        channel:
          "WHATSAPP",

        code:
          null,

        message:
          "WhatsApp callback confirmation was accepted.",
      };
    }

    //------------------------------------------------
    // SMS
    //------------------------------------------------

    const result =
      await requestSms({
        callId:
          input.callId,

        recipient:
          decision.phone,

        templateKey:
          "CALLBACK_CONFIRMATION",

        variables: {
          customerName:
            input.customerName,

          callbackTime,

          businessName,
        },

        /*
         * Explicit SMS OPTED_IN consent was already
         * verified by messaging policy.
         */
        confirmed:
          true,

        requestedBy:
          "SYSTEM",

        idempotencyKey:
          buildNotificationIdempotencyKey(
            "sms",
            input.callbackIdempotencyKey
          ),

        signal:
          input.signal,
      });

    if (
      !result.success
    ) {
      log.warn(
        {
          event:
            "callback.notification.sms_failed",

          code:
            result.error.code,

          durationMs:
            result.durationMs,
        },
        "Callback SMS confirmation failed"
      );

      return {
        attempted:
          true,

        sent:
          false,

        channel:
          "SMS",

        code:
          result.error.code,

        message:
          result.error.message,
      };
    }

    log.info(
      {
        event:
          "callback.notification.sms_accepted",

        durationMs:
          result.durationMs,
      },
      "Callback confirmation accepted through SMS Tool Gateway"
    );

    return {
      attempted:
        true,

      sent:
        true,

      channel:
        "SMS",

      code:
        null,

      message:
        "SMS callback confirmation was accepted.",
    };
  } catch (
    error
  ) {
    log.error(
      {
        event:
          "callback.notification.failed",

        error:
          normalizeError(
            error
          ),
      },
      "Callback confirmation notification failed"
    );

    return {
      attempted:
        true,

      sent:
        false,

      channel:
        null,

      code:
        "CALLBACK_NOTIFICATION_FAILED",

      message:
        "Callback was booked, but the confirmation message could not be sent.",
    };
  }
}

//--------------------------------------------------
// Stable Notification Idempotency
//--------------------------------------------------

function buildNotificationIdempotencyKey(
  channel:
    "sms" |
    "whatsapp",

  callbackIdempotencyKey:
    string
): string {
  const callbackKey =
    callbackIdempotencyKey
      .trim();

  if (
    !callbackKey
  ) {
    throw new Error(
      "Callback idempotency key is required for notification"
    );
  }

  return [
    "callback-confirmation",
    channel,
    callbackKey,
  ].join(
    ":"
  );
}

//--------------------------------------------------
// Callback Time
//--------------------------------------------------

function formatCallbackTime(
  scheduledFor:
    string,

  timezone:
    string
): string {
  const timestamp =
    Date.parse(
      scheduledFor
    );

  if (
    Number.isNaN(
      timestamp
    )
  ) {
    throw new Error(
      "Callback scheduled time is invalid"
    );
  }

  try {
    return new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone:
          timezone,

        dateStyle:
          "medium",

        timeStyle:
          "short",
      }
    ).format(
      new Date(
        timestamp
      )
    );
  } catch {
    throw new Error(
      "Callback timezone is invalid"
    );
  }
}