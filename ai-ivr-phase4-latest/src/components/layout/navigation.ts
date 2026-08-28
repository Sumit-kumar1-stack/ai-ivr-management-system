import {
  UserRole,
} from "@prisma/client";

import {
  type LucideIcon,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Contact,
  FileClock,
  Gauge,
  KeyRound,
  Megaphone,
  Phone,
  Shield,
  Users,
  Workflow,
  Settings,
  Webhook,
  LifeBuoy,
  ListChecks,
  Activity,
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
  role: UserRole
): NavigationGroup[] {
  if (role === UserRole.SUPER_ADMIN) {
    return [
      {
        title: "Platform",
        items: [
          dashboardItem,
          {
            label: "Tenants",
            href: "/tenants",
            icon: Building2,
          },
          {
            label: "Tenant Reviews",
            href: "/tenant-reviews",
            icon: ListChecks,
          },
          {
            label: "Plans",
            href: "/plans",
            icon: BriefcaseBusiness,
          },
          {
            label: "Entitlements",
            href: "/entitlements",
            icon: Shield,
          },
          {
            label: "Billing Overview",
            href: "/billing",
            icon: Activity,
          },
          {
            label: "Provider Health",
            href: "/provider-health",
            icon: Activity,
          },
          {
            label: "Security",
            href: "/security",
            icon: Shield,
          },
          {
            label: "Audit",
            href: "/audit",
            icon: FileClock,
          },
          {
            label: "Support Access",
            href: "/support-access",
            icon: LifeBuoy,
          },
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
    return [
      {
        title: "Workspace",
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
          {
            label: "Team",
            href: "/team",
            icon: Users,
          },
          {
            label: "Approvals",
            href: "/approvals",
            icon: ListChecks,
          },
          {
            label: "Integrations",
            href: "/integrations",
            icon: Workflow,
          },
          {
            label: "Billing",
            href: "/billing",
            icon: BriefcaseBusiness,
          },
          {
            label: "Settings",
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
