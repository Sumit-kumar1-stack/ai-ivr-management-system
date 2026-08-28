import { describe, expect, it } from "vitest";

import { POST as startCall } from "@/app/api/calls/start/route";
import { GET as legacyKnowledgeProbe } from "@/app/api/route";
import { readAdminPasswordResetInput } from "@/lib/admin-password-reset-guard";
import { assertDemoSeedAllowed } from "@/lib/demo-seed-guard";

describe("production hardening", () => {
  it("keeps the legacy unauthenticated call-start route disabled", async () => {
    const response = await startCall();
    expect(response.status).toBe(404);
  });

  it("keeps the unauthenticated legacy knowledge probe disabled", async () => {
    const response = await legacyKnowledgeProbe();
    expect(response.status).toBe(404);
  });

  it("refuses demo seeding in production without the explicit acknowledgement", () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "production" })).toThrow("Refusing to seed demo users");
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "production", ALLOW_PRODUCTION_DEMO_SEED: "I_UNDERSTAND_THIS_CREATES_DEMO_USERS" })).not.toThrow();
  });

  it("requires explicit environment input and acknowledgement for production admin resets", () => {
    expect(() => readAdminPasswordResetInput({ NODE_ENV: "production", RESET_ADMIN_EMAIL: "admin@example.com", RESET_ADMIN_PASSWORD: "A-safe-password-123" })).toThrow("explicit confirmation");
    expect(() => readAdminPasswordResetInput({ NODE_ENV: "production", RESET_ADMIN_EMAIL: "admin@example.com", RESET_ADMIN_PASSWORD: "Admin@123456", CONFIRM_PRODUCTION_ADMIN_PASSWORD_RESET: "I_UNDERSTAND_THIS_RESETS_AN_ADMIN_PASSWORD" })).toThrow("demo credential");
    expect(readAdminPasswordResetInput({ NODE_ENV: "production", RESET_ADMIN_EMAIL: "admin@example.com", RESET_ADMIN_PASSWORD: "A-safe-password-123", CONFIRM_PRODUCTION_ADMIN_PASSWORD_RESET: "I_UNDERSTAND_THIS_RESETS_AN_ADMIN_PASSWORD" })).toMatchObject({ email: "admin@example.com" });
  });
});
