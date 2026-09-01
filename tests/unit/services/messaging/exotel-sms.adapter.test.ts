import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ExotelSmsAdapter,
  getExotelSmsConfig,
} from "@/providers/messaging/exotel-sms.adapter";

describe(
  "ExotelSmsAdapter",
  () => {
    let adapter:
      ExotelSmsAdapter;

    const originalEnv =
      process.env;

    const mockFetch =
      vi.fn();

    beforeEach(
      () => {
        vi.stubGlobal(
          "fetch",
          mockFetch
        );

        process.env = {
          ...originalEnv,
        };

        process.env.EXOTEL_ACCOUNT_SID =
          "mock_account_sid_123";

        process.env.EXOTEL_API_KEY =
          "mock_api_key_456";

        process.env.EXOTEL_API_TOKEN =
          "mock_api_token_789";

        process.env.EXOTEL_SUBDOMAIN =
          "api.exotel.com";

        process.env.EXOTEL_SMS_FROM =
          "08012345678";

        delete process.env.EXOTEL_CALLER_ID;

        adapter =
          new ExotelSmsAdapter();

        mockFetch.mockReset();
      }
    );

    afterEach(
      () => {
        process.env =
          originalEnv;

        vi.unstubAllGlobals();
      }
    );

    //------------------------------------------------
    // Contract & Capabilities
    //------------------------------------------------

    it(
      "implements MessagingProviderAdapter with correct provider and capabilities",
      () => {
        expect(
          adapter.provider
        ).toBe(
          "EXOTEL"
        );

        expect(
          adapter.channels
        ).toEqual([
          "SMS",
        ]);

        expect(
          adapter.capabilities
        ).toEqual([
          "SMS_OUTBOUND",
          "SMS_STATUS_CALLBACK",
        ]);

        expect(
          adapter.statusCallbackPath
        ).toBe(
          "/api/exotel/messaging/status"
        );

        expect(
          adapter.supports(
            "SMS"
          )
        ).toBe(
          true
        );

        expect(
          adapter.supports(
            "SMS",
            "SMS_OUTBOUND"
          )
        ).toBe(
          true
        );

        expect(
          adapter.supports(
            "SMS",
            "SMS_STATUS_CALLBACK"
          )
        ).toBe(
          true
        );

        expect(
          adapter.supports(
            "WHATSAPP" as any
          )
        ).toBe(
          false
        );
      }
    );

    //------------------------------------------------
    // Configuration Separation
    //------------------------------------------------

    it(
      "isConfigured returns true when environment tokens and EXOTEL_SMS_FROM exist",
      () => {
        expect(
          adapter.isConfigured()
        ).toBe(
          true
        );
      }
    );

    it(
      "isConfigured returns false when EXOTEL_CALLER_ID is present but EXOTEL_SMS_FROM is missing",
      () => {
        delete process.env.EXOTEL_SMS_FROM;

        process.env.EXOTEL_CALLER_ID =
          "+919876543210";

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );
      }
    );

    it(
      "isConfigured returns false when any required credential is missing",
      () => {
        delete process.env.EXOTEL_ACCOUNT_SID;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );

        process.env.EXOTEL_ACCOUNT_SID =
          "mock_account_sid_123";

        delete process.env.EXOTEL_API_KEY;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );

        process.env.EXOTEL_API_KEY =
          "mock_api_key_456";

        delete process.env.EXOTEL_API_TOKEN;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );

        process.env.EXOTEL_API_TOKEN =
          "mock_api_token_789";

        delete process.env.EXOTEL_SMS_FROM;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );
      }
    );

    it(
      "send fails with EXOTEL_SMS_NOT_CONFIGURED when EXOTEL_SMS_FROM is missing",
      async () => {
        delete process.env.EXOTEL_SMS_FROM;

        process.env.EXOTEL_CALLER_ID =
          "+919876543210";

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+919876543210",

            body:
              "Test SMS",
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "EXOTEL_SMS_NOT_CONFIGURED"
          );
        }

        expect(
          mockFetch
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Validation
    //------------------------------------------------

    it(
      "rejects non-SMS channel requests",
      async () => {
        const result =
          await adapter.send({
            channel:
              "WHATSAPP" as any,

            recipient:
              "+919876543210",

            body:
              "Hello",
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "INVALID_CHANNEL"
          );
        }
      }
    );

    it(
      "handles abort signal before dispatch",
      async () => {
        const controller =
          new AbortController();

        controller.abort();

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+919876543210",

            body:
              "Cancelled message",

            signal:
              controller.signal,
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "MESSAGE_ABORTED"
          );
        }

        expect(
          mockFetch
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Successful Dispatch
    //------------------------------------------------

    it(
      "successfully sends SMS via Exotel REST API and extracts message SID",
      async () => {
        mockFetch.mockResolvedValueOnce({
          ok:
            true,

          status:
            200,

          json: async () => ({
            SMSMessage: {
              Sid:
                "exo-sid-987654321",

              AccountSid:
                "mock_account_sid_123",

              From:
                "08012345678",

              To:
                "+919876543210",

              Body:
                "Test Exotel SMS message",

              Status:
                "queued",
            },
          }),
        });

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "9876543210",

            body:
              "Test Exotel SMS message",

            statusCallbackUrl:
              "https://example.com/api/exotel/messaging/status",
          });

        expect(
          result
        ).toEqual({
          success:
            true,

          provider:
            "EXOTEL",

          channel:
            "SMS",

          providerMessageId:
            "exo-sid-987654321",

          status:
            "queued",
        });

        expect(
          mockFetch
        ).toHaveBeenCalledTimes(
          1
        );

        const [
          url,
          options,
        ] =
          mockFetch.mock.calls[0];

        expect(
          url
        ).toBe(
          "https://api.exotel.com/v1/Accounts/mock_account_sid_123/Sms/send.json"
        );

        expect(
          options.method
        ).toBe(
          "POST"
        );

        expect(
          options.headers[
            "Authorization"
          ]
        ).toBe(
          `Basic ${Buffer.from(
            "mock_api_key_456:mock_api_token_789"
          ).toString(
            "base64"
          )}`
        );

        const bodyParams =
          options.body as URLSearchParams;

        expect(
          bodyParams.get(
            "From"
          )
        ).toBe(
          "08012345678"
        );

        expect(
          bodyParams.get(
            "To"
          )
        ).toBe(
          "+919876543210"
        );

        expect(
          bodyParams.get(
            "Body"
          )
        ).toBe(
          "Test Exotel SMS message"
        );

        expect(
          bodyParams.get(
            "StatusCallback"
          )
        ).toBe(
          "https://example.com/api/exotel/messaging/status"
        );
      }
    );

    //------------------------------------------------
    // Error Handling
    //------------------------------------------------

    it(
      "handles Exotel API error response safely without leaking credentials",
      async () => {
        mockFetch.mockResolvedValueOnce({
          ok:
            false,

          status:
            400,

          json: async () => ({
            RestException: {
              Status:
                400,

              Message:
                "Invalid From number",
            },
          }),
        });

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+919876543210",

            body:
              "Message with error",
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "EXOTEL_SMS_FAILED"
          );

          expect(
            result.message
          ).toBe(
            "Invalid From number"
          );
        }
      }
    );

    it(
      "handles missing SID in Exotel response gracefully",
      async () => {
        mockFetch.mockResolvedValueOnce({
          ok:
            true,

          status:
            200,

          json: async () => ({
            SMSMessage: {
              Status:
                "queued",
            },
          }),
        });

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+919876543210",

            body:
              "Message without SID",
          });

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "EXOTEL_MESSAGE_SID_MISSING"
          );
        }
      }
    );
  }
);
