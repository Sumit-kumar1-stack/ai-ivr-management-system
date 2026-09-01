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
  Disc,
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
          { label: "Recordings", href: "/calls/recordings", icon: Disc },
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
    const caps = campaignCapabilities ?? [];

    const hasCampaignCapabilities =
      caps.length === 0 ||
      caps.some(c =>
        [
          "CAMPAIGN_CREATE",
          "CAMPAIGN_EDIT",
          "CAMPAIGN_SUBMIT",
          "CAMPAIGN_LAUNCH",
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
        ].includes(c)
      );

    const canReviewCampaigns =
      caps.length === 0 ||
      caps.some(c =>
        [
          "CAMPAIGN_REVIEW",
          "CAMPAIGN_APPROVE",
          "CAMPAIGN_REJECT",
        ].includes(c)
      );

    const canUseIvr =
      caps.length === 0 ||
      caps.some(c =>
        [
          "CAMPAIGN_CREATE",
          "CAMPAIGN_EDIT",
          "CAMPAIGN_SUBMIT",
          "CAMPAIGN_REVIEW",
          "IVR_PUBLISH",
        ].includes(c)
      );

    const canAuthorIvr =
      caps.length === 0 ||
      caps.some(c =>
        [
          "CAMPAIGN_CREATE",
          "CAMPAIGN_EDIT",
          "CAMPAIGN_SUBMIT",
        ].includes(c)
      );

    const canAccessDeveloper =
      caps.length === 0 ||
      caps.some(c =>
        [
          "DEVELOPER_PORTAL_ACCESS",
          "API_KEYS_MANAGE",
          "WEBHOOKS_MANAGE",
        ].includes(c)
      );

    const canManageOrgUsers =
      caps.length === 0 ||
      caps.includes("ORG_USERS_MANAGE");

    const canManageOrgSettings =
      caps.length === 0 ||
      caps.includes("ORG_SETTINGS_MANAGE");

    const adminItems: NavigationItem[] = [];
    if (canManageOrgUsers) {
      adminItems.push({ label: "Users", href: "/users", icon: Users });
    }
    if (canManageOrgSettings) {
      adminItems.push({ label: "Settings", href: "/settings", icon: Settings });
    }

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
          { label: "Recordings", href: "/calls/recordings", icon: Disc },
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
      ...(canAccessDeveloper
        ? [{
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
          }]
        : []),
      ...(adminItems.length > 0
        ? [{
            title: "Administration",
            items: adminItems,
          }]
        : []),
    ];
  }

  // AGENT fallback
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
          label: "Recordings",
          href: "/calls/recordings",
          icon: Disc,
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
