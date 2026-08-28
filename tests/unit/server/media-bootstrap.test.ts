import { afterEach, describe, expect, it, vi } from "vitest";
import { validateEnvironmentFor } from "@/config/process-environment";
import { bootstrapMediaProcess } from "@/server/media-bootstrap";

const commonMedia = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://user:password@db.example.com:5432/ivr",
  REDIS_URL: "redis://redis.example.com:6379",
  TWILIO_MEDIA_PORT: "3001",
  MEDIA_DRAIN_TIMEOUT_MS: "30000",
  COMMUNICATION_TIER: "PREMIUM",
  PREMIUM_CASCADED_FALLBACK_ENABLED: "false",
  GEMINI_API_KEY: "loaded-gemini-key",
};

function setEnvironment(values: Record<string, string>): void {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

async function runWithProvider(values: Record<string, string>): Promise<void> {
  const started = vi.fn().mockResolvedValue(undefined);
  await bootstrapMediaProcess(
    () => setEnvironment(values),
    validateEnvironmentFor,
    async () => ({ startMediaProcess: started })
  );
  expect(started).toHaveBeenCalledOnce();
}

afterEach(() => vi.unstubAllEnvs());

describe("media bootstrap ordering", () => {
  it("loads .env values before validation or importing env-dependent media modules", async () => {
    const order: string[] = [];
    const startMediaProcess = vi.fn().mockResolvedValue(undefined);
    await bootstrapMediaProcess(
      () => { order.push("load"); vi.stubEnv("GEMINI_API_KEY", "loaded-before-import"); },
      () => { order.push("validate"); expect(process.env.GEMINI_API_KEY).toBe("loaded-before-import"); },
      async () => { order.push("import"); expect(process.env.GEMINI_API_KEY).toBe("loaded-before-import"); return { startMediaProcess }; }
    );
    expect(order).toEqual(["load", "validate", "import"]);
    expect(startMediaProcess).toHaveBeenCalledOnce();
  });

  it("fails a missing Gemini key before importing the media implementation", async () => {
    const importer = vi.fn();
    await expect(bootstrapMediaProcess(
      () => vi.stubEnv("GEMINI_API_KEY", ""),
      () => { throw new Error("GEMINI_API_KEY is missing from the environment"); },
      importer
    )).rejects.toThrow("GEMINI_API_KEY is missing");
    expect(importer).not.toHaveBeenCalled();
  });

  it("accepts valid Exotel AgentStream media configuration", async () => {
    await runWithProvider({
      ...commonMedia,
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
    });
  });

  it("keeps valid Twilio media configuration working through the same bootstrap", async () => {
    await runWithProvider({
      ...commonMedia,
      TELEPHONY_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC12345678901234567890123456789012",
      TWILIO_AUTH_TOKEN: "twilio-auth-secret",
      TWILIO_PHONE_NUMBER: "+15555550123",
      TWILIO_PUBLIC_BASE_URL: "https://app.example.com",
      TWILIO_MEDIA_PUBLIC_URL: "wss://media.example.com",
    });
  });
});
