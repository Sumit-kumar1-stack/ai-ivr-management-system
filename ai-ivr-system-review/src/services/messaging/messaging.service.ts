import {
  createServerLogger,
} from "@/lib/logger";

import {
  getMessagingProvider,
} from "./messaging-provider-registry.service";

import {
  registerMessagingProviders,
} from "./register-messaging-providers.service";

import type {
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
// Send
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