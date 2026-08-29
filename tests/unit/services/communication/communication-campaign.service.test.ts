import {
  UserRole,
} from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

//--------------------------------------------------
// Mocks
//--------------------------------------------------

const mocks =
  vi.hoisted(
    () => ({
      findMany:
        vi.fn(),

      findFirst:
        vi.fn(),

      findUnique:
        vi.fn(),

      findUniqueOrThrow:
        vi.fn(),

      updateMany:
        vi.fn(),

      create:
        vi.fn(),

      transaction:
        vi.fn(),

      billingContext:
        vi.fn(),

      transition:
        vi.fn(),

      materialChange:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      communicationCampaign: {
        findMany:
          mocks.findMany,

        findFirst:
          mocks.findFirst,

        findUnique:
          mocks.findUnique,

        findUniqueOrThrow:
          mocks.findUniqueOrThrow,

        updateMany:
          mocks.updateMany,

        create:
          mocks.create,
      },

      $transaction:
        mocks.transaction,
    },
  })
);

vi.mock(
  "@/services/billing/tenant-subscription.service",
  () => ({
    resolveTenantBillingContextForUser:
      mocks.billingContext,
  })
);

vi.mock(
  "@/services/communication/communication-campaign-material-change.service",
  () => ({
    recordCommunicationCampaignMaterialChange:
      mocks.materialChange,
  })
);

vi.mock(
  "@/services/communication/communication-campaign-transition.service",
  () => ({
    transitionCommunicationCampaign:
      mocks.transition,
  })
);

//--------------------------------------------------
// Subject
//--------------------------------------------------

import {
  assertCommunicationCampaignAccess,
  createCommunicationCampaign,
  getCommunicationCampaigns,
  updateCommunicationCampaignChannels,
  updateCommunicationCampaignSchedule,
} from "@/services/communication/communication-campaign.service";

const adminUser = {
  id:
    "user-1",

  role:
    UserRole.ADMIN,

  campaignCapabilities: [
    "CAMPAIGN_CREATE",
    "CAMPAIGN_EDIT",
    "CAMPAIGN_SUBMIT",
  ],

  tenantId:
    "tenant-1",
} as const;

const agentUser = {
  id:
    "user-3",

  role:
    UserRole.AGENT,

  tenantId:
    "tenant-1",
} as const;

const superAdminUser = {
  id:
    "user-2",

  role:
    UserRole.SUPER_ADMIN,

  campaignCapabilities: [],

  tenantId:
    "tenant-1",
} as const;

