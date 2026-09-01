import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  buildMessagingStatusCallbackUrl,
  getMessagingProviderBaseUrl,
} from "@/services/messaging/messaging-status-callback.service";

import type {
  MessagingProviderAdapter,
} from "@/services/messaging/messaging.types";

describe(
  "Messaging Status Callback Service",
  () => {
    const originalEnv =
      process.env;

    beforeEach(
      () => {
        process.env = {
          ...originalEnv,
        };

        delete process.env.TWILIO_PUBLIC_BASE_URL;
        delete process.env.PLIVO_PUBLIC_BASE_URL;
        delete process.env.EXOTEL_PUBLIC_BASE_URL;
        delete process.env.META_PUBLIC_BASE_URL;
        delete process.env.APP_URL;
      }
    );

    afterEach(
      () => {
        process.env =
          originalEnv;
      }
    );

    describe(
      "getMessagingProviderBaseUrl",
      () => {
        it(
          "prefers TWILIO_PUBLIC_BASE_URL over APP_URL for Twilio",
          () => {
            process.env.TWILIO_PUBLIC_BASE_URL =
              "https://twilio-tunnel.example.com/";

            process.env.APP_URL =
              "https://app.example.com/";

            expect(
              getMessagingProviderBaseUrl(
                "TWILIO"
              )
            ).toBe(
              "https://twilio-tunnel.example.com"
            );
          }
        );

        it(
          "prefers PLIVO_PUBLIC_BASE_URL over APP_URL for Plivo",
          () => {
            process.env.PLIVO_PUBLIC_BASE_URL =
              "https://plivo-tunnel.example.com/";

            process.env.APP_URL =
              "https://app.example.com/";

            expect(
              getMessagingProviderBaseUrl(
                "PLIVO"
              )
            ).toBe(
              "https://plivo-tunnel.example.com"
            );
          }
        );

        it(
          "prefers EXOTEL_PUBLIC_BASE_URL over APP_URL for Exotel",
          () => {
            process.env.EXOTEL_PUBLIC_BASE_URL =
              "https://exotel-tunnel.example.com/";

            process.env.APP_URL =
              "https://app.example.com/";

            expect(
              getMessagingProviderBaseUrl(
                "EXOTEL"
              )
            ).toBe(
              "https://exotel-tunnel.example.com"
            );
          }
        );

        it(
          "falls back to APP_URL when provider-specific base URL is missing",
          () => {
            process.env.APP_URL =
              "https://app.example.com/";

            expect(
              getMessagingProviderBaseUrl(
                "TWILIO"
              )
            ).toBe(
              "https://app.example.com"
            );

            expect(
              getMessagingProviderBaseUrl(
                "PLIVO"
              )
            ).toBe(
              "https://app.example.com"
            );

            expect(
              getMessagingProviderBaseUrl(
                "EXOTEL"
              )
            ).toBe(
              "https://app.example.com"
            );
          }
        );

        it(
          "returns undefined when neither provider-specific URL nor APP_URL is configured",
          () => {
            expect(
              getMessagingProviderBaseUrl(
                "TWILIO"
              )
            ).toBeUndefined();

            expect(
              getMessagingProviderBaseUrl(
                "PLIVO"
              )
            ).toBeUndefined();
          }
        );
      }
    );

    describe(
      "buildMessagingStatusCallbackUrl",
      () => {
        it(
          "constructs Twilio status callback URL with URL-encoded messageId",
          () => {
            process.env.TWILIO_PUBLIC_BASE_URL =
              "https://twilio.example.com";

            const url =
              buildMessagingStatusCallbackUrl({
                provider:
                  "TWILIO",

                outboundMessageId:
                  "msg-123/special?&=#",
              });

            expect(
              url
            ).toBe(
              "https://twilio.example.com/api/twilio/messaging/status?messageId=msg-123%2Fspecial%3F%26%3D%23"
            );
          }
        );

        it(
          "constructs Plivo status callback URL with URL-encoded messageId",
          () => {
            process.env.PLIVO_PUBLIC_BASE_URL =
              "https://plivo.example.com";

            const url =
              buildMessagingStatusCallbackUrl({
                provider:
                  "PLIVO",

                outboundMessageId:
                  "plivo-msg-456",
              });

            expect(
              url
            ).toBe(
              "https://plivo.example.com/api/plivo/messaging/status?messageId=plivo-msg-456"
            );
          }
        );

        it(
          "constructs Exotel status callback URL for future M3 provider",
          () => {
            process.env.EXOTEL_PUBLIC_BASE_URL =
              "https://exotel.example.com";

            const url =
              buildMessagingStatusCallbackUrl({
                provider:
                  "EXOTEL",

                outboundMessageId:
                  "exo-msg-789",
              });

            expect(
              url
            ).toBe(
              "https://exotel.example.com/api/exotel/messaging/status?messageId=exo-msg-789"
            );
          }
        );

        it(
          "accepts an adapter instance and uses adapter.statusCallbackPath",
          () => {
            process.env.PLIVO_PUBLIC_BASE_URL =
              "https://plivo.example.com";

            const mockAdapter: MessagingProviderAdapter =
              {
                provider:
                  "PLIVO",

                channels: [
                  "SMS",
                ],

                capabilities: [
                  "SMS_OUTBOUND",
                  "SMS_STATUS_CALLBACK",
                ],

                statusCallbackPath:
                  "/api/plivo/messaging/status",

                supports:
                  () =>
                    true,

                isConfigured:
                  () =>
                    true,

                send: async () => ({
                  success:
                    true,

                  provider:
                    "PLIVO",

                  channel:
                    "SMS",

                  providerMessageId:
                    "uuid-1",

                  status:
                    "queued",
                }),
              };

            const url =
              buildMessagingStatusCallbackUrl({
                provider:
                  mockAdapter,

                outboundMessageId:
                  "msg-abc",
              });

            expect(
              url
            ).toBe(
              "https://plivo.example.com/api/plivo/messaging/status?messageId=msg-abc"
            );
          }
        );

        it(
          "falls back to APP_URL if provider-specific base URL is missing",
          () => {
            process.env.APP_URL =
              "https://global-app.example.com";

            const url =
              buildMessagingStatusCallbackUrl({
                provider:
                  "TWILIO",

                outboundMessageId:
                  "msg-fallback",
              });

            expect(
              url
            ).toBe(
              "https://global-app.example.com/api/twilio/messaging/status?messageId=msg-fallback"
            );
          }
        );

        it(
          "returns undefined when outboundMessageId is empty or base URL is unconfigured",
          () => {
            process.env.TWILIO_PUBLIC_BASE_URL =
              "https://twilio.example.com";

            expect(
              buildMessagingStatusCallbackUrl({
                provider:
                  "TWILIO",

                outboundMessageId:
                  "",
              })
            ).toBeUndefined();

            delete process.env.TWILIO_PUBLIC_BASE_URL;

            expect(
              buildMessagingStatusCallbackUrl({
                provider:
                  "TWILIO",

                outboundMessageId:
                  "msg-123",
              })
            ).toBeUndefined();
          }
        );
      }
    );
  }
);
