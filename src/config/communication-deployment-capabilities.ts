//--------------------------------------------------
// Communication Deployment Capabilities
//--------------------------------------------------

export interface CommunicationDeploymentCapabilities {
  whatsapp: {
    enabled: boolean;
    reason: string | null;
  };
  sms?: {
    enabled: boolean;
    available: boolean;
    preferredProvider: string | null;
    reason: string | null;
  };
}

//--------------------------------------------------
// WhatsApp Deployment Flag
//--------------------------------------------------

export function isWhatsAppDeploymentEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env
      .WHATSAPP_ENABLED
      ?.trim()
      .toLowerCase() ===
    "true"
  );
}

//--------------------------------------------------
// SMS Deployment Flag
//--------------------------------------------------

export function isSmsDeploymentEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env
      .SMS_ENABLED
      ?.trim()
      .toLowerCase() !==
    "false"
  );
}

//--------------------------------------------------
// Public Deployment Snapshot
//--------------------------------------------------

export function getCommunicationDeploymentCapabilities(
  env: NodeJS.ProcessEnv = process.env
): CommunicationDeploymentCapabilities {
  const whatsappEnabled =
    isWhatsAppDeploymentEnabled(
      env
    );

  const smsEnabled =
    isSmsDeploymentEnabled(
      env
    );

  const preferredSms =
    env
      .SMS_PROVIDER
      ?.trim()
      .toUpperCase() ||
    "TWILIO";

  return {
    whatsapp: {
      enabled:
        whatsappEnabled,

      reason:
        whatsappEnabled
          ? null
          : "WhatsApp provider is not configured for this deployment",
    },
    sms: {
      enabled:
        smsEnabled,

      available:
        smsEnabled,

      preferredProvider:
        preferredSms,

      reason:
        smsEnabled
          ? null
          : "SMS provider is not configured for this deployment",
    },
  };
}

//--------------------------------------------------
// Server-Side Channel Availability Gate
//--------------------------------------------------

export function assertCommunicationDeploymentChannelsAvailable(
  channels: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): void {
  if (
    channels.includes(
      "WHATSAPP"
    ) &&
    !isWhatsAppDeploymentEnabled(
      env
    )
  ) {
    throw new Error(
      "WHATSAPP_PROVIDER_DISABLED: WhatsApp is not enabled for this deployment"
    );
  }

  if (
    channels.includes(
      "SMS"
    ) &&
    !isSmsDeploymentEnabled(
      env
    )
  ) {
    throw new Error(
      "SMS_PROVIDER_DISABLED: SMS is not enabled for this deployment"
    );
  }
}

