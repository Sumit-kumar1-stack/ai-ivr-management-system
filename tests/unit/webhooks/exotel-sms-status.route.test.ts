import {
  NextRequest,
} from "next/server";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  OutboundMessageStatus,
} from "@prisma/client";

import {
  GET,
  POST,
  normalizeExotelMessageStatus,
} from "@/app/api/exotel/messaging/status/route";

import {
  generateExotelMessageStatusToken,
  validateExotelMessageStatusToken,
} from "@/lib/exotel-webhook-auth";

const mocks =
  vi.hoisted(
    () => ({
      findUnique:
        vi.fn(),

      updateMany:
        vi.fn(),

      updateOutboundMessageStatus:
        vi.fn(),
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

describe(
  "Exotel SMS Status Callback Webhook Route Security & Lifecycle",
  () => {
    const originalEnv =
      process.env;

    const testWebhookSecret =
      "super_secret_webhook_token_123";

    beforeEach(
      () => {
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
          "api.in.exotel.com";

        process.env.EXOTEL_CALLER_ID =
          "+919876543210";

        process.env.EXOTEL_PUBLIC_BASE_URL =
          "https://ivr.example.com";

        process.env.EXOTEL_WEBHOOK_SECRET =
          testWebhookSecret;

        mocks.findUnique.mockReset();
        mocks.updateMany.mockReset();
        mocks.updateOutboundMessageStatus.mockReset();
      }
    );

    afterEach(
      () => {
        process.env =
          originalEnv;
      }
    );

    //------------------------------------------------
    // Status Normalization Unit Tests
    //------------------------------------------------

    describe(
      "normalizeExotelMessageStatus",
      () => {
        it(
          "normalizes Exotel status values accurately",
          () => {
            expect(
              normalizeExotelMessageStatus(
                "queued"
              )
            ).toBe(
              OutboundMessageStatus.QUEUED
            );

            expect(
              normalizeExotelMessageStatus(
                "sending"
              )
            ).toBe(
              OutboundMessageStatus.QUEUED
            );

            expect(
              normalizeExotelMessageStatus(
                "submitted"
              )
            ).toBe(
              OutboundMessageStatus.QUEUED
            );

            expect(
              normalizeExotelMessageStatus(
                "sent"
              )
            ).toBe(
              OutboundMessageStatus.SENT
            );

            expect(
              normalizeExotelMessageStatus(
                "delivered"
              )
            ).toBe(
              OutboundMessageStatus.DELIVERED
            );

            expect(
              normalizeExotelMessageStatus(
                "failed"
              )
            ).toBe(
              OutboundMessageStatus.FAILED
            );

            expect(
              normalizeExotelMessageStatus(
                "failed-dnd"
              )
            ).toBe(
              OutboundMessageStatus.FAILED
            );

            expect(
              normalizeExotelMessageStatus(
                "undelivered"
              )
            ).toBe(
              OutboundMessageStatus.UNDELIVERED
            );

            expect(
              normalizeExotelMessageStatus(
                "unknown_state"
              )
            ).toBe(
              OutboundMessageStatus.ACCEPTED
            );
          }
        );
      }
    );

    //------------------------------------------------
    // HMAC Token & Authentication Tests
    //------------------------------------------------

    describe(
      "Authentication & HMAC Security",
      () => {
        it(
          "generates message-bound HMAC-SHA256 tokens that validate correctly",
          () => {
            const messageId =
              "msg-unique-123";

            const token =
              generateExotelMessageStatusToken(
                messageId,
                testWebhookSecret
              );

            expect(
              token
            ).toHaveLength(
              64
            );

            expect(
              token
            ).not.toBe(
              testWebhookSecret
            );

            expect(
              validateExotelMessageStatusToken(
                messageId,
                token,
                testWebhookSecret
              )
            ).toBe(
              true
            );

            // Invalid with different message ID
            expect(
              validateExotelMessageStatusToken(
                "msg-other-456",
                token,
                testWebhookSecret
              )
            ).toBe(
              false
            );

            // Invalid with wrong secret
            expect(
              validateExotelMessageStatusToken(
                messageId,
                token,
                "wrong_secret"
              )
            ).toBe(
              false
            );
          }
        );

        it(
          "rejects unauthenticated request with 403 Forbidden when secret/token is missing",
          async () => {
            const req =
              new NextRequest(
                "https://example.com/api/exotel/messaging/status?messageId=msg-123",
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "delivered",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );
          }
        );

        it(
          "rejects request with 403 Forbidden when messageId is tampered",
          async () => {
            const validTokenForMsg123 =
              generateExotelMessageStatusToken(
                "msg-123",
                testWebhookSecret
              );

            // Attacker presents valid token for msg-123 but passes messageId=msg-tampered
            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-tampered&token=${validTokenForMsg123}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "delivered",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );
          }
        );

        it(
          "rejects raw secret in token query parameter if not valid HMAC (prevents credential leaks)",
          async () => {
            // Raw secret is not a message-bound HMAC
            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-123&token=${testWebhookSecret}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "delivered",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );
          }
        );

        it(
          "accepts authenticated request via message-bound HMAC token in query parameter",
          async () => {
            const validToken =
              generateExotelMessageStatusToken(
                "msg-123",
                testWebhookSecret
              );

            mocks.findUnique.mockResolvedValueOnce({
              id:
                "msg-123",

              provider:
                "EXOTEL",

              providerMessageId:
                "sid-123",
            });

            mocks.updateOutboundMessageStatus.mockResolvedValueOnce({
              found:
                true,

              updated:
                true,

              outboundMessageId:
                "msg-123",

              currentStatus:
                OutboundMessageStatus.DELIVERED,
            });

            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-123&token=${validToken}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "delivered",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              200
            );

            const data =
              await res.json();

            expect(
              data.success
            ).toBe(
              true
            );

            expect(
              data.matched
            ).toBe(
              true
            );
          }
        );

        it(
          "accepts authenticated request via x-exotel-webhook-secret header",
          async () => {
            mocks.findUnique.mockResolvedValueOnce({
              id:
                "msg-123",

              provider:
                "EXOTEL",

              providerMessageId:
                "sid-123",
            });

            mocks.updateOutboundMessageStatus.mockResolvedValueOnce({
              found:
                true,

              updated:
                true,

              outboundMessageId:
                "msg-123",

              currentStatus:
                OutboundMessageStatus.DELIVERED,
            });

            const req =
              new NextRequest(
                "https://example.com/api/exotel/messaging/status?messageId=msg-123",
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "delivered",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",

                    "x-exotel-webhook-secret":
                      testWebhookSecret,
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              200
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Provider Isolation & Message Binding Tests
    //------------------------------------------------

    describe(
      "Provider Isolation & Message Binding",
      () => {
        it(
          "rejects callback with 403 Forbidden if OutboundMessage provider is not EXOTEL (e.g. TWILIO)",
          async () => {
            const validToken =
              generateExotelMessageStatusToken(
                "msg-twilio-record",
                testWebhookSecret
              );

            mocks.findUnique.mockResolvedValueOnce({
              id:
                "msg-twilio-record",

              provider:
                "TWILIO", // Non-Exotel provider

              providerMessageId:
                "sid-123",
            });

            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-twilio-record&token=${validToken}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "delivered",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );

            expect(
              mocks.updateOutboundMessageStatus
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "rejects callback with 403 Forbidden if OutboundMessage provider is not EXOTEL (e.g. PLIVO)",
          async () => {
            const validToken =
              generateExotelMessageStatusToken(
                "msg-plivo-record",
                testWebhookSecret
              );

            mocks.findUnique.mockResolvedValueOnce({
              id:
                "msg-plivo-record",

              provider:
                "PLIVO", // Non-Exotel provider

              providerMessageId:
                "sid-123",
            });

            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-plivo-record&token=${validToken}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "delivered",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );

            expect(
              mocks.updateOutboundMessageStatus
            ).not.toHaveBeenCalled();
          }
        );

        it(
          "rejects callback with 403 when provider SID is owned by another message",
          async () => {
            const validToken =
              generateExotelMessageStatusToken(
                "msg-123",
                testWebhookSecret
              );

            mocks.findUnique
              .mockResolvedValueOnce({
                id:
                  "msg-123",

                provider:
                  "EXOTEL",

                providerMessageId:
                  null,
              })
              .mockResolvedValueOnce({
                id:
                  "msg-different-owner",

                provider:
                  "EXOTEL",

                providerMessageId:
                  "sid-already-taken",
              });

            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-123&token=${validToken}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-already-taken",

                      Status:
                        "sent",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );
          }
        );

        it(
          "rejects callback with 403 when existing provider SID does not match incoming SID",
          async () => {
            const validToken =
              generateExotelMessageStatusToken(
                "msg-123",
                testWebhookSecret
              );

            mocks.findUnique.mockResolvedValueOnce({
              id:
                "msg-123",

              provider:
                "EXOTEL",

              providerMessageId:
                "sid-original",
            });

            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-123&token=${validToken}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-different",

                      Status:
                        "sent",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );
          }
        );

        it(
          "returns 404 when messageId is not found",
          async () => {
            const validToken =
              generateExotelMessageStatusToken(
                "msg-nonexistent",
                testWebhookSecret
              );

            mocks.findUnique.mockResolvedValueOnce(
              null
            );

            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-nonexistent&token=${validToken}`,
                {
                  method:
                    "POST",

                  body:
                    JSON.stringify({
                      SmsSid:
                        "sid-123",

                      Status:
                        "sent",
                    }),

                  headers: {
                    "Content-Type":
                      "application/json",
                  },
                }
              );

            const res =
              await POST(
                req
              );

            expect(
              res.status
            ).toBe(
              404
            );
          }
        );
      }
    );

    //------------------------------------------------
    // GET vs POST Security Parity
    //------------------------------------------------

    describe(
      "GET vs POST Security Parity",
      () => {
        it(
          "GET rejects unauthenticated requests with 403 Forbidden exactly like POST",
          async () => {
            const req =
              new NextRequest(
                "https://example.com/api/exotel/messaging/status?messageId=msg-123&SmsSid=sid-123&Status=failed",
                {
                  method:
                    "GET",
                }
              );

            const res =
              await GET(
                req
              );

            expect(
              res.status
            ).toBe(
              403
            );
          }
        );

        it(
          "GET successfully processes authenticated callback and updates status monotonically",
          async () => {
            const validToken =
              generateExotelMessageStatusToken(
                "msg-123",
                testWebhookSecret
              );

            mocks.findUnique.mockResolvedValueOnce({
              id:
                "msg-123",

              provider:
                "EXOTEL",

              providerMessageId:
                "sid-123",
            });

            mocks.updateOutboundMessageStatus.mockResolvedValueOnce({
              found:
                true,

              updated:
                true,

              outboundMessageId:
                "msg-123",

              currentStatus:
                OutboundMessageStatus.FAILED,
            });

            const req =
              new NextRequest(
                `https://example.com/api/exotel/messaging/status?messageId=msg-123&token=${validToken}&SmsSid=sid-123&Status=failed&ErrorCode=30008`,
                {
                  method:
                    "GET",
                }
              );

            const res =
              await GET(
                req
              );

            expect(
              res.status
            ).toBe(
              200
            );

            expect(
              mocks.updateOutboundMessageStatus
            ).toHaveBeenCalledWith(
              expect.objectContaining({
                providerMessageId:
                  "sid-123",

                status:
                  OutboundMessageStatus.FAILED,

                errorCode:
                  "30008",
              })
            );
          }
        );
      }
    );
  }
);
