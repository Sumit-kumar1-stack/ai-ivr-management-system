import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

//--------------------------------------------------
// Hoisted Mocks
//--------------------------------------------------

const mocks =
  vi.hoisted(
    () => {
      class MockTwilioAuthError
        extends Error {
        constructor(
          message =
            "Invalid Twilio webhook signature"
        ) {
          super(
            message
          );

          this.name =
            "TwilioWebhookAuthenticationError";
        }
      }

      return {
        validateTwilioWebhook:
          vi.fn(),

        updateCallStatus:
          vi.fn(),

        MockTwilioAuthError,
      };
    }
  );

//--------------------------------------------------
// Module Mocks
//--------------------------------------------------

vi.mock(
  "@/lib/twilio-webhook-auth",
  () => ({
    TwilioWebhookAuthenticationError:
      mocks.MockTwilioAuthError,

    validateTwilioWebhook:
      mocks.validateTwilioWebhook,

    createTwilioAuthErrorResponse:
      (
        error: unknown
      ) => {
        if (
          error instanceof
          mocks.MockTwilioAuthError
        ) {
          return NextResponse.json(
            {
              success:
                false,

              message:
                "Forbidden",
            },
            {
              status:
                403,
            }
          );
        }

        return null;
      },
  })
);

vi.mock(
  "@/services/calls/call.service",
  () => ({
    updateCallStatus:
      mocks.updateCallStatus,
  })
);

//--------------------------------------------------
// Import Route After Mocks
//--------------------------------------------------

import {
  POST,
} from "@/app/api/twilio/status/route";

//--------------------------------------------------
// Request Factory
//--------------------------------------------------

function createRequest(
  options: {
    callId?: string;

    signature?: string;
  } = {}
): NextRequest {
  const url =
    new URL(
      "https://example.com/api/twilio/status"
    );

  if (
    options.callId
  ) {
    url.searchParams.set(
      "callId",
      options.callId
    );
  }

  const headers =
    new Headers({
      "content-type":
        "application/x-www-form-urlencoded",
    });

  if (
    options.signature
  ) {
    headers.set(
      "x-twilio-signature",
      options.signature
    );
  }

  return new NextRequest(
    url,
    {
      method:
        "POST",

      headers,

      body:
        "CallSid=CA123&CallStatus=completed",
    }
  );
}

//--------------------------------------------------
// Validated Webhook Fixture
//--------------------------------------------------

