import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
  normalizeError,
} from "@/lib/logger";

import {
  createErrorTwiml,
} from "@/providers/telephony/twilio-media-twiml.service";

import {
  twilioClient,
} from "@/providers/twilio/twilio.client";

import {
  getCall,
} from "@/services/calls/call.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

const SAFE_TTS_FAILURE_MESSAGE =
  "We're sorry, but we're having technical difficulties. Please try again later.";

export async function playStandardTtsFallback(
  callId: string,
  cause: unknown
): Promise<boolean> {
  const log = createCallLogger(callId);

  try {
    const call = await getCall(callId);
    const providerCallId = call?.providerCallId?.trim();

    if (!providerCallId) {
      return false;
    }

    await twilioClient.calls(providerCallId).update({
      twiml: createErrorTwiml(SAFE_TTS_FAILURE_MESSAGE),
    });

    ConversationStateService.setState(callId, "ENDED");

    await EventPublisher.publish(AppEvent.FALLBACK_TRIGGERED, {
      callId,
      fallbackType: "STANDARD_TTS_FAILURE",
      safeMessage: SAFE_TTS_FAILURE_MESSAGE,
      cause: normalizeError(cause).message,
      actorType: "SYSTEM",
      timestamp: Date.now(),
    });

    log.warn(
      {
        event: "voice.tts.safe_fallback_applied",
        providerCallId,
      },
      "Applied static Twilio TTS fallback after synthesis failed"
    );

    return true;
  } catch (error) {
    log.error(
      {
        event: "voice.tts.safe_fallback_failed",
        error: normalizeError(error),
      },
      "Could not apply the static TTS fallback"
    );

    return false;
  }
}
