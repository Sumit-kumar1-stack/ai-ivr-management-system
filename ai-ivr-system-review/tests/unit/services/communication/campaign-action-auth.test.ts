import {
  CallAuthenticationLevel,
  ToolExecutionStatus,
} from "@prisma/client";

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
      call: {
        findUnique:
          vi.fn(),
      },

      communicationCampaign: {
        findUnique:
          vi.fn(),
      },

      campaignAction: {
        findFirst:
          vi.fn(),
      },

      toolExecution: {
        findUnique:
          vi.fn(),

        create:
          vi.fn(),

        update:
          vi.fn(),
      },

      enforceRateLimit:
        vi.fn(),

      publish:
        vi.fn(),

      getCall:
        vi.fn(),
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

      toolExecution:
        mocks.toolExecution,
    },
  })
);

vi.mock(
  "@/lib/abuse-control",
  () => ({
    enforceRateLimit:
      mocks.enforceRateLimit,
  })
);

vi.mock(
  "@/core/events",
  () => ({
    AppEvent: {},

    EventPublisher: {
      publish:
        mocks.publish,
    },
  })
);

vi.mock(
  "@/services/calls/call.service",
  () => ({
    getCall:
      mocks.getCall,
  })
);

import {
  triggerCampaignActionForVoiceOutcome,
} from "@/services/communication/campaign-action-resolver.service";

describe(
  "campaign action auth gating",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks.enforceRateLimit.mockResolvedValue({
          allowed: true,
          current: 0,
          limit: 10,
          windowMs: 60_000,
          retryAfterMs: null,
          key: "ok",
        });

        mocks.publish.mockResolvedValue(true);
      }
    );

    it(
      "blocks action execution when auth level is insufficient",
      async () => {
        mocks.getCall.mockResolvedValue(
          {
            id: "call-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            authenticationLevel:
              CallAuthenticationLevel.AUTH_LEVEL_0,
            campaign: {
              ownerUserId:
                "tenant-1",
            },
            contact: {
              ownerUserId:
                "tenant-1",
            },
          }
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id: "communication-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          {
            id: "action-1",
            communicationCampaignId:
              "communication-1",
            actionCode: "SEND_INFO",
            type: "MOCK",
            endpoint: null,
            integrationRef: null,
            requiredAuthLevel:
              CallAuthenticationLevel.AUTH_LEVEL_2,
            requiresConfirmation: false,
            timeoutMs: 10_000,
            enabled: true,
          }
        );

        const result =
          await triggerCampaignActionForVoiceOutcome(
            "call-1",
            {
              intent:
                "SEND_INFORMATION",
              confidence: 0.9,
              entities: {
                name: null,
                phone: null,
                email: null,
                interest: null,
                callbackTime: null,
                timezone: null,
              },
              requestedAction:
                "SEND_INFORMATION",
              requiresConfirmation:
                false,
              handled: true,
              response: null,
            }
          );

        expect(
          result.matched
        ).toBe(true);
        expect(
          result.executed
        ).toBe(false);
        expect(
          result.reason
        ).toBe(
          "REQUIRE_AUTH"
        );
        expect(
          mocks.toolExecution.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "allows execution after trusted auth level is present",
      async () => {
        mocks.getCall.mockResolvedValue(
          {
            id: "call-1",
            campaignId: "voice-1",
            contactId: "contact-1",
            authenticationLevel:
              CallAuthenticationLevel.AUTH_LEVEL_2,
            campaign: {
              ownerUserId:
                "tenant-1",
            },
            contact: {
              ownerUserId:
                "tenant-1",
            },
          }
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id: "communication-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          {
            id: "action-1",
            communicationCampaignId:
              "communication-1",
            actionCode: "SEND_INFO",
            type: "MOCK",
            endpoint: null,
            integrationRef: null,
            requiredAuthLevel:
              CallAuthenticationLevel.AUTH_LEVEL_2,
            requiresConfirmation: false,
            timeoutMs: 10_000,
            enabled: true,
          }
        );

        mocks.toolExecution.findUnique.mockResolvedValue(
          null
        );

        mocks.toolExecution.create.mockResolvedValue(
          {
            id: "tool-1",
          }
        );

        mocks.toolExecution.update.mockResolvedValue(
          {
            status: ToolExecutionStatus.SUCCEEDED,
          }
        );

        const result =
          await triggerCampaignActionForVoiceOutcome(
            "call-1",
            {
              intent:
                "SEND_INFORMATION",
              confidence: 0.9,
              entities: {
                name: null,
                phone: null,
                email: null,
                interest: null,
                callbackTime: null,
                timezone: null,
              },
              requestedAction:
                "SEND_INFORMATION",
              requiresConfirmation:
                false,
              handled: true,
              response: null,
            }
          );

        expect(
          result.executed
        ).toBe(true);
      }
    );
  }
);
