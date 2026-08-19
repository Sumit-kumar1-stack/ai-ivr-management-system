"use client";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

import {
  LayoutDashboard,
  Megaphone,
  Contact,
  Phone,
  BookOpen,
  BarChart3,
  Workflow,
  Settings,
} from "lucide-react";

import type { CommunicationPlan } from "@/config/communication-plan";

const menu = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Campaigns",
    href: "/campaigns",
    icon: Megaphone,
  },
  {
    label: "Calls",
    href: "/calls",
    icon: Phone,
  },
  {
    label: "Contacts",
    href: "/contacts",
    icon: Contact,
  },
  {
    label: "IVR",
    href: "/ivr",
    icon: Workflow,
  },
  {
    label: "Knowledge",
    href: "/knowledge",
    icon: BookOpen,
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export default function Sidebar({
  plan,
}: {
  plan?: CommunicationPlan;
}) {
  const pathname =
    usePathname();

  return (
    <aside
      className="
        min-h-screen
        w-64
        border-r
        border-slate-200/80
        bg-slate-50/60
        p-6
      "
    >
      <div className="mb-8 px-2 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-lg shadow-sm shadow-blue-500/20">
          A
        </div>
        <Link
          href="/dashboard"
          className="block"
        >
          <h2
            className="
              text-lg
              font-bold
              tracking-tight
              text-slate-900
            "
          >
            OmniIVR
          </h2>

          <p
            className="
              text-[10px]
              font-bold
              uppercase
              tracking-wider
              text-slate-400
            "
          >
            Control Center
          </p>
        </Link>
      </div>

      {plan && (
        <div
          className="
            mb-6
            rounded-xl
            border
            border-blue-100/80
            bg-blue-50/50
            p-3
          "
        >
          <p
            className="
              text-[9px]
              font-bold
              uppercase
              tracking-widest
              text-blue-500/80
            "
          >
            Communication Plan
          </p>

          <p
            className="
              mt-1
              text-[11px]
              font-bold
              text-blue-700
            "
          >
            {plan.label}
          </p>
        </div>
      )}

      <nav aria-label="Dashboard navigation">
        <ul className="space-y-1">
          {menu.map(
            (
              item
            ) => {
              const Icon =
                item.icon;

              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(`${item.href}/`)) ||
                (item.href === "/ivr" &&
                  pathname.startsWith("/ivr-builder")) ||
                (item.href === "/campaigns" &&
                  pathname.startsWith("/communication/campaigns"));

              return (
                <li
                  key={
                    item.href
                  }
                >
                  <Link
                    href={
                      item.href
                    }
                    aria-current={
                      isActive
                        ? "page"
                        : undefined
                    }
                    className={`
                      flex
                      items-center
                      gap-3
                      rounded-lg
                      px-3
                      py-2.5
                      text-sm
                      font-semibold
                      transition-all
                      duration-150
                      ${
                        isActive
                          ? `
                            bg-blue-600
                            text-white
                            shadow-sm
                            shadow-blue-500/10
                          `
                          : `
                            text-slate-600
                            hover:bg-slate-200/50
                            hover:text-slate-900
                          `
                      }
                    `}
                  >
                    <Icon
                      size={
                        18
                      }
                    />

                    <span>
                      {
                        item.label
                      }
                    </span>
                  </Link>
                </li>
              );
            }
          )}
        </ul>
      </nav>
    </aside>
  );
}
