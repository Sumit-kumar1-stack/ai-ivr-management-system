import {
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

      getTwilioConfig:
        vi.fn(),

      logInfo:
        vi.fn(),

      logError:
        vi.fn(),
    })
  );

vi.mock(
  "@/providers/twilio/twilio.client",
  () => ({
    twilioClient: {
      messages: {
        create:
          mocks.create,
      },
    },
  })
);

vi.mock(
  "@/providers/twilio/twilio.config",
  () => ({
    getTwilioConfig:
      mocks.getTwilioConfig,
  })
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
  TwilioSmsAdapter,
} from "@/providers/messaging/twilio-sms.adapter";

describe(
  "TwilioSmsAdapter",
  () => {
    let adapter: TwilioSmsAdapter;

    beforeEach(
      () => {
        vi.clearAllMocks();

        adapter =
          new TwilioSmsAdapter();

        mocks.getTwilioConfig.mockReturnValue({
          accountSid:
            "AC123",

          authToken:
            "secret",

          phoneNumber:
            "+15551234567",
        });
      }
    );

    it(
      "implements MessagingProviderAdapter with correct provider and capabilities",
      () => {
        expect(
          adapter.provider
        ).toBe(
          "TWILIO"
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

    it(
      "isConfigured returns true when config is present",
      () => {
        expect(
          adapter.isConfigured()
        ).toBe(
          true
        );
      }
    );

    it(
      "isConfigured returns false when credentials are missing",
      () => {
        mocks.getTwilioConfig.mockReturnValue({
          accountSid:
            "",

          authToken:
            "",

          phoneNumber:
            "",
        });

        expect(
          adapter.isConfigured()
        ).toBe(
          false
        );
      }
    );

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
      "successfully sends SMS via Twilio client",
      async () => {
        mocks.create.mockResolvedValue({
          sid:
            "SM12345",

          status:
            "queued",
        });

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+15551234567",

            body:
              "Test message",

            statusCallbackUrl:
              "https://example.com/callback",
          });

        expect(
          result
        ).toEqual({
          success:
            true,

          provider:
            "TWILIO",

          channel:
            "SMS",

          providerMessageId:
            "SM12345",

          status:
            "queued",
        });

        expect(
          mocks.create
        ).toHaveBeenCalledWith({
          to:
            "+15551234567",

          body:
            "Test message",

          from:
            "+15551234567",

          statusCallback:
            "https://example.com/callback",
        });
      }
    );

    it(
      "handles Twilio API errors safely",
      async () => {
        mocks.create.mockRejectedValue(
          new Error(
            "Twilio network failure"
          )
        );

        const result =
          await adapter.send({
            channel:
              "SMS",

            recipient:
              "+15551234567",

            body:
              "Test message",
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
            "TWILIO_SMS_FAILED"
          );
        }
      }
    );
  }
);
