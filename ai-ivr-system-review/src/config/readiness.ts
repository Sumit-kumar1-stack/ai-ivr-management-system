import {
  getAIEnvironment,
  getApplicationEnvironment,
  getRedisEnvironment,
  getTwilioEnvironment,
} from "@/config/env";

export interface ConfigurationReadinessResult {
  healthy: boolean;
  message: string;
}

export interface IntegrationConfigurationReadiness {
  application: ConfigurationReadinessResult;
  redisConfiguration: ConfigurationReadinessResult;
  twilioConfiguration: ConfigurationReadinessResult;
  aiConfiguration: ConfigurationReadinessResult;
}

export function checkIntegrationConfiguration():
  IntegrationConfigurationReadiness {
  return {
    application:
      runConfigurationCheck(
        () => {
          getApplicationEnvironment();
        },
        "Application configuration is valid"
      ),

    redisConfiguration:
      runConfigurationCheck(
        () => {
          getRedisEnvironment();
        },
        "Redis configuration is valid"
      ),

    twilioConfiguration:
      runConfigurationCheck(
        () => {
          getTwilioEnvironment();
        },
        "Twilio configuration is valid"
      ),

    aiConfiguration:
      runConfigurationCheck(
        () => {
          getAIEnvironment();
        },
        "Gemini and Deepgram configuration is valid"
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