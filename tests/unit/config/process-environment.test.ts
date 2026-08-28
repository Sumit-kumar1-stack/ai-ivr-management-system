import { describe, expect, it } from "vitest";

import {
  EnvironmentValidationError,
  validateEnvironmentFor,
} from "@/config/process-environment";

const common = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@db.example.com:5432/ivr",
  REDIS_URL: "rediss://:password@redis.example.com:6379",
};

const twilio = {
  TELEPHONY_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "AC12345678901234567890123456789012",
  TWILIO_AUTH_TOKEN: "twilio-auth-secret",
  TWILIO_PHONE_NUMBER: "+15555550123",
  TWILIO_PUBLIC_BASE_URL: "https://app.example.com",
};

const exotel = {
  TELEPHONY_PROVIDER: "exotel",
  EXOTEL_ACCOUNT_SID: "exotel-account",
  EXOTEL_API_KEY: "exotel-key",
  EXOTEL_API_TOKEN: "exotel-token",
  EXOTEL_SUBDOMAIN: "api.in.exotel.com",
  EXOTEL_CALLER_ID: "+15555550123",
  EXOTEL_PUBLIC_BASE_URL: "https://app.example.com",
  EXOTEL_WEBHOOK_SECRET: "long-exotel-webhook-secret",
  EXOTEL_MEDIA_PUBLIC_URL: "wss://media.example.com",
  EXOTEL_STREAM_USERNAME: "exotel-stream-user",
  EXOTEL_STREAM_PASSWORD: "exotel-stream-password",
};

const web = {
  ...common,
  JWT_SECRET: "a-very-long-session-secret-that-is-at-least-thirty-two-characters",
  APP_URL: "https://app.example.com",
  KNOWLEDGE_STORAGE_DIR: "C:/persistent/knowledge",
};

const premiumMedia = {
  ...common,
  ...twilio,
  COMMUNICATION_TIER: "PREMIUM",
  PREMIUM_CASCADED_FALLBACK_ENABLED: "false",
  TWILIO_MEDIA_PUBLIC_URL: "https://media.example.com",
  TWILIO_MEDIA_PORT: "8081",
  MEDIA_DRAIN_TIMEOUT_MS: "30000",
  GEMINI_API_KEY: "gemini-secret",
};

