//--------------------------------------------------
// Communication Deployment Capabilities
//--------------------------------------------------

export interface CommunicationDeploymentCapabilities {
  whatsapp: {
    enabled: boolean;
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
// Public Deployment Snapshot
//--------------------------------------------------

export function getCommunicationDeploymentCapabilities(
  env: NodeJS.ProcessEnv = process.env
): CommunicationDeploymentCapabilities {
  const whatsappEnabled =
    isWhatsAppDeploymentEnabled(
      env
    );

  return {
    whatsapp: {
      enabled:
        whatsappEnabled,

      reason:
        whatsappEnabled
          ? null
          : "WhatsApp provider is not configured for this deployment",
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
}
