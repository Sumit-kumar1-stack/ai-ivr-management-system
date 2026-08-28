import {
  CallAuthenticationLevel,
  CallDirection,
  CallRiskLevel,
} from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AudioSessionService,
} from "@/providers/telephony/audio-session.service";

import type {
  WebSocket as WsWebSocket,
} from "ws";

const mocks =
  vi.hoisted(
    () => ({
      call: {
        findUnique:
          vi.fn(),

        update:
          vi.fn(),
      },

      communicationCampaign: {
        findUnique:
          vi.fn(),
      },

      campaignAction: {
        findMany:
          vi.fn(),
      },
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      call:
        mocks.call,

      communicationCampaign:
        mocks.communicationCampaign,

      campaignAction:
        mocks.campaignAction,
    },
  })
);

import {
  getCallSecuritySession,
  updateCallSecuritySession,
} from "@/services/security/call-security-session.service";

describe(
  "call-security-session service",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      }
    );

    it(
      "rejects untrusted auth upgrades",
      async () => {
        mocks.call.findUnique.mockResolvedValue(
          {
            id: "call-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            direction:
              CallDirection.OUTBOUND,
            authenticationLevel:
              CallAuthenticationLevel.AUTH_LEVEL_0,
            authenticationVerifiedAt:
              null,
            riskLevel:
              CallRiskLevel.LOW,
            securityFlags: null,
            updatedAt:
              new Date(
                "2026-08-20T10:00:00.000Z"
              ),
          }
        );

        const result =
          await updateCallSecuritySession(
            "call-1",
            {
              authenticationLevel:
                CallAuthenticationLevel.AUTH_LEVEL_2,
              trusted: false,
            }
          );

        expect(
          result.success
        ).toBe(false);
        if (
          !result.success
        ) {
          expect(
            result.code
          ).toBe(
            "UNTRUSTED_SECURITY_UPDATE_REJECTED"
          );
        }
        expect(
          mocks.call.update
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "allows trusted backend verification to raise auth level",
      async () => {
        mocks.call.findUnique
          .mockResolvedValueOnce(
            {
              id: "call-1",
              campaignId: "voice-1",
              contactId: "contact-1",
              direction:
                CallDirection.OUTBOUND,
              authenticationLevel:
                CallAuthenticationLevel.AUTH_LEVEL_0,
              authenticationVerifiedAt:
                null,
              riskLevel:
                CallRiskLevel.LOW,
              securityFlags: null,
              updatedAt:
                new Date(
                  "2026-08-20T10:00:00.000Z"
                ),
            }
          )
          .mockResolvedValueOnce(
            {
              id: "call-1",
              campaignId: "voice-1",
              contactId: "contact-1",
              direction:
                CallDirection.OUTBOUND,
              authenticationLevel:
                CallAuthenticationLevel.AUTH_LEVEL_2,
              authenticationVerifiedAt:
                new Date(
                  "2026-08-20T10:05:00.000Z"
                ),
              riskLevel:
                CallRiskLevel.MEDIUM,
              securityFlags: {
                backendVerified: true,
              },
              updatedAt:
                new Date(
                  "2026-08-20T10:05:00.000Z"
                ),
            }
          );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          null
        );

        mocks.campaignAction.findMany.mockResolvedValue(
          []
        );

        mocks.call.update.mockResolvedValue(
          {
            id: "call-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            direction:
              CallDirection.OUTBOUND,
            authenticationLevel:
              CallAuthenticationLevel.AUTH_LEVEL_2,
            authenticationVerifiedAt:
              new Date(
                "2026-08-20T10:05:00.000Z"
              ),
            riskLevel:
              CallRiskLevel.MEDIUM,
            securityFlags: {
              backendVerified: true,
            },
            updatedAt:
              new Date(
                "2026-08-20T10:05:00.000Z"
              ),
          }
        );

        const result =
          await updateCallSecuritySession(
            "call-1",
            {
              authenticationLevel:
                CallAuthenticationLevel.AUTH_LEVEL_2,

              riskLevel:
                CallRiskLevel.MEDIUM,

              securityFlags: {
                backendVerified:
                  true,
              },

              trusted: true,
            }
          );

        expect(
          result.success
        ).toBe(true);

        if (
          result.success
        ) {
          expect(
            result.session.authenticationLevel
          ).toBe(
            CallAuthenticationLevel.AUTH_LEVEL_2
          );
        }
      }
    );

    it(
      "derives allowed actions from the current auth level",
      async () => {
        mocks.call.findUnique.mockResolvedValue(
          {
            id: "call-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            direction:
              CallDirection.OUTBOUND,
            authenticationLevel:
              CallAuthenticationLevel.AUTH_LEVEL_1,
            authenticationVerifiedAt:
              null,
            riskLevel:
              CallRiskLevel.LOW,
            securityFlags: null,
            updatedAt:
              new Date(
                "2026-08-20T10:00:00.000Z"
              ),
          }
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id: "comm-1",
          }
        );

        mocks.campaignAction.findMany.mockResolvedValue(
          [
            {
              actionCode: "SEND_INFO",
              requiredAuthLevel:
                CallAuthenticationLevel.AUTH_LEVEL_0,
            },
            {
              actionCode: "SENSITIVE_ACTION",
              requiredAuthLevel:
                CallAuthenticationLevel.AUTH_LEVEL_2,
            },
          ]
        );

        const session =
          await getCallSecuritySession(
            "call-1"
          );

        expect(
          session?.allowedActions
        ).toEqual([
          "SEND_INFO",
        ]);
      }
    );

    it(
      "preserves auth level across unrelated audio session changes",
      async () => {
        mocks.call.findUnique.mockResolvedValue(
          {
            id: "call-audio-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            direction:
              CallDirection.OUTBOUND,
            authenticationLevel:
              CallAuthenticationLevel.AUTH_LEVEL_2,
            authenticationVerifiedAt:
              new Date(
                "2026-08-20T10:05:00.000Z"
              ),
            riskLevel:
              CallRiskLevel.MEDIUM,
            securityFlags: null,
            updatedAt:
              new Date(
                "2026-08-20T10:05:00.000Z"
              ),
          }
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          null
        );

        mocks.campaignAction.findMany.mockResolvedValue(
          []
        );

        const before =
          await getCallSecuritySession(
            "call-audio-1"
          );

          AudioSessionService.create({
          callId: "call-audio-1",
          twilioCallSid: "CA-audio-1",
          streamSid: "MS-audio-1",
          socket: {
            readyState: 1,
            send:
              vi.fn(),
            close:
              vi.fn(),
          } as unknown as WsWebSocket,
        });

        const after =
          await getCallSecuritySession(
            "call-audio-1"
          );

        expect(
          before?.authenticationLevel
        ).toBe(
          CallAuthenticationLevel.AUTH_LEVEL_2
        );
        expect(
          after?.authenticationLevel
        ).toBe(
          CallAuthenticationLevel.AUTH_LEVEL_2
        );

        AudioSessionService.closeByCallId(
          "call-audio-1"
        );
      }
    );
  }
);
