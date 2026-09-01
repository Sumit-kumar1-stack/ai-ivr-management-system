import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      create:
        vi.fn(),

      logInfo:
        vi.fn(),

      logError:
        vi.fn(),
    })
  );

vi.mock(
  "plivo",
  () => {
    const MockClient =
      vi.fn(
        function (
          this: any
        ) {
          this.messages = {
            create:
              mocks.create,
          };
          return this;
        }
      );

    return {
      Client:
        MockClient,
    };
  }
);

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(
        () => ({
          info:
            mocks.logInfo,

          error:
            mocks.logError,

          warn:
            vi.fn(),

          debug:
            vi.fn(),
        })
      ),

    normalizeError:
      vi.fn(
        (
          err: unknown
        ) => ({
          message:
            err instanceof
            Error
              ? err.message
              : String(
                  err
                ),
        })
      ),
  })
);

import {
  PlivoSmsAdapter,
} from "@/providers/messaging/plivo-sms.adapter";

describe(
  "PlivoSmsAdapter",
  () => {
    let adapter: PlivoSmsAdapter;

    const originalEnv =
      process.env;

    beforeEach(
      () => {
        vi.clearAllMocks();

        process.env = {
          ...originalEnv,

          PLIVO_AUTH_ID:
            "MAMOCKAUTHID123",

          PLIVO_AUTH_TOKEN:
            "secret_plivo_token",

          PLIVO_SMS_FROM:
            "+15551234567",
        };

        adapter =
          new PlivoSmsAdapter();
      }
    );

    afterEach(
      () => {
        process.env =
          originalEnv;
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
          "PLIVO"
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
    // Configuration Check
    //------------------------------------------------

    it(
      "isConfigured returns true when environment tokens and PLIVO_SMS_FROM exist",
      () => {
        expect(
          adapter.isConfigured()
        ).toBe(
          true
        );
      }
    );

    it(
      "isConfigured returns false when PLIVO_CALLER_ID is present but PLIVO_SMS_FROM is missing",
      () => {
        delete process.env.PLIVO_SMS_FROM;

        process.env.PLIVO_CALLER_ID =
          "+15559876543";

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );
      }
    );

    it(
      "isConfigured returns false when auth ID, token, or PLIVO_SMS_FROM is missing",
      () => {
        delete process.env.PLIVO_AUTH_ID;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );

        process.env.PLIVO_AUTH_ID =
          "MAMOCKAUTHID123";

        delete process.env.PLIVO_AUTH_TOKEN;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );

        process.env.PLIVO_AUTH_TOKEN =
          "secret_plivo_token";

        delete process.env.PLIVO_SMS_FROM;

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );
      }
    );

    it(
      "send fails with PLIVO_SMS_NOT_CONFIGURED when PLIVO_SMS_FROM is missing even if PLIVO_CALLER_ID is set",
      async () => {
        delete process.env.PLIVO_SMS_FROM;

        process.env.PLIVO_CALLER_ID =
          "+15559876543";

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+15551234567",

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
            "PLIVO_SMS_NOT_CONFIGURED"
          );
        }
      }
    );

    //------------------------------------------------
    // Validation & Dispatch
    //------------------------------------------------

    it(
      "rejects non-SMS channel requests",
      async () => {
        const result =
          await adapter.send({
            channel:
              "WHATSAPP" as any,

            recipient:
              "+15551234567",

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
            "CHANNEL_NOT_SUPPORTED"
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
              "+15551234567",

            body:
              "Hello",

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
          mocks.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "successfully sends SMS via Plivo client and extracts message UUID",
      async () => {
        mocks.create.mockResolvedValue({
          apiId:
            "api-123",

          message:
            "message(s) queued",

          messageUuid: [
            "plivo-uuid-98765",
          ],
        });

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+1 (555) 123-4567",

            body:
              "Test Plivo SMS message",

            statusCallbackUrl:
              "https://example.com/api/plivo/messaging/status",
          });

        expect(
          result
        ).toEqual({
          success:
            true,

          provider:
            "PLIVO",

          channel:
            "SMS",

          providerMessageId:
            "plivo-uuid-98765",

          status:
            "queued",
        });

        expect(
          mocks.create
        ).toHaveBeenCalledWith(
          "+15551234567",
          "+15551234567",
          "Test Plivo SMS message",
          {
            url:
              "https://example.com/api/plivo/messaging/status",
          }
        );
      }
    );

    it(
      "handles string messageUuid response format gracefully",
      async () => {
        mocks.create.mockResolvedValue({
          apiId:
            "api-456",

          message:
            "message(s) queued",

          messageUuid:
            "plivo-uuid-single-str",
        });

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+15551234567",

            body:
              "Test single str uuid",
          });

        expect(
          result.success
        ).toBe(
          true
        );

        if (
          result.success
        ) {
          expect(
            result.providerMessageId
          ).toBe(
            "plivo-uuid-single-str"
          );
        }
      }
    );

    it(
      "handles missing message UUID in response",
      async () => {
        mocks.create.mockResolvedValue({
          apiId:
            "api-789",

          message:
            "unexpected format",

          messageUuid: [],
        });

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+15551234567",

            body:
              "Test missing uuid",
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
            "PLIVO_MESSAGE_UUID_MISSING"
          );
        }
      }
    );

    it(
      "handles Plivo API errors safely without leaking auth token",
      async () => {
        mocks.create.mockRejectedValue(
          new Error(
            "Plivo gateway error"
          )
        );

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+15551234567",

            body:
              "Test error message",
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
            "PLIVO_SMS_FAILED"
          );

          expect(
            result.message
          ).toBe(
            "Plivo gateway error"
          );
        }
      }
    );
  }
);
