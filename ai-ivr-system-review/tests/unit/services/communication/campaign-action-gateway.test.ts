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

      getCall:
        vi.fn(),

      eventPublisher: {
        publish:
          vi.fn(),
      },
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
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
  "@/services/calls/call.service",
  () => ({
    getCall:
      mocks.getCall,
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
    AppEvent: {
      ACTION_REQUESTED:
        "audit.action_requested",

      POLICY_ALLOWED:
        "audit.policy_allowed",

      POLICY_DENIED:
        "audit.policy_denied",

      ACTION_EXECUTED:
        "audit.action_executed",

      ACTION_FAILED:
        "audit.action_failed",
    },

    EventPublisher:
      mocks.eventPublisher,
  })
);

import {
  executeCampaignActionGateway,
} from "@/services/communication/campaign-action-resolver.service";
import type {
  CampaignActionGatewayRequest,
} from "@/services/communication/campaign-action-resolver.service";

function buildCall(
  overrides:
    Partial<{
      id: string;
      campaignId: string;
      contactId: string;
      campaignOwnerUserId: string | null;
      contactOwnerUserId: string | null;
      authLevel: CallAuthenticationLevel;
    }> = {}
) {
  return {
    id:
      overrides.id ??
      "call-1",

    campaignId:
      overrides.campaignId ??
      "voice-campaign-1",

    contactId:
      overrides.contactId ??
      "contact-1",

    authenticationLevel:
      overrides.authLevel ??
      CallAuthenticationLevel.AUTH_LEVEL_2,

    campaign: {
      ownerUserId:
        overrides.campaignOwnerUserId ??
        "tenant-1",
    },

    contact: {
      ownerUserId:
        overrides.contactOwnerUserId ??
        "tenant-1",
    },
  };
}

function buildAction(
  overrides:
    Partial<{
      id: string;
      actionCode: string;
      type: "MOCK" | "WEBHOOK";
      enabled: boolean;
      requiresConfirmation: boolean;
      requiredAuthLevel: CallAuthenticationLevel;
      endpoint: string | null;
      integrationRef: string | null;
      timeoutMs: number;
    }> = {}
) {
  return {
    id:
      overrides.id ??
      "action-1",

    communicationCampaignId:
      "communication-campaign-1",

    name:
      "Action",

    actionCode:
      overrides.actionCode ??
      "SEND_INFORMATION",

    type:
      overrides.type ??
      "MOCK",

    endpoint:
      overrides.endpoint ??
      null,

    integrationRef:
      overrides.integrationRef ??
      null,

    requiredAuthLevel:
      overrides.requiredAuthLevel ??
      CallAuthenticationLevel.AUTH_LEVEL_0,

    requiresConfirmation:
      overrides.requiresConfirmation ??
      false,

    timeoutMs:
      overrides.timeoutMs ??
      10_000,

    enabled:
      overrides.enabled ??
      true,
  };
}

