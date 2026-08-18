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

    META_APP_SECRET:
      "meta-production-test-secret",

    META_WHATSAPP_VERIFY_TOKEN:
      "meta-production-verify-token",
  };

function validate(
  overrides:
    Partial<NodeJS.ProcessEnv> =
      {}
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
      "rejects missing Meta webhook authentication settings",
      () => {
        const report =
          validate({
            META_APP_SECRET:
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
          "META_WHATSAPP_VERIFY_TOKEN"
        );
      }
    );
  }
);