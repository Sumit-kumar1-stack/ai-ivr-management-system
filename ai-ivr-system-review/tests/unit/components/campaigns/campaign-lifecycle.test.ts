import {
  describe,
  expect,
  it,
} from "vitest";

import {
  filterCampaignsByLifecycleTab,
  getCampaignBoardActions,
  getCampaignDraftEditHref,
  getCampaignLifecycleTab,
  getCampaignSummaryHref,
} from "@/components/campaigns/campaign-lifecycle";
import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

describe(
  "campaign lifecycle helpers",
  () => {
    const draftCampaign =
      {
      approvalStatus: "DRAFT",
      status: "DRAFT",
      } satisfies Pick<
        CommunicationCampaignDTO,
        "approvalStatus" | "status"
      >;

    const approvedCampaign =
      {
      approvalStatus: "APPROVED",
      status: "READY",
      } satisfies Pick<
        CommunicationCampaignDTO,
        "approvalStatus" | "status"
      >;

    const runningCampaign =
      {
      approvalStatus: "APPROVED",
      status: "RUNNING",
      } satisfies Pick<
        CommunicationCampaignDTO,
        "approvalStatus" | "status"
      >;

    const completedCampaign =
      {
      approvalStatus: "APPROVED",
      status: "COMPLETED",
      } satisfies Pick<
        CommunicationCampaignDTO,
        "approvalStatus" | "status"
      >;

    const archivedCampaign =
      {
      approvalStatus: "REJECTED",
      status: "CANCELLED",
      } satisfies Pick<
        CommunicationCampaignDTO,
        "approvalStatus" | "status"
      >;

    const pendingCampaign =
      {
      approvalStatus: "SUBMITTED",
      status: "DRAFT",
      } satisfies Pick<
        CommunicationCampaignDTO,
        "approvalStatus" | "status"
      >;

    it(
      "maps supported communication states into the expected lifecycle tabs",
      () => {
        expect(
          getCampaignLifecycleTab(
            draftCampaign as CommunicationCampaignDTO
          )
        ).toBe(
          "DRAFT"
        );

        expect(
          getCampaignLifecycleTab(
            approvedCampaign as CommunicationCampaignDTO
          )
        ).toBe(
          "APPROVED"
        );

        expect(
          getCampaignLifecycleTab(
            runningCampaign as CommunicationCampaignDTO
          )
        ).toBe(
          "RUNNING"
        );

        expect(
          getCampaignLifecycleTab(
            completedCampaign as CommunicationCampaignDTO
          )
        ).toBe(
          "COMPLETED"
        );

        expect(
          getCampaignLifecycleTab(
            archivedCampaign as CommunicationCampaignDTO
          )
        ).toBe(
          "ARCHIVED"
        );

        expect(
          getCampaignLifecycleTab(
            pendingCampaign as CommunicationCampaignDTO
          )
        ).toBe(
          "PENDING_APPROVAL"
        );
      }
    );

    it(
      "filters campaigns by lifecycle tab",
      () => {
        const campaigns = [
          draftCampaign,
          approvedCampaign,
          runningCampaign,
          completedCampaign,
          archivedCampaign,
        ] as CommunicationCampaignDTO[];

        expect(
          filterCampaignsByLifecycleTab(
            campaigns,
            "ALL"
          )
        ).toHaveLength(
          5
        );

        expect(
          filterCampaignsByLifecycleTab(
            campaigns,
            "APPROVED"
          )
        ).toEqual([
          approvedCampaign,
        ]);

        expect(
          filterCampaignsByLifecycleTab(
            campaigns,
            "RUNNING"
          )
        ).toEqual([
          runningCampaign,
        ]);
      }
    );

    it(
      "builds the draft continue-editing route",
      () => {
        expect(
          getCampaignDraftEditHref(
            "campaign-123"
          )
        ).toBe(
          "/communication/campaigns/new/audience?campaign=campaign-123"
        );
      }
    );

    it(
      "maps draft campaigns to edit and submit actions",
      () => {
        const actions =
          getCampaignBoardActions(
            {
              id: "draft-1",
              name: "Draft",
              description: null,
              prompt: null,
              knowledgeDocumentIds: [],
              audienceSourceId: null,
              audienceSourceName: "Audience",
              recipientCount: 10,
              tier: "STANDARD",
              channels: [],
              smartChanneling: false,
              fallbackPolicy: "NONE",
              status: "DRAFT",
              approvalRequired: true,
              approvalStatus: "DRAFT",
              submittedByUserId: null,
              submittedAt: null,
              approvedByUserId: null,
              approvedAt: null,
              approvalReason: null,
              currentRevision: 1,
              approvedRevision: null,
              attemptedContactCount: 0,
              launchImmediately: true,
              scheduledAt: null,
              archivedAt: null,
              archivedByUserId: null,
              voiceCampaignId: null,
              ivrCampaignId: null,
              ivrFlowId: null,
              ivrRuntimeFlowId: null,
              createdAt: "2026-08-22T00:00:00.000Z",
              updatedAt: "2026-08-22T00:00:00.000Z",
            },
            "AGENT"
          );

        expect(
          actions.map(action => action.label)
        ).toEqual([
          "Continue Editing",
          "Submit for Approval",
          "Delete",
        ]);
        expect(
          actions.map(action => action.kind)
        ).toEqual([
          "link",
          "link",
          "delete",
        ]);
        expect(actions[0]?.href).toBe(
          "/communication/campaigns/new/audience?campaign=draft-1"
        );
        expect(actions[1]?.href).toBe(
          getCampaignSummaryHref("draft-1")
        );
      }
    );

    it(
      "maps submitted campaigns to reviewer actions",
      () => {
        const actions =
          getCampaignBoardActions(
            {
              id: "submitted-1",
              name: "Submitted",
              description: null,
              prompt: null,
              knowledgeDocumentIds: [],
              audienceSourceId: null,
              audienceSourceName: "Audience",
              recipientCount: 10,
              tier: "STANDARD",
              channels: [],
              smartChanneling: false,
              fallbackPolicy: "NONE",
              status: "DRAFT",
              approvalRequired: true,
              approvalStatus: "SUBMITTED",
              submittedByUserId: "user-1",
              submittedAt: "2026-08-22T00:00:00.000Z",
              approvedByUserId: null,
              approvedAt: null,
              approvalReason: null,
              currentRevision: 2,
              approvedRevision: 2,
              attemptedContactCount: 0,
              launchImmediately: true,
              scheduledAt: null,
              archivedAt: null,
              archivedByUserId: null,
              voiceCampaignId: null,
              ivrCampaignId: null,
              ivrFlowId: null,
              ivrRuntimeFlowId: null,
              createdAt: "2026-08-22T00:00:00.000Z",
              updatedAt: "2026-08-22T00:00:00.000Z",
            },
            "ADMIN"
          );

        expect(
          actions.map(action => action.label)
        ).toEqual([
          "Review",
          "View",
        ]);
        expect(actions[0]?.kind).toBe(
          "link"
        );
        expect(actions[1]?.kind).toBe(
          "link"
        );
      }
    );

    it(
      "maps approved campaigns to launch actions",
      () => {
        const actions =
          getCampaignBoardActions(
            {
              id: "approved-1",
              name: "Approved",
              description: null,
              prompt: null,
              knowledgeDocumentIds: [],
              audienceSourceId: null,
              audienceSourceName: "Audience",
              recipientCount: 10,
              tier: "STANDARD",
              channels: [],
              smartChanneling: false,
              fallbackPolicy: "NONE",
              status: "READY",
              approvalRequired: true,
              approvalStatus: "APPROVED",
              submittedByUserId: "user-1",
              submittedAt: "2026-08-22T00:00:00.000Z",
              approvedByUserId: "user-2",
              approvedAt: "2026-08-22T00:00:00.000Z",
              approvalReason: null,
              currentRevision: 2,
              approvedRevision: 2,
              attemptedContactCount: 0,
              launchImmediately: true,
              scheduledAt: null,
              archivedAt: null,
              archivedByUserId: null,
              voiceCampaignId: null,
              ivrCampaignId: null,
              ivrFlowId: null,
              ivrRuntimeFlowId: null,
              createdAt: "2026-08-22T00:00:00.000Z",
              updatedAt: "2026-08-22T00:00:00.000Z",
            },
            "ADMIN"
          );

        expect(
          actions.map(action => action.label)
        ).toEqual([
          "Launch",
          "View",
        ]);
        expect(
          actions.map(action => action.kind)
        ).toEqual([
          "link",
          "link",
        ]);
      }
    );
  }
);