function mockValidatedWebhook(
  params:
    Record<
      string,
      string
    >
) {
  mocks
    .validateTwilioWebhook
    .mockResolvedValue({
      formData:
        new FormData(),

      params,

      validationUrl:
        "https://example.com/api/twilio/status",
    });
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "POST /api/twilio/status",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        vi.spyOn(
          console,
          "log"
        ).mockImplementation(
          () => undefined
        );

        vi.spyOn(
          console,
          "warn"
        ).mockImplementation(
          () => undefined
        );

        vi.spyOn(
          console,
          "error"
        ).mockImplementation(
          () => undefined
        );
      }
    );

    //------------------------------------------------
    // Authentication
    //------------------------------------------------

    it(
      "returns 403 when webhook authentication fails",
      async () => {
        mocks
          .validateTwilioWebhook
          .mockRejectedValue(
            new mocks
              .MockTwilioAuthError(
                "Missing X-Twilio-Signature header"
              )
          );

        const response =
          await POST(
            createRequest()
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          403
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "Forbidden",
        });

        expect(
          mocks
            .updateCallStatus
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Required Fields
    //------------------------------------------------

    it(
      "returns 400 when CallSid is missing",
      async () => {
        mockValidatedWebhook({
          CallStatus:
            "completed",
        });

        const response =
          await POST(
            createRequest({
              signature:
                "valid-signature",
            })
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          400
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "CallSid and CallStatus are required",
        });

        expect(
          mocks
            .updateCallStatus
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "returns 400 when CallStatus is missing",
      async () => {
        mockValidatedWebhook({
          CallSid:
            "CA123",
        });

        const response =
          await POST(
            createRequest({
              signature:
                "valid-signature",
            })
          );

        expect(
          response.status
        ).toBe(
          400
        );

        expect(
          mocks
            .updateCallStatus
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Status Update
    //------------------------------------------------

    it(
      "passes callback values to updateCallStatus",
      async () => {
        mockValidatedWebhook({
          CallSid:
            "  CA123  ",

          CallStatus:
            "  completed  ",

          CallDuration:
            "42",
        });

        mocks
          .updateCallStatus
          .mockResolvedValue({
            count:
              1,

            callId:
              "internal-call-1",
          });

        const response =
          await POST(
            createRequest({
              callId:
                "internal-call-1",

              signature:
                "valid-signature",
            })
          );

        const body =
          await response.json();

        expect(
          mocks
            .updateCallStatus
        ).toHaveBeenCalledWith({
          callId:
            "internal-call-1",

          providerCallId:
            "CA123",

          status:
            "completed",

          duration:
            42,
        });

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          body
        ).toEqual({
          success:
            true,

          matched:
            true,

          ignored:
            false,

          duplicate:
            false,

          eventPublished:
            false,
        });
      }
    );

    //------------------------------------------------
    // Duration Parsing
    //------------------------------------------------

    it(
      "floors a decimal duration",
      async () => {
        mockValidatedWebhook({
          CallSid:
            "CA123",

          CallStatus:
            "completed",

          CallDuration:
            "42.9",
        });

        mocks
          .updateCallStatus
          .mockResolvedValue({
            count:
              1,
          });

        await POST(
          createRequest({
            signature:
              "valid-signature",
          })
        );

        expect(
          mocks
            .updateCallStatus
        ).toHaveBeenCalledWith({
          callId:
            undefined,

          providerCallId:
            "CA123",

          status:
            "completed",

          duration:
            42,
        });
      }
    );

    it.each([
      "invalid",
      "NaN",
      "Infinity",
      "-1",
      "",
    ])(
      "ignores invalid duration value %s",
      async durationValue => {
        mockValidatedWebhook({
          CallSid:
            "CA123",

          CallStatus:
            "completed",

          CallDuration:
            durationValue,
        });

        mocks
          .updateCallStatus
          .mockResolvedValue({
            count:
              1,
          });

        await POST(
          createRequest({
            signature:
              "valid-signature",
          })
        );

        expect(
          mocks
            .updateCallStatus
        ).toHaveBeenCalledWith({
          callId:
            undefined,

          providerCallId:
            "CA123",

          status:
            "completed",

          duration:
            undefined,
        });
      }
    );

    it(
      "accepts zero duration",
      async () => {
        mockValidatedWebhook({
          CallSid:
            "CA123",

          CallStatus:
            "completed",

          CallDuration:
            "0",
        });

        mocks
          .updateCallStatus
          .mockResolvedValue({
            count:
              1,
          });

        await POST(
          createRequest({
            signature:
              "valid-signature",
          })
        );

        expect(
          mocks
            .updateCallStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            duration:
              0,
          })
        );
      }
    );

    //------------------------------------------------
    // Unmatched Callback
    //------------------------------------------------

    it(
      "returns 200 for an unmatched callback",
      async () => {
        mockValidatedWebhook({
          CallSid:
            "CA-UNKNOWN",

          CallStatus:
            "failed",
        });

        mocks
          .updateCallStatus
          .mockResolvedValue({
            count:
              0,

            ignored:
              true,
          });

        const response =
          await POST(
            createRequest({
              signature:
                "valid-signature",
            })
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          body
        ).toEqual({
          success:
            true,

          matched:
            false,

          ignored:
            true,

          duplicate:
            false,

          eventPublished:
            false,
        });
      }
    );

    //------------------------------------------------
    // Internal Failure
    //------------------------------------------------

    it(
      "returns 500 when updateCallStatus fails",
      async () => {
        mockValidatedWebhook({
          CallSid:
            "CA123",

          CallStatus:
            "completed",
        });

        mocks
          .updateCallStatus
          .mockRejectedValue(
            new Error(
              "Database unavailable"
            )
          );

        const response =
          await POST(
            createRequest({
              signature:
                "valid-signature",
            })
          );

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          500
        );

        expect(
          body
        ).toEqual({
          success:
            false,

          message:
            "Failed to process status callback",
        });
      }
    );

    //------------------------------------------------
    // Call Ordering
    //------------------------------------------------

    it(
      "validates the webhook before updating the call",
      async () => {
        mockValidatedWebhook({
          CallSid:
            "CA123",

          CallStatus:
            "ringing",
        });

        mocks
          .updateCallStatus
          .mockResolvedValue({
            count:
              1,
          });

        await POST(
          createRequest({
            signature:
              "valid-signature",
          })
        );

        expect(
          mocks
            .validateTwilioWebhook
        ).toHaveBeenCalledOnce();

        expect(
          mocks
            .validateTwilioWebhook
        ).toHaveBeenCalledBefore(
          mocks
            .updateCallStatus
        );
      }
    );
  }
);