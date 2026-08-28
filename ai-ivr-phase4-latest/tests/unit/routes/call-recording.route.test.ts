import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  describe,
  expect,
  it,
  beforeEach,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      requireRole:
        vi.fn(),

      isAuthenticationError:
        vi.fn(),

      isAuthorizationError:
        vi.fn(),

      createAuthErrorResponse:
        vi.fn(),

      assertCallOwnership:
        vi.fn(),

      findUnique:
        vi.fn(),

      error:
        vi.fn(),

      warn:
        vi.fn(),

      info:
        vi.fn(),

      fetch:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/auth",
  () => ({
    requireRole:
      mocks.requireRole,

    isAuthenticationError:
      mocks.isAuthenticationError,

    isAuthorizationError:
      mocks.isAuthorizationError,
  })
);

vi.mock(
  "@/lib/auth-response",
  () => ({
    createAuthErrorResponse:
      mocks.createAuthErrorResponse,
  })
);

vi.mock(
  "@/services/security/tenant-access.service",
  () => ({
    assertCallOwnership:
      mocks.assertCallOwnership,
  })
);

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      call: {
        findUnique:
          mocks.findUnique,
      },
    },
  })
);

vi.mock(
  "@/lib/logger",
  () => ({
    createLogger:
      vi.fn(
        () => ({
          error:
            mocks.error,
          warn:
            mocks.warn,
          info:
            mocks.info,
        })
      ),

    createCallLogger:
      vi.fn(
        () => ({
          error:
            mocks.error,
          warn:
            mocks.warn,
          info:
            mocks.info,
        })
      ),

    getDurationMs:
      vi.fn(
        () =>
          1
      ),

    normalizeError:
      vi.fn(
        (error: unknown) => ({
          message:
            error instanceof Error
              ? error.message
              : String(error),
        })
      ),
  })
);

vi.stubGlobal(
  "fetch",
  mocks.fetch
);

import {
  GET as getRecording,
} from "@/app/api/calls/[id]/recording/route";

describe(
  "call recording route adversarial checks",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        process.env.TWILIO_ACCOUNT_SID =
          "AC123456789";

        process.env.TWILIO_AUTH_TOKEN =
          "auth-token";

        mocks.requireRole.mockResolvedValue({
          id: "user-1",
          role: "AGENT",
        });

        mocks.isAuthenticationError.mockReturnValue(
          true
        );

        mocks.isAuthorizationError.mockReturnValue(
          false
        );

        mocks.createAuthErrorResponse.mockReturnValue(
          NextResponse.json(
            {
              success: false,
              message: "Forbidden",
            },
            {
              status: 403,
            }
          )
        );
      }
    );

    it(
      "denies cross-tenant recording access before loading the call",
      async () => {
        mocks.assertCallOwnership.mockRejectedValue(
          new Error(
            "Call not found"
          )
        );

        const response =
          await getRecording(
            new NextRequest(
              "https://example.com/api/calls/call-1/recording",
              {
                method: "GET",
              }
            ),
            {
              params:
                Promise.resolve({
                  id:
                    "call-1",
                }),
            }
          );

        expect(
          response.status
        ).toBe(401);
        expect(
          mocks.findUnique
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects unsafe stored recording URLs before provider fetch",
      async () => {
        mocks.assertCallOwnership.mockResolvedValue(
          undefined
        );

        mocks.findUnique.mockResolvedValue(
          {
            id: "call-1",
            campaignId:
              "campaign-1",
            campaignRunId:
              "run-1",
            contactId:
              "contact-1",
            providerCallId:
              "CA123",
            attemptNumber: 1,
            recordingUrl:
              "http://evil.example.com/recording.mp3",
          }
        );

        const response =
          await getRecording(
            new NextRequest(
              "https://example.com/api/calls/call-1/recording",
              {
                method: "GET",
              }
            ),
            {
              params:
                Promise.resolve({
                  id:
                    "call-1",
                }),
            }
          );

        expect(
          response.status
        ).toBe(502);
        expect(
          mocks.fetch
        ).not.toHaveBeenCalled();
      }
    );
  }
);