function expectInvalid(service: "web" | "media" | "worker", env: Record<string, string | undefined>, variable: string): void {
  try {
    validateEnvironmentFor(service, env);
    throw new Error("expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(EnvironmentValidationError);
    expect((error as EnvironmentValidationError).service).toBe(service);
    expect((error as Error).message).toContain(variable);
  }
}

describe("process-specific environment contracts", () => {
  it("accepts a minimal build environment without runtime credentials", () => {
    expect(() => validateEnvironmentFor("build", { NODE_ENV: "production" })).not.toThrow();
  });

  it("accepts a valid minimal production web environment without media providers", () => {
    expect(() => validateEnvironmentFor("web", web)).not.toThrow();
  });

  it("requires the web session secret, database, and Redis", () => {
    expectInvalid("web", { ...web, JWT_SECRET: "" }, "JWT_SECRET");
    expectInvalid("web", { ...web, DATABASE_URL: "" }, "DATABASE_URL");
    expectInvalid("web", { ...web, REDIS_URL: "" }, "REDIS_URL");
  });

  it("rejects unsafe production web URLs", () => {
    for (const APP_URL of ["http://app.example.com", "https://localhost:3000", "https://demo.ngrok-free.app"]) {
      expectInvalid("web", { ...web, APP_URL }, "APP_URL");
    }
  });

  it("permits localhost and temporary tunnels outside production", () => {
    expect(() => validateEnvironmentFor("web", { ...web, NODE_ENV: "development", APP_URL: "http://localhost:3000" })).not.toThrow();
    expect(() => validateEnvironmentFor("web", { ...web, NODE_ENV: "development", APP_URL: "https://demo.trycloudflare.com" })).not.toThrow();
  });

  it("rejects browser-served and build-output knowledge storage in production", () => {
    expectInvalid("web", { ...web, KNOWLEDGE_STORAGE_DIR: "public/uploads" }, "KNOWLEDGE_STORAGE_DIR");
    expectInvalid("web", { ...web, KNOWLEDGE_STORAGE_DIR: ".next/knowledge" }, "KNOWLEDGE_STORAGE_DIR");
  });

  it("accepts Premium media with its Gemini Live path and fallback disabled", () => {
    expect(() => validateEnvironmentFor("media", premiumMedia)).not.toThrow();
  });

  it("requires Gemini for Premium media", () => {
    expectInvalid("media", { ...premiumMedia, GEMINI_API_KEY: "" }, "GEMINI_API_KEY");
  });

  it("accepts Cascaded media only when Deepgram and Gemini are present", () => {
    const cascaded = { ...premiumMedia, COMMUNICATION_TIER: "STANDARD", DEEPGRAM_API_KEY: "deepgram-secret" };
    expect(() => validateEnvironmentFor("media", cascaded)).not.toThrow();
    expectInvalid("media", { ...cascaded, DEEPGRAM_API_KEY: "" }, "DEEPGRAM_API_KEY");
    expectInvalid("media", { ...cascaded, GEMINI_API_KEY: "" }, "GEMINI_API_KEY");
  });

  it("requires Cascaded providers when Premium fallback is enabled", () => {
    expectInvalid("media", { ...premiumMedia, PREMIUM_CASCADED_FALLBACK_ENABLED: "true" }, "DEEPGRAM_API_KEY");
  });

  it("validates media drain and stable public media URL", () => {
    expectInvalid("media", { ...premiumMedia, MEDIA_DRAIN_TIMEOUT_MS: "zero" }, "MEDIA_DRAIN_TIMEOUT_MS");
    expectInvalid("media", { ...premiumMedia, TWILIO_MEDIA_PUBLIC_URL: "https://localhost:8081" }, "TWILIO_MEDIA_PUBLIC_URL");
    expect(() => validateEnvironmentFor("media", premiumMedia)).not.toThrow();
  });

  it("does not require the legacy human transfer destination", () => {
    expect(() => validateEnvironmentFor("media", premiumMedia)).not.toThrow();
    expect(() => validateEnvironmentFor("media", { ...premiumMedia, HUMAN_TRANSFER_DESTINATION: "" })).not.toThrow();
  });

  it("accepts a minimal worker environment without web or media AI settings", () => {
    const worker = { ...common, ...twilio, WORKER_HEALTH_PORT: "8082" };
    expect(() => validateEnvironmentFor("worker", worker)).not.toThrow();
  });

  it("accepts Exotel worker configuration and requires its documented AgentStream media credentials", () => {
    expect(() => validateEnvironmentFor("worker", { ...common, ...exotel, WORKER_HEALTH_PORT: "8082" })).not.toThrow();
    const media = { ...common, ...exotel, COMMUNICATION_TIER: "STANDARD", TWILIO_MEDIA_PORT: "8081", MEDIA_DRAIN_TIMEOUT_MS: "30000", GEMINI_API_KEY: "gemini-secret", DEEPGRAM_API_KEY: "deepgram-secret" };
    expect(() => validateEnvironmentFor("media", media)).not.toThrow();
    expectInvalid("media", { ...media, EXOTEL_STREAM_PASSWORD: "" }, "EXOTEL_STREAM_PASSWORD");
  });

  it("requires worker database, Redis, and direct Twilio credentials", () => {
    const worker = { ...common, ...twilio, WORKER_HEALTH_PORT: "8082" };
    expectInvalid("worker", { ...worker, DATABASE_URL: "" }, "DATABASE_URL");
    expectInvalid("worker", { ...worker, REDIS_URL: "" }, "REDIS_URL");
    expectInvalid("worker", { ...worker, TWILIO_AUTH_TOKEN: "" }, "TWILIO_AUTH_TOKEN");
  });

  it("rejects invalid provider names and invalid retention settings", () => {
    expectInvalid("media", { ...premiumMedia, TELEPHONY_PROVIDER: "unknown" }, "TELEPHONY_PROVIDER");
    expectInvalid("worker", { ...common, ...twilio, WORKER_HEALTH_PORT: "8082", RETENTION_BATCH_SIZE: "0" }, "RETENTION_BATCH_SIZE");
  });

  it("reports service and variable names without printing secret values", () => {
    const secret = "do-not-print-this-secret";
    try {
      validateEnvironmentFor("media", { ...premiumMedia, TWILIO_AUTH_TOKEN: secret, GEMINI_API_KEY: "" });
      throw new Error("expected validation to fail");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("MEDIA configuration invalid");
      expect(message).toContain("GEMINI_API_KEY");
      expect(message).not.toContain(secret);
      expect(message).not.toContain(common.DATABASE_URL);
    }
  });
});
