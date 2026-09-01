import type {
  MessagingCapabilityMatrix,
  MessagingChannel,
  MessagingProviderAdapter,
  MessagingProviderCapability,
  MessagingProviderDescriptor,
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
// Provider Labels
//--------------------------------------------------

export const MESSAGING_PROVIDER_LABELS: Record<
  MessagingProviderName,
  string
> = {
  TWILIO:
    "Twilio",

  PLIVO:
    "Plivo",

  EXOTEL:
    "Exotel",

  META:
    "Meta WhatsApp",

  MOCK:
    "Mock Provider",
};

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
// Provider Label Helper
//--------------------------------------------------

export function getProviderLabel(
  provider:
    MessagingProviderName
): string {
  return (
    MESSAGING_PROVIDER_LABELS[
      provider
    ] ??
    provider
  );
}

//--------------------------------------------------
// Provider Name Normalizer
//--------------------------------------------------

export function normalizeProviderName(
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

//--------------------------------------------------
// Preferred / Configured Provider Resolver
//--------------------------------------------------

export function getPreferredMessagingProvider(
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

//--------------------------------------------------
// Provider Enabled Check
//--------------------------------------------------

export function isProviderEnabled(
  provider:
    MessagingProviderName,

  channel:
    MessagingChannel
): boolean {
  if (
    channel ===
    "SMS"
  ) {
    const explicit =
      process.env
        .SMS_PROVIDER;

    if (
      explicit !==
        undefined &&
      explicit.trim() !==
        ""
    ) {
      return (
        normalizeProviderName(
          explicit
        ) ===
        provider
      );
    }

    return (
      provider ===
      "TWILIO"
    );
  }

  if (
    channel ===
    "WHATSAPP"
  ) {
    const whatsappEnabled =
      process.env
        .WHATSAPP_ENABLED;

    if (
      whatsappEnabled !==
        undefined &&
      whatsappEnabled
        .trim()
        .toLowerCase() ===
        "false"
    ) {
      return false;
    }

    const explicit =
      process.env
        .WHATSAPP_PROVIDER;

    if (
      explicit !==
        undefined &&
      explicit.trim() !==
        ""
    ) {
      return (
        normalizeProviderName(
          explicit
        ) ===
        provider
      );
    }

    return (
      provider ===
      "META"
    );
  }

  return false;
}

//--------------------------------------------------
// Missing Configuration Keys Inspector (Safe: No Secret Values)
//--------------------------------------------------

export function getMissingConfigurationKeys(
  provider:
    MessagingProviderName,

  channel:
    MessagingChannel
): string[] {
  const missing: string[] =
    [];

  if (
    provider ===
      "TWILIO" &&
    channel ===
      "SMS"
  ) {
    if (
      !process.env
        .TWILIO_ACCOUNT_SID
        ?.trim()
    ) {
      missing.push(
        "TWILIO_ACCOUNT_SID"
      );
    }

    if (
      !process.env
        .TWILIO_AUTH_TOKEN
        ?.trim()
    ) {
      missing.push(
        "TWILIO_AUTH_TOKEN"
      );
    }

    const hasPhone =
      Boolean(
        process.env
          .TWILIO_PHONE_NUMBER
          ?.trim()
      );

    const hasService =
      Boolean(
        process.env
          .TWILIO_MESSAGING_SERVICE_SID
          ?.trim()
      );

    if (
      !hasPhone &&
      !hasService
    ) {
      missing.push(
        "TWILIO_PHONE_NUMBER"
      );
    }
  } else if (
    provider ===
      "PLIVO" &&
    channel ===
      "SMS"
  ) {
    if (
      !process.env
        .PLIVO_AUTH_ID
        ?.trim()
    ) {
      missing.push(
        "PLIVO_AUTH_ID"
      );
    }

    if (
      !process.env
        .PLIVO_AUTH_TOKEN
        ?.trim()
    ) {
      missing.push(
        "PLIVO_AUTH_TOKEN"
      );
    }

    if (
      !process.env
        .PLIVO_SMS_FROM
        ?.trim()
    ) {
      missing.push(
        "PLIVO_SMS_FROM"
      );
    }
  } else if (
    provider ===
      "EXOTEL" &&
    channel ===
      "SMS"
  ) {
    if (
      !process.env
        .EXOTEL_ACCOUNT_SID
        ?.trim()
    ) {
      missing.push(
        "EXOTEL_ACCOUNT_SID"
      );
    }

    if (
      !process.env
        .EXOTEL_API_KEY
        ?.trim()
    ) {
      missing.push(
        "EXOTEL_API_KEY"
      );
    }

    if (
      !process.env
        .EXOTEL_API_TOKEN
        ?.trim()
    ) {
      missing.push(
        "EXOTEL_API_TOKEN"
      );
    }

    if (
      !process.env
        .EXOTEL_SUBDOMAIN
        ?.trim()
    ) {
      missing.push(
        "EXOTEL_SUBDOMAIN"
      );
    }

    if (
      !process.env
        .EXOTEL_SMS_FROM
        ?.trim()
    ) {
      missing.push(
        "EXOTEL_SMS_FROM"
      );
    }
  } else if (
    provider ===
      "META" &&
    channel ===
      "WHATSAPP"
  ) {
    const hasToken =
      Boolean(
        process.env
          .META_WHATSAPP_ACCESS_TOKEN
          ?.trim() ||
        process.env
          .META_ACCESS_TOKEN
          ?.trim() ||
        process.env
          .META_WA_TOKEN
          ?.trim()
      );

    if (
      !hasToken
    ) {
      missing.push(
        "META_WHATSAPP_ACCESS_TOKEN"
      );
    }

    const hasPhoneId =
      Boolean(
        process.env
          .META_WHATSAPP_PHONE_NUMBER_ID
          ?.trim() ||
        process.env
          .META_PHONE_NUMBER_ID
          ?.trim()
      );

    if (
      !hasPhoneId
    ) {
      missing.push(
        "META_WHATSAPP_PHONE_NUMBER_ID"
      );
    }
  }

  return missing;
}

//--------------------------------------------------
// Single Provider Descriptor (Phase M4)
//--------------------------------------------------

export function getMessagingProviderDescriptor(
  provider:
    MessagingProviderName,

  channel:
    MessagingChannel
): MessagingProviderDescriptor {
  registerMessagingProviders();

  const adapter =
    adapters.get(
      provider
    );

  const supported =
    Boolean(
      adapter &&
      adapter.channels.includes(
        channel
      )
    );

  const configured =
    Boolean(
      adapter &&
      adapter.isConfigured()
    );

  const enabled =
    isProviderEnabled(
      provider,
      channel
    );

  const available =
    supported &&
    configured &&
    enabled;

  const missingConfigurationKeys =
    !configured
      ? getMissingConfigurationKeys(
          provider,
          channel
        )
      : [];

  return {
    provider,
    channel,
    label:
      getProviderLabel(
        provider
      ),

    capabilities:
      adapter
        ? adapter.capabilities
        : [],

    supported,
    configured,
    enabled,
    available,
    missingConfigurationKeys,
  };
}

//--------------------------------------------------
// List Provider Descriptors (API & UI Ready)
//--------------------------------------------------

export function getMessagingProviderDescriptors(
  channel?:
    MessagingChannel
): MessagingProviderDescriptor[] {
  registerMessagingProviders();

  const descriptors: MessagingProviderDescriptor[] =
    [];

  if (
    !channel ||
    channel ===
      "SMS"
  ) {
    for (
      const provider of [
        "TWILIO",
        "PLIVO",
        "EXOTEL",
      ] as const
    ) {
      descriptors.push(
        getMessagingProviderDescriptor(
          provider,
          "SMS"
        )
      );
    }
  }

  if (
    !channel ||
    channel ===
      "WHATSAPP"
  ) {
    for (
      const provider of [
        "META",
      ] as const
    ) {
      descriptors.push(
        getMessagingProviderDescriptor(
          provider,
          "WHATSAPP"
        )
      );
    }
  }

  return descriptors;
}

//--------------------------------------------------
// Provider Status (Alias for Diagnostics / UI)
//--------------------------------------------------

export function getMessagingProviderStatus(
  channel?:
    MessagingChannel
): MessagingProviderDescriptor[] {
  return getMessagingProviderDescriptors(
    channel
  );
}

//--------------------------------------------------
// Available Providers Query
//--------------------------------------------------

export function getAvailableMessagingProviders(
  channel:
    MessagingChannel
): MessagingProviderDescriptor[] {
  return getMessagingProviderDescriptors(
    channel
  ).filter(
    d =>
      d.available
  );
}

//--------------------------------------------------
// Channel Availability Query
//--------------------------------------------------

export function isMessagingChannelAvailable(
  channel:
    MessagingChannel
): boolean {
  return (
    getAvailableMessagingProviders(
      channel
    ).length >
    0
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
  // 2. Explicit Environment Provider Configuration
  //------------------------------------------------

  if (
    hasExplicitEnvironmentProvider(
      channel
    )
  ) {
    const envProviderName =
      getPreferredMessagingProvider(
        channel
      );

    // If an invalid explicit provider was specified (e.g. SMS_PROVIDER=bad), fail closed
    if (
      !envProviderName
    ) {
      return null;
    }

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

    // Explicit selection fails closed
    return null;
  }

  //------------------------------------------------
  // 3. Default Provider by Channel
  //------------------------------------------------

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
  // 4. Fallback to any capable, configured adapter
  // (Only when no explicit provider was configured in env)
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
// Internal Helpers
//--------------------------------------------------

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