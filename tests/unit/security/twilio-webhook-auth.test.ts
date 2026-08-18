import {
  NextRequest,
} from "next/server";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

//--------------------------------------------------
// Hoisted Twilio Mock
//--------------------------------------------------

const mocks =
  vi.hoisted(
    () => ({
      validateRequest:
        vi.fn(),
    })
  );

//--------------------------------------------------
// Mock Twilio SDK
//--------------------------------------------------

vi.mock(
  "twilio",
  () => ({
    default: {
      validateRequest:
        mocks.validateRequest,
    },
  })
);

//--------------------------------------------------
// Import Real Authentication Helper
//--------------------------------------------------

import {
  createTwilioAuthErrorResponse,
  TwilioWebhookAuthenticationError,
  validateTwilioWebhook,
} from "@/lib/twilio-webhook-auth";

//--------------------------------------------------
// Request Factory
//--------------------------------------------------

function createTwilioRequest(
  options: {
    url?: string;

    signature?: string;

    body?: string;
  } = {}
): NextRequest {
  const headers =
    new Headers({
      "content-type":
        "application/x-www-form-urlencoded",
    });

  if (
    options.signature !==
    undefined
  ) {
    headers.set(
      "x-twilio-signature",
      options.signature
    );
  }

  return new NextRequest(
    options.url ??
      "http://malicious-host.test/api/twilio/status",
    {
      method:
        "POST",

      headers,

      body:
        options.body ??
        [
          "CallSid=CA123",
          "CallStatus=completed",
          "CallDuration=42",
        ].join(
          "&"
        ),
    }
  );
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "validateTwilioWebhook",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        /*
         * getTwilioEnvironment() is intentionally strict.
         * Keep every required Twilio setting explicit so
         * each test fails only for the condition it targets.
         */
        vi.stubEnv(
          "TWILIO_ACCOUNT_SID",
          "AC123456789012345678901234567890"
        );

        vi.stubEnv(
          "TWILIO_AUTH_TOKEN",
          "test-twilio-auth-token"
        );

        vi.stubEnv(
          "TWILIO_PHONE_NUMBER",
          "+14155550100"
        );

        vi.stubEnv(
          "TWILIO_PUBLIC_BASE_URL",
          "https://public.example.com"
        );

        vi.stubEnv(
          "TWILIO_MEDIA_PUBLIC_URL",
          "https://media.example.com"
        );

        vi.stubEnv(
          "APP_URL",
          "https://fallback.example.com"
        );

        mocks
          .validateRequest
          .mockReturnValue(
            true
          );
      }
    );

    //------------------------------------------------
    // Missing Signature
    //------------------------------------------------

    it(
      "rejects a request without X-Twilio-Signature",
      async () => {
        const request =
          createTwilioRequest();

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toMatchObject({
          name:
            "TwilioWebhookAuthenticationError",

          message:
            "Missing X-Twilio-Signature header",
        });

        expect(
          mocks.validateRequest
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a signature containing only whitespace",
      async () => {
        const request =
          createTwilioRequest({
            signature:
              "   ",
          });

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toBeInstanceOf(
          TwilioWebhookAuthenticationError
        );

        expect(
          mocks.validateRequest
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Environment Configuration
    //------------------------------------------------

    it(
      "throws when TWILIO_AUTH_TOKEN is missing",
      async () => {
        vi.stubEnv(
          "TWILIO_AUTH_TOKEN",
          ""
        );

        const request =
          createTwilioRequest({
            signature:
              "signature",
          });

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toThrow(
          "TWILIO_AUTH_TOKEN is missing from the environment"
        );

        expect(
          mocks.validateRequest
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "throws when TWILIO_PUBLIC_BASE_URL is missing",
      async () => {
        vi.stubEnv(
          "TWILIO_PUBLIC_BASE_URL",
          ""
        );

        const request =
          createTwilioRequest({
            signature:
              "signature",
          });

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toThrow(
          "TWILIO_PUBLIC_BASE_URL is missing from the environment"
        );

        expect(
          mocks.validateRequest
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a trusted public URL using a non-HTTP protocol",
      async () => {
        vi.stubEnv(
          "TWILIO_PUBLIC_BASE_URL",
          "ftp://public.example.com"
        );

        const request =
          createTwilioRequest({
            signature:
              "signature",
          });

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toThrow(
          "TWILIO_PUBLIC_BASE_URL must use HTTP or HTTPS"
        );

        expect(
          mocks.validateRequest
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Invalid Signature
    //------------------------------------------------

    it(
      "rejects an invalid Twilio signature",
      async () => {
        mocks
          .validateRequest
          .mockReturnValue(
            false
          );

        const request =
          createTwilioRequest({
            signature:
              "invalid-signature",
          });

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toBeInstanceOf(
          TwilioWebhookAuthenticationError
        );

        expect(
          mocks.validateRequest
        ).toHaveBeenCalledOnce();

        expect(
          mocks.validateRequest
        ).toHaveBeenCalledWith(
          "test-twilio-auth-token",
          "invalid-signature",
          "https://public.example.com/api/twilio/status",
          {
            CallSid:
              "CA123",

            CallStatus:
              "completed",

            CallDuration:
              "42",
          }
        );
      }
    );

    //------------------------------------------------
    // Valid Signature And Parameters
    //------------------------------------------------

    it(
      "returns parsed form parameters for a valid signature",
      async () => {
        const request =
          createTwilioRequest({
            signature:
              "valid-signature",

            body:
              [
                "CallSid=CA123",
                "CallStatus=in-progress",
                "CallDuration=15",
              ].join(
                "&"
              ),
          });

        const result =
          await validateTwilioWebhook(
            request
          );

        expect(
          result.params
        ).toEqual({
          CallSid:
            "CA123",

          CallStatus:
            "in-progress",

          CallDuration:
            "15",
        });

        expect(
          result.validationUrl
        ).toBe(
          "https://public.example.com/api/twilio/status"
        );

        expect(
          result.formData
        ).toBeInstanceOf(
          FormData
        );
      }
    );

    //------------------------------------------------
    // Trusted Origin Protection
    //------------------------------------------------

    it(
      "uses the trusted public origin instead of the incoming host",
      async () => {
        const request =
          createTwilioRequest({
            url:
              "http://spoofed-attacker.test/api/twilio/status",

            signature:
              "valid-signature",
          });

        await validateTwilioWebhook(
          request
        );

        expect(
          mocks.validateRequest
        ).toHaveBeenCalledWith(
          "test-twilio-auth-token",
          "valid-signature",
          "https://public.example.com/api/twilio/status",
          {
            CallSid:
              "CA123",

            CallStatus:
              "completed",

            CallDuration:
              "42",
          }
        );
      }
    );

    it(
      "preserves the request pathname and query string",
      async () => {
        const request =
          createTwilioRequest({
            url:
              [
                "http://internal-host.test",
                "/api/twilio/status",
                "?callId=internal-call-1",
                "&source=campaign",
              ].join(
                ""
              ),

            signature:
              "valid-signature",
          });

        const result =
          await validateTwilioWebhook(
            request
          );

        expect(
          result.validationUrl
        ).toBe(
          [
            "https://public.example.com",
            "/api/twilio/status",
            "?callId=internal-call-1",
            "&source=campaign",
          ].join(
            ""
          )
        );

        expect(
          mocks.validateRequest
        ).toHaveBeenCalledWith(
          "test-twilio-auth-token",
          "valid-signature",
          [
            "https://public.example.com",
            "/api/twilio/status",
            "?callId=internal-call-1",
            "&source=campaign",
          ].join(
            ""
          ),
          expect.any(
            Object
          )
        );
      }
    );

    it(
      "accepts a configured public origin with a single root slash",
      async () => {
        vi.stubEnv(
          "TWILIO_PUBLIC_BASE_URL",
          "https://public.example.com/"
        );

        const request =
          createTwilioRequest({
            signature:
              "valid-signature",
          });

        const result =
          await validateTwilioWebhook(
            request
          );

        expect(
          result.validationUrl
        ).toBe(
          "https://public.example.com/api/twilio/status"
        );
      }
    );

    it(
      "does not fall back to APP_URL when TWILIO_PUBLIC_BASE_URL is unavailable",
      async () => {
        vi.stubEnv(
          "TWILIO_PUBLIC_BASE_URL",
          ""
        );

        vi.stubEnv(
          "APP_URL",
          "https://fallback.example.com"
        );

        const request =
          createTwilioRequest({
            signature:
              "valid-signature",
          });

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toThrow(
          "TWILIO_PUBLIC_BASE_URL is missing from the environment"
        );

        expect(
          mocks.validateRequest
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects a configured public URL containing a path",
      async () => {
        vi.stubEnv(
          "TWILIO_PUBLIC_BASE_URL",
          "https://public.example.com/application/path"
        );

        const request =
          createTwilioRequest({
            signature:
              "valid-signature",
          });

        await expect(
          validateTwilioWebhook(
            request
          )
        ).rejects.toThrow(
          "TWILIO_PUBLIC_BASE_URL must contain only the public origin without a path, query, or fragment"
        );

        expect(
          mocks.validateRequest
        ).not.toHaveBeenCalled();
      }
    );
  }
);

//--------------------------------------------------
// Authentication Error Response
//--------------------------------------------------

describe(
  "createTwilioAuthErrorResponse",
  () => {
    it(
      "returns a 403 response for Twilio authentication errors",
      async () => {
        const response =
          createTwilioAuthErrorResponse(
            new TwilioWebhookAuthenticationError()
          );

        expect(
          response
        ).not.toBeNull();

        expect(
          response?.status
        ).toBe(
          403
        );

        expect(
          await response?.json()
        ).toEqual({
          success:
            false,

          message:
            "Forbidden",
        });
      }
    );

    it(
      "returns null for unrelated application errors",
      () => {
        const response =
          createTwilioAuthErrorResponse(
            new Error(
              "Database unavailable"
            )
          );

        expect(
          response
        ).toBeNull();
      }
    );
  }
);