import {
  createServerLogger,
} from "@/lib/logger";

import {
  getMessagingProvider,
  resolveMessagingProvider,
} from "./messaging-provider-registry.service";

import {
  registerMessagingProviders,
} from "./register-messaging-providers.service";

import type {
  MessagingProviderCapability,
  MessagingProviderName,
  MessagingSendRequest,
  MessagingSendResult,
} from "./messaging.types";

//--------------------------------------------------
// Logger
//--------------------------------------------------

const log =
  createServerLogger(
    "messaging-service"
  );

//--------------------------------------------------
// Send by Channel (Provider-Neutral)
//--------------------------------------------------

export async function sendChannelMessage(
  request:
    MessagingSendRequest,

  options: {
    capability?:
      MessagingProviderCapability;

    preferredProvider?:
      MessagingProviderName;
  } = {}
): Promise<MessagingSendResult> {
  const adapter =
    resolveMessagingProvider({
      channel:
        request.channel,

      capability:
        options.capability,

      preferredProvider:
        options.preferredProvider,
    });

  if (
    !adapter
  ) {
    return {
      success:
        false,

      provider:
        options.preferredProvider ??
        "MOCK",

      channel:
        request.channel,

      code:
        "MESSAGING_PROVIDER_NOT_AVAILABLE",

      message:
        "No configured messaging provider is available for this channel and capability.",
    };
  }

  log.info(
    {
      event:
        "messaging.dispatch.started",

      provider:
        adapter.provider,

      channel:
        request.channel,
    },
    "Outbound message dispatch started"
  );

  return adapter.send(
    request
  );
}

//--------------------------------------------------
// Send by Specific Provider
//--------------------------------------------------

export async function sendMessage(
  provider:
    MessagingProviderName,

  request:
    MessagingSendRequest
): Promise<MessagingSendResult> {
  registerMessagingProviders();

  const adapter =
    getMessagingProvider(
      provider
    );

  if (
    !adapter
  ) {
    return {
      success:
        false,

      provider,

      channel:
        request.channel,

      code:
        "MESSAGING_PROVIDER_NOT_REGISTERED",

      message:
        "Messaging provider is not registered.",
    };
  }

  if (
    !adapter.channels.includes(
      request.channel
    )
  ) {
    return {
      success:
        false,

      provider,

      channel:
        request.channel,

      code:
        "MESSAGING_CHANNEL_NOT_SUPPORTED",

      message:
        "Messaging provider does not support this channel.",
    };
  }

  if (
    !adapter.isConfigured()
  ) {
    return {
      success:
        false,

      provider,

      channel:
        request.channel,

      code:
        "MESSAGING_PROVIDER_NOT_CONFIGURED",

      message:
        "Messaging provider configuration is incomplete.",
    };
  }

  log.info(
    {
      event:
        "messaging.dispatch.started",

      provider,

      channel:
        request.channel,
    },
    "Outbound message dispatch started"
  );

  return adapter.send(
    request
  );
}