describe(
  "campaign action gateway",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks.eventPublisher.publish.mockResolvedValue(
          true
        );

        mocks.enforceRateLimit.mockResolvedValue(
          {
            allowed:
              true,

            current:
              1,

            limit:
              10,

            windowMs:
              60_000,

            retryAfterMs:
              60_000,

            key:
              "abuse:campaign-action:1",
          }
        );
      }
    );

    it(
      "emits an audit trail for an allowed action",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall()
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction()
        );

        mocks.toolExecution.findUnique.mockResolvedValue(
          null
        );

        mocks.toolExecution.create.mockResolvedValue(
          {
            id:
              "execution-1",
          }
        );

        mocks.toolExecution.update.mockResolvedValue(
          {
            id:
              "execution-1",

            status:
              ToolExecutionStatus.SUCCEEDED,
          }
        );

        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "ALLOW"
        );

        expect(
          mocks.eventPublisher.publish
        ).toHaveBeenCalledWith(
          "audit.action_requested",
          expect.objectContaining({
            callId:
              "call-1",

            campaignId:
              "communication-campaign-1",

            actionCode:
              "SEND_INFORMATION",
          })
        );

        expect(
          mocks.eventPublisher.publish
        ).toHaveBeenCalledWith(
          "audit.policy_allowed",
          expect.objectContaining({
            callId:
              "call-1",

            campaignId:
              "communication-campaign-1",
          })
        );

        expect(
          mocks.eventPublisher.publish
        ).toHaveBeenCalledWith(
          "audit.action_executed",
          expect.objectContaining({
            callId:
              "call-1",

            campaignId:
              "communication-campaign-1",
          })
        );
      }
    );

    it(
      "emits a denial audit trail when auth is insufficient",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall({
            authLevel:
              CallAuthenticationLevel.AUTH_LEVEL_0,
          })
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction({
            requiredAuthLevel:
              CallAuthenticationLevel.AUTH_LEVEL_2,
          })
        );

        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "REQUIRE_AUTH"
        );

        expect(
          mocks.eventPublisher.publish
        ).toHaveBeenCalledWith(
          "audit.policy_denied",
          expect.objectContaining({
            callId:
              "call-1",

            campaignId:
              "communication-campaign-1",

            actionCode:
              "SEND_INFORMATION",
          })
        );
      }
    );

    it(
      "rejects raw bypass payloads with an invalid requestedBy value",
      async () => {
        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              interest:
                "yes",
            },
            requestedBy:
              "HACKER" as unknown as CampaignActionGatewayRequest["requestedBy"],
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "DENY"
        );
        expect(
          result.reason
        ).toBe(
          "malformed_payload"
        );
        expect(
          mocks.getCall
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "blocks a restricted money movement action and hands off",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall()
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction({
            actionCode:
              "TRANSFER_FUNDS",
            type:
              "MOCK",
          })
        );

        const result =
          await executeCampaignActionGateway({
            actionCode:
              "TRANSFER_FUNDS",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              amount:
                100,
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "HUMAN_HANDOFF"
        );
        expect(
          result.reason
        ).toBe(
          "restricted_operation"
        );
        expect(
          mocks.toolExecution.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "requires a higher authentication level before execution",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall({
            authLevel:
              CallAuthenticationLevel.AUTH_LEVEL_0,
          })
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction({
            requiredAuthLevel:
              CallAuthenticationLevel.AUTH_LEVEL_2,
          })
        );

        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "REQUIRE_AUTH"
        );
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
      "denies a disabled integration",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall()
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction({
            enabled:
              false,
          })
        );

        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "DENY"
        );
        expect(
          result.reason
        ).toBe(
          "disabled_integration"
        );
        expect(
          mocks.toolExecution.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "denies cross-tenant action execution",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall({
            campaignOwnerUserId:
              "tenant-1",
            contactOwnerUserId:
              "tenant-1",
          })
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction()
        );

        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-2",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "DENY"
        );
        expect(
          result.reason
        ).toBe(
          "tenant_unavailable_or_mismatch"
        );
        expect(
          mocks.toolExecution.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "requires confirmation before executing a guarded action",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall()
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction({
            requiresConfirmation:
              true,
          })
        );

        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              false,
          });

        expect(
          result.decision
        ).toBe(
          "REQUIRE_CONFIRMATION"
        );
        expect(
          result.reason
        ).toBe(
          "confirmation_required"
        );
        expect(
          mocks.toolExecution.create
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "rejects malformed structured parameters",
      async () => {
        const result =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters:
              [] as unknown as CampaignActionGatewayRequest["parameters"],
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
          });

        expect(
          result.decision
        ).toBe(
          "DENY"
        );
        expect(
          result.reason
        ).toBe(
          "malformed_payload"
        );
        expect(
          mocks.getCall
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "executes once and returns RETRY_SAFE on duplicate retry",
      async () => {
        mocks.getCall.mockResolvedValue(
          buildCall()
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction()
        );

        mocks.toolExecution.findUnique
          .mockResolvedValueOnce(
            null
          )
          .mockResolvedValueOnce(
            {
              id:
                "tool-1",
              callId:
                "call-1",
              status:
                ToolExecutionStatus.SUCCEEDED,
            }
          );

        mocks.toolExecution.create.mockResolvedValue(
          {
            id:
              "tool-1",
          }
        );

        mocks.toolExecution.update.mockResolvedValue(
          {
            status:
              ToolExecutionStatus.SUCCEEDED,
          }
        );

        const first =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
            turnId:
              12,
          });

        const second =
          await executeCampaignActionGateway({
            actionCode:
              "SEND_INFORMATION",
            tenantId:
              "tenant-1",
            campaignId:
              "communication-campaign-1",
            callId:
              "call-1",
            customerRef:
              "contact-1",
            parameters: {
              topic:
                "rates",
            },
            requestedBy:
              "SYSTEM",
            securitySessionId:
              "call-1",
            confirmed:
              true,
            turnId:
              12,
          });

        expect(
          first.decision
        ).toBe(
          "ALLOW"
        );
        expect(
          first.executed
        ).toBe(true);
        expect(
          second.decision
        ).toBe(
          "RETRY_SAFE"
        );
        expect(
          second.duplicate
        ).toBe(true);
        expect(
          second.status
        ).toBe(
          ToolExecutionStatus.SUCCEEDED
        );
      }
    );

    it(
      "denies a new action execution when rate limited",
      async () => {
        mocks.enforceRateLimit.mockResolvedValueOnce(
          {
            allowed:
              false,

            current:
              11,

            limit:
              10,

            windowMs:
              60_000,

            retryAfterMs:
              5_000,

            key:
              "abuse:campaign-action:over",
          }
        );

        mocks.getCall.mockResolvedValue(
          buildCall()
        );

        mocks.communicationCampaign.findUnique.mockResolvedValue(
          {
            id:
              "communication-campaign-1",
            ownerUserId:
              "tenant-1",
            voiceCampaignId:
              "voice-campaign-1",
          }
        );

        mocks.campaignAction.findFirst.mockResolvedValue(
          buildAction()
        );

        const result =
          await executeCampaignActionGateway(
            {
              actionCode:
                "SEND_INFORMATION",
              tenantId:
                "tenant-1",
              campaignId:
                "communication-campaign-1",
              callId:
                "call-1",
              customerRef:
                "contact-1",
              parameters: {
                topic:
                  "rates",
              },
              requestedBy:
                "SYSTEM",
              securitySessionId:
                "call-1",
              confirmed:
                true,
              turnId:
                12,
            }
          );

        expect(
          result.decision
        ).toBe(
          "DENY"
        );
        expect(
          result.reason
        ).toBe(
          "rate_limited"
        );
        expect(
          result.executed
        ).toBe(false);
        expect(
          mocks.toolExecution.create
        ).not.toHaveBeenCalled();
      }
    );
  }
);