//--------------------------------------------------
// Tests
//--------------------------------------------------

  describe(
    "getCommunicationCampaigns",
    () => {
    beforeEach(
      () => {
        mocks.findMany.mockResolvedValue(
          []
        );

        mocks.findFirst.mockResolvedValue(
          null
        );

        mocks.create.mockResolvedValue(
          {
            id:
              "campaign-1",

            name:
              "Spring Outreach",

            audienceSourceId:
              null,

            audienceSourceName:
              "Imported Contacts",

            recipientCount:
              42,

            tier:
              "STANDARD",

            channels: [],

            smartChanneling:
              false,

            fallbackPolicy:
              "NONE",

            status:
              "DRAFT",

            approvalRequired:
              true,

            approvalStatus:
              "DRAFT",

            currentRevision:
              1,

            approvedRevision:
              null,

            attemptedContactCount:
              0,

            submittedByUserId:
              "user-1",

            submittedAt:
              null,

            approvedByUserId:
              null,

            approvedAt:
              null,

            approvalReason:
              null,

            launchImmediately:
              true,

            scheduledAt:
              null,

            archivedAt:
              null,

            archivedByUserId:
              null,

            ownerUserId:
              "user-1",

            voiceCampaignId:
              null,

            ivrCampaignId:
              null,

            ivrFlowId:
              null,

            ivrRuntimeFlowId:
              null,

            createdAt:
              new Date(
                "2026-08-19T09:00:00.000Z"
              ),

            updatedAt:
              new Date(
                "2026-08-19T09:30:00.000Z"
              ),
    }
  );

        mocks.transaction.mockImplementation(
          async callback =>
            callback(
              {
                communicationCampaign: {
                  create:
                    mocks.create,
                },

                auditEvent: {
                  create:
                    vi.fn(),
                },
              } as never
            )
        );

        mocks.billingContext.mockResolvedValue(
          {
            tenantId:
              "tenant-1",

            tenantStatus:
              "ACTIVE",

            subscription: {
              id:
                "subscription-1",
              tenantId:
                "tenant-1",
              provider:
                null,
              providerCustomerId:
                null,
              providerSubscriptionId:
                null,
              providerPriceId:
                null,
              contractReference:
                null,
              planTier:
                "STANDARD",
              status:
                "ACTIVE",
              entitlements: [],
              currentPeriodStart:
                null,
              currentPeriodEnd:
                null,
              trialEndsAt:
                null,
              activatedAt:
                null,
              suspendedAt:
                null,
              cancelledAt:
                null,
              expiredAt:
                null,
              lastProviderEventId:
                null,
              lastProviderEventType:
                null,
            },
            deploymentPlan: {
              tier:
                "STANDARD",
              features: {
                sms: true,
                whatsapp: true,
                aiVoice: true,
                ivr: true,
                smartChanneling: false,
                omnichannelFallback: false,
                advancedAnalytics: false,
                humanTransfer: false,
              },
              limits: {
                campaignConcurrency: 2,
                dailyRecipients: 5_000,
              },
              label: "Standard",
              voice: {
                runtime: "GEMINI_LIVE",
              },
            },
            effectiveCampaignTier:
              "STANDARD",
            tenantEntitlements:
              new Set(),
            premiumVoiceEnabled:
              false,
            launchAllowed:
              true,
          } as never
  );
}

  );

describe(
  "updateCommunicationCampaignSchedule",
  () => {
    beforeEach(
      () => {
        mocks.findFirst.mockResolvedValue(
          {
            id:
              "campaign-1",

            status:
              "READY",

            approvalStatus:
              "APPROVED",

            approvalRequired:
              true,

            description:
              null,

            prompt:
              null,

            knowledgeDocumentIds:
              [],

            launchImmediately:
              true,

            scheduledAt:
              null,

            submittedByUserId:
              "user-1",

            submittedAt:
              new Date(
                "2026-08-19T09:00:00.000Z"
              ),

            approvedByUserId:
              "user-2",

            approvedAt:
              new Date(
                "2026-08-20T09:00:00.000Z"
              ),

            approvalReason:
              null,

            approvedRevision:
              2,

            currentRevision:
              2,

            ownerUser: {
              tenantId:
                "tenant-1",
            },
          }
        );

        mocks.updateMany.mockResolvedValue(
          {
            count: 1,
          }
        );

        mocks.findUniqueOrThrow.mockResolvedValue(
          {
            id:
              "campaign-1",

            name:
              "Spring Outreach",

            description:
              "Updated goal",

            prompt:
              null,

            knowledgeDocumentIds:
              [],

            audienceSourceId:
              null,

            audienceSourceName:
              "Imported Contacts",

            recipientCount:
              42,

            tier:
              "STANDARD",

            channels: [],

            smartChanneling:
              false,

            fallbackPolicy:
              "NONE",

            status:
              "DRAFT",

            approvalRequired:
              true,

            approvalStatus:
              "DRAFT",

            submittedByUserId:
              "user-1",

            submittedAt:
              new Date(
                "2026-08-19T09:00:00.000Z"
              ),

            approvedByUserId:
              null,

            approvedAt:
              null,

            approvalReason:
              null,

            currentRevision:
              3,

            approvedRevision:
              null,

            attemptedContactCount:
              0,

            launchImmediately:
              true,

            scheduledAt:
              null,

            archivedAt:
              null,

            archivedByUserId:
              null,

            voiceCampaignId:
              null,

            ivrCampaignId:
              null,

            ivrFlowId:
              null,

            ivrRuntimeFlowId:
              null,

            createdAt:
              new Date(
                "2026-08-19T08:00:00.000Z"
              ),

            updatedAt:
              new Date(
                "2026-08-20T09:00:00.000Z"
              ),
          }
        );

        mocks.transition.mockResolvedValue(
          undefined
        );

        mocks.materialChange.mockResolvedValue(
          undefined
        );
      }
    );

    it(
      "increments revision and invalidates approval after a material edit",
      async () => {
        await updateCommunicationCampaignSchedule(
          "campaign-1",
          {
            description:
              "Updated goal",
          },
          adminUser
        );

        expect(
          mocks.updateMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              description:
                "Updated goal",
            }),
          })
        );

        expect(
          mocks.materialChange
        ).toHaveBeenCalledWith(
          "campaign-1",
          adminUser
        );

        expect(
          mocks.transition
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "routes governance-only timing changes through the shared material-change helper",
      async () => {
        await updateCommunicationCampaignSchedule(
          "campaign-1",
          {
            launchImmediately:
              false,
            scheduledAt:
              new Date(
                Date.now() +
                60 * 60 * 1000
              ).toISOString(),
          },
          adminUser
        );

        const updateArgs =
          mocks.updateMany.mock.calls[0]?.[0];

        expect(
          updateArgs?.data
        ).toBeDefined();

        expect(
          mocks.materialChange
        ).toHaveBeenCalledWith(
          "campaign-1",
          adminUser
        );

        expect(
          mocks.transition
        ).not.toHaveBeenCalled();
      }
    );
  }
);

