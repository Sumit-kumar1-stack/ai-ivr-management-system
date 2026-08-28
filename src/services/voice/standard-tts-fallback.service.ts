import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

import {
  createCallLogger,
} from "@/lib/logger";

import {
  ProviderFactory,
} from "@/providers/telephony/provider.factory";

import {
  getCall,
} from "@/services/calls/call.service";

import {
  ConversationStateService,
} from "@/services/conversations/conversation-state.service";

import {
  SAFE_TTS_FAILURE_MESSAGE,
} from "./standard-tts-fallback.constants";

export async function playStandardTtsFallback(
  callId: string,
  cause: unknown
): Promise<boolean> {
  const log = createCallLogger(callId);

  void cause;

  try {
    const call = await getCall(callId);
    const providerCallId = call?.providerCallId?.trim();
    const providerName = call?.provider?.trim();

    if (!providerCallId || !providerName) {
      return false;
    }

    const provider =
      ProviderFactory.getProviderForName(
        providerName
      );

    await provider.applyStandardTtsFallback(
      callId,
      providerCallId
    );

    ConversationStateService.setState(callId, "ENDED");

    await EventPublisher.publish(AppEvent.FALLBACK_TRIGGERED, {
      callId,
      fallbackType: "STANDARD_TTS_FAILURE",
      safeMessage: SAFE_TTS_FAILURE_MESSAGE,
      provider:
        provider.name.toUpperCase(),
      actorType: "SYSTEM",
      timestamp: Date.now(),
    });

    log.warn(
      {
        event: "voice.tts.safe_fallback_applied",
        provider:
          provider.name.toUpperCase(),
      },
      "Applied provider-safe static fallback after synthesis failed"
    );

    return true;
  } catch (error) {
    void error;

    log.error(
      {
        event: "voice.tts.safe_fallback_failed",
      },
      "Could not apply the static TTS fallback"
    );

    return false;
  }
}
