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

      create:
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

        create:
          mocks.create,
      },
    },
  })
);

//--------------------------------------------------
// Subject
//--------------------------------------------------

import {
  assertCommunicationCampaignAccess,
  createCommunicationCampaign,
  getCommunicationCampaigns,
} from "@/services/communication/communication-campaign.service";

const adminUser = {
  id:
    "user-1",

  role:
    UserRole.ADMIN,
} as const;

const superAdminUser = {
  id:
    "user-2",

  role:
    UserRole.SUPER_ADMIN,
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

            launchImmediately:
              true,

            scheduledAt:
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

              launchImmediately:
                false,

              scheduledAt:
                new Date(
                  "2026-08-19T10:00:00.000Z"
                ),

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
            },
          ]
        );

        const campaigns =
          await getCommunicationCampaigns(
            adminUser
          );

        expect(
          mocks.findMany
        ).toHaveBeenCalledWith({
          where: {
            ownerUserId:
              "user-1",
          },

          orderBy: {
            createdAt:
              "desc",
          },

          select: {
            id:
              true,

            name:
              true,

            audienceSourceId:
              true,

            audienceSourceName:
              true,

            recipientCount:
              true,

            tier:
              true,

            channels:
              true,

            smartChanneling:
              true,

            fallbackPolicy:
              true,

            status:
              true,

            launchImmediately:
              true,

            scheduledAt:
              true,

            voiceCampaignId:
              true,

            ivrCampaignId:
              true,

            ivrFlowId:
              true,

            ivrRuntimeFlowId:
              true,

            createdAt:
              true,

            updatedAt:
              true,
          },
        });

        expect(
          campaigns
        ).toEqual([
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

            launchImmediately:
              false,

            scheduledAt:
              "2026-08-19T10:00:00.000Z",

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
      "limits admin campaign reads to their owned records",
      async () => {
        await getCommunicationCampaigns(
          adminUser
        );

        expect(
          mocks.findMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              ownerUserId:
                "user-1",
            },
          })
        );
      }
    );

    it(
      "does not add an owner filter for super admins",
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
      "rejects access to another user's campaign",
      async () => {
        await expect(
          assertCommunicationCampaignAccess(
            "campaign-locked",
            adminUser
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

              ownerUserId:
                "user-1",
            },
          })
        );
      }
    );
  }
);
