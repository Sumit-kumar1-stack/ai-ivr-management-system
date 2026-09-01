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

import {
  OutboundMessageStatus,
} from "@prisma/client";

const mocks =
  vi.hoisted(
    () => {
      class MockPlivoAuthError
        extends Error {
        constructor() {
          super(
            "Invalid Plivo webhook authentication"
          );

          this.name =
            "PlivoWebhookAuthenticationError";
        }
      }

      return {
        validatePlivoWebhook:
          vi.fn(),

        updateOutboundMessageStatus:
          vi.fn(),

        findUnique:
          vi.fn(),

        updateMany:
          vi.fn(),

        MockPlivoAuthError,
      };
    }
  );

vi.mock(
  "@/lib/plivo-webhook-auth",
  () => ({
    PlivoWebhookAuthenticationError:
      mocks.MockPlivoAuthError,

    validatePlivoWebhook:
      mocks.validatePlivoWebhook,

    createPlivoAuthErrorResponse:
      (
        error: unknown
      ) => {
        if (
          error instanceof
          mocks.MockPlivoAuthError
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
  "@/lib/prisma",
  () => ({
    prisma: {
      outboundMessage: {
        findUnique:
          mocks.findUnique,

        updateMany:
          mocks.updateMany,
      },
    },
  })
);

vi.mock(
  "@/services/messaging/outbound-message-status.service",
  () => ({
    updateOutboundMessageStatus:
      mocks.updateOutboundMessageStatus,
  })
);

import {
  POST,
  normalizePlivoMessageStatus,
} from "@/app/api/plivo/messaging/status/route";

describe(
  "POST /api/plivo/messaging/status",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks.findUnique.mockResolvedValue({
          id:
            "msg-123",

          providerMessageId:
            "plivo-uuid-1",
        });

        mocks.updateOutboundMessageStatus.mockResolvedValue({
          found:
            true,

          updated:
            true,

          outboundMessageId:
            "msg-123",

          currentStatus:
            OutboundMessageStatus.DELIVERED,
        });
      }
    );

    //------------------------------------------------
    // Status Normalization Unit Tests
    //------------------------------------------------

    describe(
      "normalizePlivoMessageStatus",
      () => {
        it(
          "maps all standard Plivo statuses accurately",
          () => {
            expect(
              normalizePlivoMessageStatus(
                "queued"
              )
            ).toBe(
              OutboundMessageStatus.QUEUED
            );

            expect(
              normalizePlivoMessageStatus(
                "sent"
              )
            ).toBe(
              OutboundMessageStatus.SENT
            );

            expect(
              normalizePlivoMessageStatus(
                "delivered"
              )
            ).toBe(
              OutboundMessageStatus.DELIVERED
            );

            expect(
              normalizePlivoMessageStatus(
                "failed"
              )
            ).toBe(
              OutboundMessageStatus.FAILED
            );

            expect(
              normalizePlivoMessageStatus(
                "rejected"
              )
            ).toBe(
              OutboundMessageStatus.FAILED
            );

            expect(
              normalizePlivoMessageStatus(
                "undelivered"
              )
            ).toBe(
              OutboundMessageStatus.UNDELIVERED
            );

            expect(
              normalizePlivoMessageStatus(
                "unknown_status"
              )
            ).toBe(
              OutboundMessageStatus.ACCEPTED
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Webhook Route Tests
    //------------------------------------------------

    it(
      "rejects invalid Plivo webhook signatures with 403",
      async () => {
        mocks.validatePlivoWebhook.mockRejectedValue(
          new mocks.MockPlivoAuthError()
        );

        const request =
          new NextRequest(
            "http://localhost:3000/api/plivo/messaging/status?messageId=msg-123",
            {
              method:
                "POST",
            }
          );

        const response =
          await POST(
            request
          );

        expect(
          response.status
        ).toBe(
          403
        );
      }
    );

    it(
      "returns 400 when both messageId and MessageUUID are missing",
      async () => {
        mocks.validatePlivoWebhook.mockResolvedValue({});

        const request =
          new NextRequest(
            "http://localhost:3000/api/plivo/messaging/status",
            {
              method:
                "POST",
            }
          );

        const response =
          await POST(
            request
          );

        expect(
          response.status
        ).toBe(
          400
        );
      }
    );

    it(
      "returns 404 when outbound message record is not found",
      async () => {
        mocks.validatePlivoWebhook.mockResolvedValue({
          MessageUUID:
            "plivo-uuid-1",

          Status:
            "delivered",
        });

        mocks.findUnique.mockResolvedValue(
          null
        );

        const request =
          new NextRequest(
            "http://localhost:3000/api/plivo/messaging/status?messageId=msg-999",
            {
              method:
                "POST",
            }
          );

        const response =
          await POST(
            request
          );

        expect(
          response.status
        ).toBe(
          404
        );
      }
    );

    it(
      "returns 403 when MessageUUID belongs to another local message record",
      async () => {
        mocks.validatePlivoWebhook.mockResolvedValue({
          MessageUUID:
            "plivo-uuid-claimed",

          Status:
            "delivered",
        });

        mocks.findUnique
          .mockResolvedValueOnce({
            id:
              "msg-123",

            providerMessageId:
              null,
          })
          .mockResolvedValueOnce({
            id:
              "msg-OTHER",
          });

        const request =
          new NextRequest(
            "http://localhost:3000/api/plivo/messaging/status?messageId=msg-123",
            {
              method:
                "POST",
            }
          );

        const response =
          await POST(
            request
          );

        expect(
          response.status
        ).toBe(
          403
        );
      }
    );

    it(
      "successfully processes delivered status callback",
      async () => {
        mocks.validatePlivoWebhook.mockResolvedValue({
          MessageUUID:
            "plivo-uuid-1",

          Status:
            "delivered",
        });

        mocks.findUnique.mockResolvedValue({
          id:
            "msg-123",

          providerMessageId:
            "plivo-uuid-1",
        });

        mocks.updateOutboundMessageStatus.mockResolvedValue({
          found:
            true,

          updated:
            true,

          outboundMessageId:
            "msg-123",

          currentStatus:
            OutboundMessageStatus.DELIVERED,
        });

        const request =
          new NextRequest(
            "http://localhost:3000/api/plivo/messaging/status?messageId=msg-123",
            {
              method:
                "POST",
            }
          );

        const response =
          await POST(
            request
          );

        expect(
          response.status
        ).toBe(
          200
        );

        const data =
          await response.json();

        expect(
          data
        ).toEqual({
          success:
            true,

          matched:
            true,

          updated:
            true,

          status:
            OutboundMessageStatus.DELIVERED,
        });

        expect(
          mocks.updateOutboundMessageStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            providerMessageId:
              "plivo-uuid-1",

            status:
              OutboundMessageStatus.DELIVERED,
          })
        );
      }
    );

    it(
      "successfully processes failed/rejected status callback with error code",
      async () => {
        mocks.validatePlivoWebhook.mockResolvedValue({
          MessageUUID:
            "plivo-uuid-1",

          Status:
            "failed",

          ErrorCode:
            "30008",
        });

        mocks.findUnique.mockResolvedValue({
          id:
            "msg-123",

          providerMessageId:
            "plivo-uuid-1",
        });

        mocks.updateOutboundMessageStatus.mockResolvedValue({
          found:
            true,

          updated:
            true,

          outboundMessageId:
            "msg-123",

          currentStatus:
            OutboundMessageStatus.FAILED,
        });

        const request =
          new NextRequest(
            "http://localhost:3000/api/plivo/messaging/status?messageId=msg-123",
            {
              method:
                "POST",
            }
          );

        const response =
          await POST(
            request
          );

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          mocks.updateOutboundMessageStatus
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            providerMessageId:
              "plivo-uuid-1",

            status:
              OutboundMessageStatus.FAILED,

            errorCode:
              "30008",

            errorMessage:
              "Plivo message status: failed",
          })
        );
      }
    );

    it(
      "handles duplicate/out-of-order callback safely (updated: false)",
      async () => {
        mocks.validatePlivoWebhook.mockResolvedValue({
          MessageUUID:
            "plivo-uuid-1",

          Status:
            "sent",
        });

        mocks.findUnique.mockResolvedValue({
          id:
            "msg-123",

          providerMessageId:
            "plivo-uuid-1",
        });

        mocks.updateOutboundMessageStatus.mockResolvedValue({
          found:
            true,

          updated:
            false,

          outboundMessageId:
            "msg-123",

          previousStatus:
            OutboundMessageStatus.DELIVERED,

          currentStatus:
            OutboundMessageStatus.DELIVERED,
        });

        const request =
          new NextRequest(
            "http://localhost:3000/api/plivo/messaging/status?messageId=msg-123",
            {
              method:
                "POST",
            }
          );

        const response =
          await POST(
            request
          );

        expect(
          response.status
        ).toBe(
          200
        );

        const data =
          await response.json();

        expect(
          data
        ).toEqual({
          success:
            true,

          matched:
            true,

          updated:
            false,

          status:
            OutboundMessageStatus.DELIVERED,
        });
      }
    );
  }
);
