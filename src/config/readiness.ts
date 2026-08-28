import { validateEnvironmentFor, type EnvironmentService } from "@/config/process-environment";
import { ProviderFactory } from "@/providers/telephony/provider.factory";

export interface ConfigurationReadinessResult {
  healthy: boolean;
  message: string;
  provider?: string;
  capabilities?: Record<string, boolean>;
}

export interface IntegrationConfigurationReadiness {
  application: ConfigurationReadinessResult;
  redisConfiguration: ConfigurationReadinessResult;
  twilioConfiguration: ConfigurationReadinessResult;
  aiConfiguration: ConfigurationReadinessResult;
}

export function checkIntegrationConfiguration():
  IntegrationConfigurationReadiness {
  const service: EnvironmentService = process.env.IVR_PROCESS_NAME === "media"
    ? "media"
    : process.env.IVR_PROCESS_NAME === "worker"
      ? "worker"
      : "web";

  const check = () => validateEnvironmentFor(service);
  const checkTelephony = () => {
    check();
    const provider = ProviderFactory.getProvider();
    if (service === "media" && (!provider.capabilities.supportsRealtimeMedia || !provider.capabilities.supportsBidirectionalMedia)) {
      throw new Error(`${provider.name} does not support the required bidirectional media runtime`);
    }
    if (service === "media" && (process.env.COMMUNICATION_TIER ?? "STANDARD").trim().toUpperCase() === "PREMIUM" && !provider.capabilities.supportsGeminiLive) {
      throw new Error(`${provider.name} does not support the required Gemini Live media runtime`);
    }
  };

  return {
    application:
      runConfigurationCheck(
        check,
        `${service} configuration is valid`
      ),

    redisConfiguration:
      runConfigurationCheck(
        check,
        `${service} configuration is valid`
      ),

    // Retained key for readiness-response compatibility; this validates the
    // selected provider (Twilio or Exotel), including its media capabilities.
    twilioConfiguration: (() => {
      const provider = safeProviderSummary();
      return {
        ...runConfigurationCheck(
        checkTelephony,
        `${service} telephony provider is ready`
        ),
        provider: provider?.name,
        capabilities: provider?.capabilities,
      };
    })(),

    aiConfiguration:
      runConfigurationCheck(
        check,
        `${service} configuration is valid`
      ),
  };
}

export function isIntegrationConfigurationReady(
  readiness:
    IntegrationConfigurationReadiness
): boolean {
  return (
    readiness.application.healthy &&
    readiness.redisConfiguration.healthy &&
    readiness.twilioConfiguration.healthy &&
    readiness.aiConfiguration.healthy
  );
}

function runConfigurationCheck(
  validation:
    () => void,
  successMessage: string
): ConfigurationReadinessResult {
  try {
    validation();

    return {
      healthy: true,
      message: successMessage,
    };
  } catch (
    error
  ) {
    return {
      healthy: false,
      message:
        getSafeConfigurationErrorMessage(
          error
        ),
    };
  }
}

function getSafeConfigurationErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Invalid integration configuration";
}

function safeProviderSummary(): { name: string; capabilities: Record<string, boolean> } | null {
  try {
    const provider = ProviderFactory.getProvider();
    return {
      name: provider.name,
      capabilities: { ...provider.capabilities },
    };
  } catch {
    return null;
  }
}
