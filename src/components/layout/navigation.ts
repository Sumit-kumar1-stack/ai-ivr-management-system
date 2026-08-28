import {
  UserRole,
} from "@prisma/client";

import type {
  CampaignCapability,
} from "@/services/communication/campaign-capabilities";

import {
  type LucideIcon,
  BarChart3,
  BookOpen,
  Contact,
  Gauge,
  KeyRound,
  Megaphone,
  Phone,
  Settings,
  Webhook,
  ListChecks,
  Workflow,
  Wrench,
  Users,
} from "lucide-react";

export interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavigationGroup {
  title: string;
  items: NavigationItem[];
}

const dashboardItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: Gauge,
};

export function buildDashboardNavigation(
  role: UserRole,
  campaignCapabilities?: readonly CampaignCapability[]
): NavigationGroup[] {
  if (role === UserRole.SUPER_ADMIN) {
    return [
      {
        title: "Workspace",
        items: [
          dashboardItem,
        ],
      },
      {
        title: "Operations",
        items: [
          { label: "Campaigns", href: "/campaigns", icon: Megaphone },
          { label: "Contacts", href: "/contacts", icon: Contact },
          { label: "Calls", href: "/calls", icon: Phone },
        ],
      },
      {
        title: "AI & Voice",
        items: [
          { label: "Knowledge", href: "/knowledge", icon: BookOpen },
          {
            label: "IVR Flows",
            href: "/ivr-flows",
            icon: Workflow,
          },
          {
            label: "IVR Builder",
            href: "/ivr-builder",
            icon: Wrench,
          },
          { label: "Analytics", href: "/analytics", icon: BarChart3 },
        ],
      },
      {
        title: "Governance",
        items: [
          { label: "Approvals", href: "/approvals", icon: ListChecks },
        ],
      },
      {
        title: "Administration",
        items: [
          { label: "Users", href: "/users", icon: Users },
          {
            label: "Platform Settings",
            href: "/settings",
            icon: Settings,
          },
        ],
      },
      {
        title: "Developer",
        items: [
          {
            label: "Developer Dashboard",
            href: "/developer",
            icon: Webhook,
          },
          {
            label: "API Keys",
            href: "/developer/api-keys",
            icon: KeyRound,
          },
          {
            label: "Webhooks",
            href: "/developer/webhooks",
            icon: Webhook,
          },
          {
            label: "Usage",
            href: "/developer/usage",
            icon: BarChart3,
          },
          {
            label: "Docs",
            href: "/developer/docs",
            icon: BookOpen,
          },
        ],
      },
    ];
  }

  if (role === UserRole.ADMIN) {
    const hasCampaignCapabilities =
      campaignCapabilities === undefined ||
      campaignCapabilities.length > 0;

    const canReviewCampaigns =
      campaignCapabilities === undefined ||
      campaignCapabilities.some(capability =>
        [
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
        ].includes(capability)
      );

    const canUseIvr =
      campaignCapabilities === undefined ||
      campaignCapabilities.some(capability =>
        ["CAMPAIGN_CREATE", "CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT", "CAMPAIGN_REVIEW"].includes(capability)
      );
    const canAuthorIvr = campaignCapabilities === undefined || campaignCapabilities.some(capability =>
      ["CAMPAIGN_CREATE", "CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT"].includes(capability)
    );

    return [
      {
        title: "Workspace",
        items: [
          dashboardItem,
        ],
      },
      {
        title: "Operations",
        items: [
          ...(hasCampaignCapabilities
            ? [
                {
                  label: "Campaigns",
                  href: "/campaigns",
                  icon: Megaphone,
                },
              ]
            : []),
          { label: "Contacts", href: "/contacts", icon: Contact },
          { label: "Calls", href: "/calls", icon: Phone },
        ],
      },
      {
        title: "AI & Voice",
        items: [
          {
            label: "Knowledge",
            href: "/knowledge",
            icon: BookOpen,
          },
          ...(canUseIvr
            ? [
                {
                  label: "IVR Flows",
                  href: "/ivr-flows",
                  icon: Workflow,
                },
                ...(canAuthorIvr ? [{ label: "IVR Builder", href: "/ivr-builder", icon: Wrench }] : []),
              ]
            : []),
          {
            label: "Analytics",
            href: "/analytics",
            icon: BarChart3,
          },
        ],
      },
      ...(canReviewCampaigns
        ? [{
            title: "Governance",
            items: [
              {
                label: "Approvals",
                href: "/approvals",
                icon: ListChecks,
              },
            ],
          }]
        : []),
      {
        title: "Administration",
        items: [
          { label: "Users", href: "/users", icon: Users },
          {
            label: "Settings",
            href: "/settings",
            icon: Settings,
          },
        ],
      },
    ];
  }

  return [
    {
      title: "Campaigns",
      items: [
        dashboardItem,
        {
          label: "Campaigns",
          href: "/campaigns",
          icon: Megaphone,
        },
        {
          label: "Contacts",
          href: "/contacts",
          icon: Contact,
        },
        {
          label: "Knowledge",
          href: "/knowledge",
          icon: BookOpen,
        },
        {
          label: "Calls",
          href: "/calls",
          icon: Phone,
        },
        {
          label: "Analytics",
          href: "/analytics",
          icon: BarChart3,
        },
      ],
    },
  ];
}
