import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      requireRole:
        vi.fn(),

      createAuthErrorResponse:
        vi.fn(),

      assertCallOwnership:
        vi.fn(),

      getCallSecuritySession:
        vi.fn(),

      updateCallSecuritySession:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/auth",
  () => ({
    requireRole:
      mocks.requireRole,
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
  "@/services/security/call-security-session.service",
  () => ({
    getCallSecuritySession:
      mocks.getCallSecuritySession,

    updateCallSecuritySession:
      mocks.updateCallSecuritySession,
  })
);

import {
  PATCH,
} from "@/app/api/calls/[id]/security-session/route";

describe(
  "call security session route",
  () => {
    it(
      "rejects untrusted auth upgrades",
      async () => {
        mocks.requireRole.mockResolvedValue(
          {
            id: "user-1",
            role: "ADMIN",
          }
        );

        mocks.getCallSecuritySession.mockResolvedValue(
          {
            callId: "call-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            direction: "OUTBOUND",
            authenticationLevel:
              "AUTH_LEVEL_0",
            riskLevel: "LOW",
            authenticationVerifiedAt:
              null,
            securityFlags: {},
            allowedActions: [],
            updatedAt:
              new Date(
                "2026-08-20T10:00:00.000Z"
              ),
          }
        );

        const request =
          new NextRequest(
            "https://example.com/api/calls/call-1/security-session",
            {
              method: "PATCH",
              body: JSON.stringify({
                authenticationLevel:
                  "AUTH_LEVEL_2",
                trusted: false,
              }),
            }
          );

        const response =
          await PATCH(
            request,
            {
              params:
                Promise.resolve({
                  id: "call-1",
                }),
            }
          );

        expect(
          response.status
        ).toBe(403);
        expect(
          mocks.updateCallSecuritySession
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "allows trusted backend verification to raise auth level",
      async () => {
        mocks.requireRole.mockResolvedValue(
          {
            id: "user-1",
            role: "ADMIN",
          }
        );

        mocks.getCallSecuritySession.mockResolvedValue(
          {
            callId: "call-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            direction: "OUTBOUND",
            authenticationLevel:
              "AUTH_LEVEL_0",
            riskLevel: "LOW",
            authenticationVerifiedAt:
              null,
            securityFlags: {},
            allowedActions: [],
            updatedAt:
              new Date(
                "2026-08-20T10:00:00.000Z"
              ),
          }
        );

        mocks.updateCallSecuritySession.mockResolvedValue(
          {
            success: true,
            session: {
              callId: "call-1",
              campaignId: "voice-1",
              contactId: "contact-1",
              direction: "OUTBOUND",
              authenticationLevel:
                "AUTH_LEVEL_2",
              riskLevel: "MEDIUM",
              authenticationVerifiedAt:
                new Date(
                  "2026-08-20T10:05:00.000Z"
                ),
              securityFlags: {
                backendVerified: true,
              },
              allowedActions: [
                "SEND_INFO",
              ],
              updatedAt:
                new Date(
                  "2026-08-20T10:05:00.000Z"
                ),
            },
          }
        );

        const request =
          new NextRequest(
            "https://example.com/api/calls/call-1/security-session",
            {
              method: "PATCH",
              body: JSON.stringify({
                authenticationLevel:
                  "AUTH_LEVEL_2",
                riskLevel: "MEDIUM",
                trusted: true,
              }),
            }
          );

        const response =
          await PATCH(
            request,
            {
              params:
                Promise.resolve({
                  id: "call-1",
                }),
            }
          );

        expect(
          response.status
        ).toBe(200);
        expect(
          mocks.updateCallSecuritySession
        ).toHaveBeenCalled();
      }
    );
  }
);
