import type {
  CommunicationCampaignDTO,
} from "@/types/communication-campaign";

export type CampaignLifecycleTab =
  | "ALL"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "RUNNING"
  | "COMPLETED"
  | "REJECTED"
  | "ARCHIVED";

export type CampaignBoardActionTone =
  | "primary"
  | "secondary"
  | "tertiary";

export interface CampaignBoardAction {
  label: string;
  href?: string;
  apiPath?: string;
  tone: CampaignBoardActionTone;
  kind: "link" | "delete" | "archive";
}

export interface CampaignLifecycleTabOption {
  value: CampaignLifecycleTab;
  label: string;
}

export const CAMPAIGN_LIFECYCLE_TABS:
  CampaignLifecycleTabOption[] = [
    {
      value: "ALL",
      label: "All",
    },
    {
      value: "DRAFT",
      label: "Draft",
    },
    {
      value: "PENDING_APPROVAL",
      label: "Pending Approval",
    },
    {
      value: "APPROVED",
      label: "Approved",
    },
    {
      value: "RUNNING",
      label: "Running",
    },
    {
      value: "COMPLETED",
      label: "Completed",
    },
    {
      value: "REJECTED",
      label: "Rejected",
    },
    {
      value: "ARCHIVED",
      label: "Archived",
    },
  ];

export function getCampaignLifecycleTab(
  campaign: CommunicationCampaignDTO
): Exclude<CampaignLifecycleTab, "ALL"> {
  if (
    campaign.status === "ARCHIVED"
  ) {
    return "ARCHIVED";
  }

  if (
    campaign.status === "COMPLETED"
  ) {
    return "COMPLETED";
  }

  if (
    campaign.status === "FAILED" ||
    campaign.status === "CANCELLED"
  ) {
    return "ARCHIVED";
  }

  if (
    campaign.status === "QUEUED" ||
    campaign.status === "RUNNING" ||
    campaign.status === "DISPATCHED"
  ) {
    return "RUNNING";
  }

  if (
    campaign.approvalStatus === "REJECTED"
  ) {
    return "REJECTED";
  }

  if (
    campaign.approvalStatus === "SUBMITTED"
  ) {
    return "PENDING_APPROVAL";
  }

  if (
    campaign.status === "READY" ||
    campaign.status === "SCHEDULED" ||
    campaign.approvalStatus === "APPROVED"
  ) {
    return "APPROVED";
  }

  return "DRAFT";
}

export function filterCampaignsByLifecycleTab(
  campaigns: CommunicationCampaignDTO[],
  tab: CampaignLifecycleTab
): CommunicationCampaignDTO[] {
  if (
    tab === "ALL"
  ) {
    return campaigns;
  }

  return campaigns.filter(
    campaign =>
      getCampaignLifecycleTab(
        campaign
      ) === tab
  );
}

export function getCampaignDraftEditHref(
  campaignId: string
): string {
  return `/communication/campaigns/new/audience?campaign=${encodeURIComponent(
    campaignId
  )}`;
}

export function getCampaignSummaryHref(
  campaignId: string
): string {
  return `/communication/campaigns/new/summary?campaign=${encodeURIComponent(
    campaignId
  )}`;
}

export function getCampaignDetailsHref(
  campaignId: string
): string {
  return `/communication/campaigns/${encodeURIComponent(
    campaignId
  )}`;
}

export function getCampaignBoardActions(
  campaign: CommunicationCampaignDTO
): CampaignBoardAction[] {
  const canReview =
    Boolean(
      campaign.permissions
        ?.canReview
    );

  const canEdit =
    Boolean(
      campaign.permissions
        ?.canEdit
    );

  const canSubmit =
    Boolean(
      campaign.permissions
        ?.canSubmit
    );

  const canLaunch =
    Boolean(
      campaign.permissions
        ?.canLaunch
    );

  const canDelete =
    Boolean(
      campaign.permissions
        ?.canDelete
    );

  const canArchive =
    Boolean(
      campaign.permissions
        ?.canArchive
    );

  if (campaign.approvalStatus === "SUBMITTED") {
    return canReview
      ? [
          {
            label: "Review",
            href: getCampaignSummaryHref(
              campaign.id
            ),
            tone: "primary",
            kind: "link",
          },
          {
            label: "View",
            href: getCampaignDetailsHref(
              campaign.id
            ),
            tone: "secondary",
            kind: "link",
          },
        ]
      : [
          {
            label: "View",
            href: getCampaignDetailsHref(
              campaign.id
            ),
            tone: "primary",
            kind: "link",
          },
        ];
  }

  if (
    campaign.approvalStatus ===
    "REJECTED"
  ) {
    const actions: CampaignBoardAction[] = [];

    if (canEdit) {
      actions.push({
        label: "Continue Editing",
        href: getCampaignDraftEditHref(
          campaign.id
        ),
        tone: "primary",
        kind: "link",
      });
    }

    if (canSubmit) {
      actions.push({
        label: "Resubmit",
        href: getCampaignSummaryHref(
          campaign.id
        ),
        tone: "secondary",
        kind: "link",
      });
    }

    if (canDelete) {
      actions.push({
        label: "Delete",
        apiPath: `/communication/campaigns/${encodeURIComponent(
          campaign.id
        )}`,
        tone: "tertiary",
        kind: "delete",
      });
    }

    return actions;
  }

  switch (
    getCampaignLifecycleTab(
      campaign
    )
  ) {
    case "DRAFT":
      {
        const actions: CampaignBoardAction[] = [];

        if (canEdit) {
          actions.push({
            label: "Continue Editing",
            href: getCampaignDraftEditHref(
              campaign.id
            ),
            tone: "primary",
            kind: "link",
          });
        }

        if (canSubmit) {
          actions.push({
            label: "Submit for Approval",
            href: getCampaignSummaryHref(
              campaign.id
            ),
            tone: "secondary",
            kind: "link",
          });
        }

        if (canDelete) {
          actions.push({
            label: "Delete",
            apiPath: `/communication/campaigns/${encodeURIComponent(
              campaign.id
            )}`,
            tone: "tertiary",
            kind: "delete",
          });
        }

        return actions;
      }

    case "APPROVED":
      return [
        ...(canLaunch
          ? [
              {
                label: "Launch",
                href: getCampaignSummaryHref(
                  campaign.id
                ),
                tone: "primary",
                kind: "link",
              } satisfies CampaignBoardAction,
            ]
          : []),
        {
          label: "View",
          href: getCampaignDetailsHref(
            campaign.id
          ),
          tone: "secondary",
          kind: "link",
        },
      ];

    case "RUNNING":
    case "COMPLETED":
      {
        const actions: CampaignBoardAction[] = [
        {
          label: "View Results",
          href: getCampaignDetailsHref(
            campaign.id
          ),
          tone: "primary",
          kind: "link",
        },
        ];

        if (canArchive) {
          actions.push({
            label: "Archive",
            apiPath: `/communication/campaigns/${encodeURIComponent(
              campaign.id
            )}/archive`,
            tone: "secondary",
            kind: "archive",
          });
        }

        return actions;
      }

    case "ARCHIVED":
      return [
        {
          label: "View",
          href: getCampaignDetailsHref(
            campaign.id
          ),
          tone: "primary",
          kind: "link",
        },
      ];
  }

  return [];
}
