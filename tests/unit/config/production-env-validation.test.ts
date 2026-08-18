import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateProductionEnvironment,
} from "@/config/production-env-validation";

const BASE_ENV:
  NodeJS.ProcessEnv = {
    NODE_ENV:
      "production",

    DATABASE_URL:
      "postgresql://user:password@db.ivr-prod.net/app?sslmode=require",

    REDIS_URL:
      "rediss://user:password@redis.ivr-prod.net:6379",

    JWT_SECRET:
      "0123456789abcdef0123456789abcdef",

    TELEPHONY_PROVIDER:
      "twilio",

    TWILIO_ACCOUNT_SID:
      "AC0123456789abcdef0123456789abcdef",

    TWILIO_AUTH_TOKEN:
      "0123456789abcdef0123456789abcdef",

    TWILIO_PHONE_NUMBER:
      "+14155550123",

    TWILIO_PUBLIC_BASE_URL:
      "https://voice.ivr-prod.net",

    TWILIO_MEDIA_PUBLIC_URL:
      "https://media.ivr-prod.net",

    GEMINI_API_KEY:
      "gemini-production-test-key",

    DEEPGRAM_API_KEY:
      "deepgram-production-test-key",

    COMMUNICATION_TIER:
      "STANDARD",

    WHATSAPP_ENABLED:
      "false",

    META_APP_SECRET:
      "meta-production-test-secret",

    META_WHATSAPP_ACCESS_TOKEN:
      "meta-production-access-token",

    META_WHATSAPP_PHONE_NUMBER_ID:
      "123456789012345",

    META_WHATSAPP_VERIFY_TOKEN:
      "meta-production-verify-token",
  };

function validate(
  overrides:
    NodeJS.ProcessEnv = {
      NODE_ENV:
        "production",
    }
) {
  return validateProductionEnvironment(
    {
      ...BASE_ENV,
      ...overrides,
    },
    {
      discoverSourceReferences:
        false,
    }
  );
}

describe(
  "production environment validation",
  () => {
    it(
      "accepts the complete Standard production contract",
      () => {
        const report =
          validate();

        expect(
          report.healthy
        ).toBe(
          true
        );

        expect(
          report.tier
        ).toBe(
          "STANDARD"
        );
      }
    );

    it(
      "rejects a local production database",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            DATABASE_URL:
              "postgresql://user:password@127.0.0.1:5432/app",
          });

        expect(
          report.healthy
        ).toBe(
          false
        );

        expect(
          report.checks
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name:
                "DATABASE_URL",
              level:
                "FAIL",
            }),
          ])
        );
      }
    );

    it(
      "rejects development destination overrides",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            TEST_DESTINATION_NUMBER:
              "+14155550124",
          });

        expect(
          report.healthy
        ).toBe(
          false
        );

        expect(
          report.checks
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name:
                "TEST_DESTINATION_NUMBER",
              level:
                "FAIL",
            }),
          ])
        );
      }
    );

    it(
      "rejects Standard worker concurrency above two",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            COMMUNICATION_CAMPAIGN_CONCURRENCY:
              "3",
          });

        expect(
          report.healthy
        ).toBe(
          false
        );

        expect(
          report.checks
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name:
                "COMMUNICATION_CAMPAIGN_CONCURRENCY",
              level:
                "FAIL",
            }),
          ])
        );
      }
    );

    it(
      "accepts Premium concurrency up to ten when human transfer is configured",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            COMMUNICATION_TIER:
              "PREMIUM",

            COMMUNICATION_CAMPAIGN_CONCURRENCY:
              "10",

            HUMAN_TRANSFER_ENABLED:
              "true",

            HUMAN_TRANSFER_DESTINATION:
              "+14155550125",
          });

        expect(
          report.healthy
        ).toBe(
          true
        );

        expect(
          report.tier
        ).toBe(
          "PREMIUM"
        );
      }
    );

    it(
      "fails Premium when human transfer is not enabled",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            COMMUNICATION_TIER:
              "PREMIUM",
          });

        expect(
          report.healthy
        ).toBe(
          false
        );

        expect(
          report.checks
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name:
                "HUMAN_TRANSFER_ENABLED",
              level:
                "FAIL",
            }),
          ])
        );
      }
    );

    it(
      "rejects an invalid production public URL",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            TWILIO_PUBLIC_BASE_URL:
              "http://localhost:3000",
          });

        expect(
          report.healthy
        ).toBe(
          false
        );

        expect(
          report.checks
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name:
                "TWILIO_PUBLIC_BASE_URL",
              level:
                "FAIL",
            }),
          ])
        );
      }
    );

    it(
      "rejects missing Meta settings when WhatsApp is enabled",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            WHATSAPP_ENABLED:
              "true",

            META_APP_SECRET:
              "",

            META_WHATSAPP_ACCESS_TOKEN:
              "",

            META_WHATSAPP_PHONE_NUMBER_ID:
              "",

            META_WHATSAPP_VERIFY_TOKEN:
              "",
          });

        expect(
          report.healthy
        ).toBe(
          false
        );

        const failedNames =
          report.checks
            .filter(
              check =>
                check.level ===
                "FAIL"
            )
            .map(
              check =>
                check.name
            );

        expect(
          failedNames
        ).toContain(
          "META_APP_SECRET"
        );

        expect(
          failedNames
        ).toContain(
          "META_WHATSAPP_ACCESS_TOKEN"
        );

        expect(
          failedNames
        ).toContain(
          "META_WHATSAPP_PHONE_NUMBER_ID"
        );

        expect(
          failedNames
        ).toContain(
          "META_WHATSAPP_VERIFY_TOKEN"
        );
      }
    );

    it(
      "allows missing Meta settings when WhatsApp is disabled",
      () => {
        const report =
          validate({
            NODE_ENV:
              "production",

            WHATSAPP_ENABLED:
              "false",

            META_APP_SECRET:
              "",

            META_WHATSAPP_ACCESS_TOKEN:
              "",

            META_WHATSAPP_PHONE_NUMBER_ID:
              "",

            META_WHATSAPP_VERIFY_TOKEN:
              "",
          });

        expect(
          report.healthy
        ).toBe(
          true
        );

        expect(
          report.checks
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name:
                "WHATSAPP_ENABLED",
              level:
                "PASS",
            }),

            expect.objectContaining({
              name:
                "META_APP_SECRET",
              level:
                "PASS",
            }),

            expect.objectContaining({
              name:
                "META_WHATSAPP_ACCESS_TOKEN",
              level:
                "PASS",
            }),

            expect.objectContaining({
              name:
                "META_WHATSAPP_PHONE_NUMBER_ID",
              level:
                "PASS",
            }),

            expect.objectContaining({
              name:
                "META_WHATSAPP_VERIFY_TOKEN",
              level:
                "PASS",
            }),
          ])
        );
      }
    );
  }
);