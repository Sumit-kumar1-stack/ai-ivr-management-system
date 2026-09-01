import type {
  MessagingCapabilityMatrix,
  MessagingChannel,
  MessagingProviderAdapter,
  MessagingProviderCapability,
  MessagingProviderName,
  ResolveMessagingProviderOptions,
} from "./messaging.types";

import {
  registerMessagingProviders,
} from "./register-messaging-providers.service";

//--------------------------------------------------
// All Known Providers
//--------------------------------------------------

export const KNOWN_MESSAGING_PROVIDERS: readonly MessagingProviderName[] =
  [
    "TWILIO",
    "META",
    "EXOTEL",
    "PLIVO",
    "MOCK",
  ] as const;

//--------------------------------------------------
// Registry
//--------------------------------------------------

const adapters =
  new Map<
    MessagingProviderName,
    MessagingProviderAdapter
  >();

//--------------------------------------------------
// Register
//--------------------------------------------------

export function registerMessagingProvider(
  adapter:
    MessagingProviderAdapter
): void {
  adapters.set(
    adapter.provider,
    adapter
  );
}

//--------------------------------------------------
// Get Provider
//--------------------------------------------------

export function getMessagingProvider(
  provider:
    MessagingProviderName
):
  | MessagingProviderAdapter
  | null {
  return (
    adapters.get(
      provider
    ) ??
    null
  );
}

//--------------------------------------------------
// Get Registered Providers
//--------------------------------------------------

export function getRegisteredMessagingProviders(): MessagingProviderAdapter[] {
  return Array.from(
    adapters.values()
  );
}

//--------------------------------------------------
// Clear
//--------------------------------------------------

export function clearMessagingProviders():
  void {
  adapters.clear();
}

//--------------------------------------------------
// Supports Channel
//--------------------------------------------------

export function providerSupportsChannel(
  provider:
    MessagingProviderName,

  channel:
    MessagingChannel
): boolean {
  const adapter =
    getMessagingProvider(
      provider
    );

  return Boolean(
    adapter &&
    adapter.channels.includes(
      channel
    )
  );
}

//--------------------------------------------------
// Supports Capability
//--------------------------------------------------

export function providerSupportsCapability(
  provider:
    MessagingProviderName,

  capability:
    MessagingProviderCapability
): boolean {
  const adapter =
    getMessagingProvider(
      provider
    );

  return Boolean(
    adapter &&
    adapter.capabilities.includes(
      capability
    )
  );
}

//--------------------------------------------------
// Provider Capabilities
//--------------------------------------------------

export function getMessagingProviderCapabilities(
  provider:
    MessagingProviderName
): readonly MessagingProviderCapability[] {
  const adapter =
    getMessagingProvider(
      provider
    );

  return adapter
    ? adapter.capabilities
    : [];
}

//--------------------------------------------------
// Is Capability Supported
//--------------------------------------------------

export function isMessagingCapabilitySupported(
  provider:
    MessagingProviderName,

  channel:
    MessagingChannel,

  capability?:
    MessagingProviderCapability
): boolean {
  const adapter =
    getMessagingProvider(
      provider
    );

  if (
    !adapter
  ) {
    return false;
  }

  return adapter.supports(
    channel,
    capability
  );
}

//--------------------------------------------------
// Capability Matrix
//--------------------------------------------------

export function getMessagingCapabilityMatrix(): MessagingCapabilityMatrix {
  registerMessagingProviders();

  const matrix: Partial<MessagingCapabilityMatrix> =
    {};

  for (
    const provider of KNOWN_MESSAGING_PROVIDERS
  ) {
    const adapter =
      adapters.get(
        provider
      );

    if (
      adapter
    ) {
      matrix[provider] = {
        channels:
          adapter.channels,

        capabilities:
          adapter.capabilities,

        isConfigured:
          adapter.isConfigured(),
      };
    } else {
      matrix[provider] = {
        channels:
          [],

        capabilities:
          [],

        isConfigured:
          false,
      };
    }
  }

  return matrix as MessagingCapabilityMatrix;
}

//--------------------------------------------------
// Resolve Provider
//--------------------------------------------------

export function resolveMessagingProvider(
  options:
    ResolveMessagingProviderOptions
): MessagingProviderAdapter | null {
  registerMessagingProviders();

  const {
    channel,
    capability,
    preferredProvider,
  } = options;

  //------------------------------------------------
  // 1. Explicit Preferred Provider (Internal hint)
  //------------------------------------------------

  if (
    preferredProvider
  ) {
    const adapter =
      adapters.get(
        preferredProvider
      );

    if (
      adapter &&
      adapter.isConfigured() &&
      adapter.supports(
        channel,
        capability
      )
    ) {
      return adapter;
    }

    return null;
  }

  //------------------------------------------------
  // 2. Environment Provider Configuration
  //------------------------------------------------

  if (
    hasExplicitEnvironmentProvider(
      channel
    )
  ) {
    const envProviderName =
      resolveEnvironmentProvider(
        channel
      );

    if (
      envProviderName
    ) {
      const adapter =
        adapters.get(
          envProviderName
        );

      if (
        adapter &&
        adapter.isConfigured() &&
        adapter.supports(
          channel,
          capability
        )
      ) {
        return adapter;
      }
    }

    return null;
  }

  // Default provider by channel
  const defaultProviderName =
    channel === "SMS"
      ? "TWILIO"
      : "META";

  const defaultAdapter =
    adapters.get(
      defaultProviderName
    );

  if (
    defaultAdapter &&
    defaultAdapter.isConfigured() &&
    defaultAdapter.supports(
      channel,
      capability
    )
  ) {
    return defaultAdapter;
  }

  //------------------------------------------------
  // 3. Fallback to any capable, configured adapter
  //------------------------------------------------

  for (
    const adapter of adapters.values()
  ) {
    if (
      adapter.isConfigured() &&
      adapter.supports(
        channel,
        capability
      )
    ) {
      return adapter;
    }
  }

  return null;
}

//--------------------------------------------------
// Environment Helpers
//--------------------------------------------------

function normalizeProviderName(
  value:
    string |
    undefined
): MessagingProviderName | null {
  if (
    !value
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    normalized ===
      "TWILIO" ||
    normalized ===
      "META" ||
    normalized ===
      "EXOTEL" ||
    normalized ===
      "PLIVO" ||
    normalized ===
      "MOCK"
  ) {
    return normalized as MessagingProviderName;
  }

  return null;
}

function hasExplicitEnvironmentProvider(
  channel:
    MessagingChannel
): boolean {
  if (
    channel ===
    "SMS"
  ) {
    return Boolean(
      process.env
        .SMS_PROVIDER
        ?.trim()
    );
  }

  if (
    channel ===
    "WHATSAPP"
  ) {
    return Boolean(
      process.env
        .WHATSAPP_PROVIDER
        ?.trim()
    );
  }

  return false;
}

function resolveEnvironmentProvider(
  channel:
    MessagingChannel
): MessagingProviderName | null {
  if (
    channel ===
    "SMS"
  ) {
    const envVal =
      process.env
        .SMS_PROVIDER;

    if (
      envVal !==
        undefined &&
      envVal.trim() !==
        ""
    ) {
      return normalizeProviderName(
        envVal
      );
    }

    return "TWILIO";
  }

  if (
    channel ===
    "WHATSAPP"
  ) {
    const envVal =
      process.env
        .WHATSAPP_PROVIDER;

    if (
      envVal !==
        undefined &&
      envVal.trim() !==
        ""
    ) {
      return normalizeProviderName(
        envVal
      );
    }

    return "META";
  }

  return null;
}