describe(
  "updateCommunicationCampaignChannels",
  () => {
    beforeEach(
      () => {
        mocks.findFirst.mockResolvedValue(
          {
            id:
              "campaign-1",

            status:
              "READY",

            approvalStatus:
              "APPROVED",

            tier:
              "STANDARD",

            channels: [
              "SMS",
            ],

            smartChanneling:
              false,

            fallbackPolicy:
              "NONE",

            recipientCount:
              10,

            currentRevision:
              4,

            approvedRevision:
              4,

            ownerUser: {
              tenantId:
                "tenant-1",
            },

            attemptedContactCount:
              0,
          }
        );

        mocks.updateMany.mockResolvedValue(
          {
            count: 1,
          }
        );

        mocks.findUniqueOrThrow.mockResolvedValue(
          {
            id:
              "campaign-1",

            name:
              "Spring Outreach",

            description:
              null,

            prompt:
              null,

            knowledgeDocumentIds:
              [],

            audienceSourceId:
              null,

            audienceSourceName:
              "Imported Contacts",

            recipientCount:
              10,

            tier:
              "PREMIUM",

            channels: [
              "SMS",
              "WHATSAPP",
            ],

            smartChanneling:
              true,

            fallbackPolicy:
              "WHATSAPP_TO_SMS",

            status:
              "DRAFT",

            approvalRequired:
              true,

            approvalStatus:
              "DRAFT",

            submittedByUserId:
              "user-1",

            submittedAt:
              null,

            approvedByUserId:
              null,

            approvedAt:
              null,

            approvalReason:
              null,

            currentRevision:
              5,

            approvedRevision:
              null,

            attemptedContactCount:
              0,

            launchImmediately:
              true,

            scheduledAt:
              null,

            archivedAt:
              null,

            archivedByUserId:
              null,

            voiceCampaignId:
              null,

            ivrCampaignId:
              null,

            ivrFlowId:
              null,

            ivrRuntimeFlowId:
              null,

            createdAt:
              new Date(
                "2026-08-19T08:00:00.000Z"
              ),

            updatedAt:
              new Date(
                "2026-08-20T09:00:00.000Z"
              ),
          }
        );

        mocks.billingContext.mockResolvedValue(
          {
            tenantId:
              "tenant-1",

            tenantStatus:
              "ACTIVE",

            subscription: {
              id:
                "subscription-1",

              tenantId:
                "tenant-1",

              provider:
                "stripe",

              providerCustomerId:
                "cus_1",

              providerSubscriptionId:
                "sub_1",

              providerPriceId:
                "price_1",

              contractReference:
                null,

              planTier:
                "PREMIUM",

              status:
                "ACTIVE",

              entitlements: [
                "SMS",
                "AI_VOICE",
                "PREMIUM_VOICE",
              ],

              currentPeriodStart:
                null,

              currentPeriodEnd:
                null,

              trialEndsAt:
                null,

              activatedAt:
                new Date(),

              suspendedAt:
                null,

              cancelledAt:
                null,

              expiredAt:
                null,

              lastProviderEventId:
                "evt-1",

              lastProviderEventType:
                "invoice.paid",
            },

            deploymentPlan: {
              tier:
                "PREMIUM",

              label:
                "Premium",

              features: {
                sms:
                  true,
                whatsapp:
                  true,
                aiVoice:
                  true,
                ivr:
                  true,
                smartChanneling:
                  true,
                omnichannelFallback:
                  true,
                advancedAnalytics:
                  true,
                humanTransfer:
                  true,
              },

              limits: {
                campaignConcurrency:
                  10,
                dailyRecipients:
                  100_000,
              },

              voice: {
                runtime:
                  "GEMINI_LIVE",
              },
            },

            effectiveCampaignTier:
              "PREMIUM",

            tenantEntitlements:
              new Set([
                "SMS",
                "AI_VOICE",
                "PREMIUM_VOICE",
              ]),

            premiumVoiceEnabled:
              true,

            launchAllowed:
              true,
          } as never
        );
      }
    );

    it(
      "invalidates approval when the deployment snapshot changes even if the selected channels stay the same",
      async () => {
        await updateCommunicationCampaignChannels(
          "campaign-1",
          {
            channels: [
              "SMS",
            ],
          },
          adminUser
        );

        expect(
          mocks.materialChange
        ).toHaveBeenCalledWith(
          "campaign-1",
          adminUser
        );
      }
    );
  }
);

    it(
      "returns communication campaign DTOs ordered by newest first",
      async () => {
        mocks.findMany.mockResolvedValue(
          [
            {
              id:
                "campaign-1",

              name:
                "Spring Outreach",

              audienceSourceId:
                "aud-1",

              audienceSourceName:
                "Imported Contacts",

              recipientCount:
                42,

              tier:
                "PREMIUM",

              channels: [
                "SMS",
                "WHATSAPP",
              ],

              smartChanneling:
                true,

              fallbackPolicy:
                "WHATSAPP_TO_SMS",

              status:
                "READY",

              approvalRequired:
                true,

              approvalStatus:
                "APPROVED",

              submittedByUserId:
                "user-1",

              submittedAt:
                new Date(
                  "2026-08-19T08:50:00.000Z"
                ),

              approvedByUserId:
                "user-2",

              approvedAt:
                new Date(
                  "2026-08-19T09:15:00.000Z"
                ),

              approvalReason:
                null,

              currentRevision:
                2,

              approvedRevision:
                2,

              attemptedContactCount:
                0,

              launchImmediately:
                false,

              scheduledAt:
                new Date(
                  "2026-08-19T10:00:00.000Z"
                ),

              archivedAt:
                null,

              archivedByUserId:
                null,

              voiceCampaignId:
                "voice-1",

              ivrCampaignId:
                "ivr-1",

              ivrFlowId:
                "flow-1",

              ivrRuntimeFlowId:
                "runtime-1",

              createdAt:
                new Date(
                  "2026-08-19T09:00:00.000Z"
                ),

              updatedAt:
                new Date(
                  "2026-08-19T09:30:00.000Z"
                ),

              ownerUser: {
                tenantId:
                  "tenant-1",
              },
            },
          ]
        );

        const campaigns =
          await getCommunicationCampaigns(
            adminUser
          );

        expect(
          mocks.findMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              ownerUser: {
                tenantId:
                  "tenant-1",
              },
            },
          })
        );

        expect(
          campaigns
        ).toEqual([
          {
            id:
              "campaign-1",

            name:
              "Spring Outreach",

            description:
              null,

            prompt:
              null,

            knowledgeDocumentIds:
              [],

            audienceSourceId:
              "aud-1",

            audienceSourceName:
              "Imported Contacts",

            recipientCount:
              42,

            tier:
              "PREMIUM",

            channels: [
              "SMS",
              "WHATSAPP",
            ],

            smartChanneling:
              true,

            fallbackPolicy:
              "WHATSAPP_TO_SMS",

            status:
              "READY",

            approvalRequired:
              true,

            approvalStatus:
              "APPROVED",

            submittedByUserId:
              "user-1",

            submittedAt:
              "2026-08-19T08:50:00.000Z",

            approvedByUserId:
              "user-2",

            approvedAt:
              "2026-08-19T09:15:00.000Z",

            approvalReason:
              null,

            currentRevision:
              2,

            approvedRevision:
              2,

            attemptedContactCount:
              0,

            launchImmediately:
              false,

            scheduledAt:
              "2026-08-19T10:00:00.000Z",

            archivedAt:
              null,

            archivedByUserId:
              null,

            voiceCampaignId:
              "voice-1",

            ivrCampaignId:
              "ivr-1",

            ivrFlowId:
              "flow-1",

            ivrRuntimeFlowId:
              "runtime-1",

            createdAt:
              "2026-08-19T09:00:00.000Z",

            updatedAt:
              "2026-08-19T09:30:00.000Z",

            permissions: {
              canEdit: true,
              canSubmit: true,
              canReview: false,
              canApprove: false,
              canReject: false,
              canRequestChanges: false,
              selfApprovalBlocked: false,
              canLaunch: false,
              canDelete: false,
              canArchive: false,
            },
          },
        ]);
      }
    );

    it(
      "returns an empty array when no campaigns exist",
      async () => {
        mocks.findMany.mockResolvedValue(
          []
        );

        await expect(
          getCommunicationCampaigns(
            adminUser
          )
        ).resolves.toEqual(
          []
        );
      }
    );

    it(
      "does not add an owner filter for admins",
      async () => {
        await getCommunicationCampaigns(
          adminUser
        );

        expect(
          mocks.findMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              ownerUser: {
                tenantId:
                  "tenant-1",
              },
            },
          })
        );
      }
    );

    it(
      "gives super admins platform-wide campaign visibility",
      async () => {
        await getCommunicationCampaigns(
          superAdminUser
        );

        expect(
          mocks.findMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {},
          })
        );
      }
    );

    it(
      "assigns the authenticated user as the campaign owner when creating a draft",
      async () => {
        await createCommunicationCampaign(
          {
            name:
              "Spring Outreach",

            audienceSourceName:
              "Imported Contacts",

            recipientCount:
              42,

            channels: [],
          },
          adminUser
        );

        expect(
          mocks.create
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              ownerUserId:
                "user-1",
            }),
          })
        );
      }
    );

    it(
      "keeps owner-scoped access for agent users",
      async () => {
        await expect(
          assertCommunicationCampaignAccess(
            "campaign-locked",
            agentUser
          )
        ).rejects.toThrow(
          "Communication campaign not found"
        );

        expect(
          mocks.findFirst
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id:
                "campaign-locked",

              ownerUser: {
                tenantId:
                  "tenant-1",
              },
            },
          })
        );
      }
    );
  }
);
