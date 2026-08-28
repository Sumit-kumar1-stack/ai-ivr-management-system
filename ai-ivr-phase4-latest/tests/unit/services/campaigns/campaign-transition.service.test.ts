import {
  CampaignStatus,
  UserRole,
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
      findUnique:
        vi.fn(),

      updateMany:
        vi.fn(),

      auditCreate:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      campaign: {
        findUnique:
          mocks.findUnique,

        updateMany:
          mocks.updateMany,
      },

      auditEvent: {
        create:
          mocks.auditCreate,
      },
    },
  })
);

vi.mock(
  "@/services/audit/audit-event.service",
  () => ({
    recordAuditEvent:
      vi.fn(),
  })
);

import {
  transitionCampaign,
} from "@/services/campaigns/campaign-transition.service";

describe(
  "campaign transition service",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("launches a draft campaign to queued and records audit", async () => {
      mocks.findUnique.mockResolvedValue({
        id: "campaign-1",
        status:
          CampaignStatus.DRAFT,
        ownerUserId:
          "owner-1",
        ownerUser: {
          tenantId:
            "tenant-1",
        },
        startedAt:
          null,
        completedAt:
          null,
      });

      mocks.updateMany.mockResolvedValue({
        count:
          1,
      });

      mocks.auditCreate.mockResolvedValue({
        id: "audit-1",
      });

      const result =
        await transitionCampaign({
          campaignId:
            "campaign-1",

          actor:
            null,

          requestedTransition:
            "LAUNCH",

          targetStatus:
            CampaignStatus.QUEUED,
        });

      expect(
        mocks.findUnique
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id:
              "campaign-1",
          },
        })
      );

      expect(
        mocks.updateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id:
              "campaign-1",

            status:
              CampaignStatus.DRAFT,
          },

          data: {
            status:
              CampaignStatus.QUEUED,

            startedAt:
              null,

            completedAt:
              null,
          },
        })
      );

      expect(
        mocks.auditCreate
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId:
              "tenant-1",

            actorUserId:
              null,

            actorRole:
              null,

            entityType:
              "Campaign",

            entityId:
              "campaign-1",

            action:
              "LAUNCH",

            outcome:
              "SUCCEEDED",
          }),
        })
      );

      expect(
        result.status
      ).toBe(
        CampaignStatus.QUEUED
      );
    });

    it("rejects invalid launch targets", async () => {
      mocks.findUnique.mockResolvedValue({
        id: "campaign-1",
        status:
          CampaignStatus.DRAFT,
        ownerUserId:
          "owner-1",
        ownerUser: {
          tenantId:
            "tenant-1",
        },
        startedAt:
          null,
        completedAt:
          null,
      });

      await expect(
        transitionCampaign({
          campaignId:
            "campaign-1",

          actor:
            {
              id:
                "user-1",
              role:
                UserRole.ADMIN,
              tenantId:
                "tenant-1",
            },

          requestedTransition:
            "LAUNCH",

          targetStatus:
            CampaignStatus.RUNNING,
        })
      ).rejects.toThrow(
        "Launch transitions must target QUEUED or SCHEDULED"
      );
    });
  }
);
