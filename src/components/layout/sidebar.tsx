"use client";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

import {
  LayoutDashboard,
  Users,
  Megaphone,
  Contact,
  Phone,
  Bot,
  BookOpen,
  BarChart3,
  Workflow,
  Settings,
} from "lucide-react";

const menu = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Users",
    href: "/users",
    icon: Users,
  },
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
    label: "Calls",
    href: "/calls",
    icon: Phone,
  },
  {
    label: "Agents",
    href: "/agents",
    icon: Bot,
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
    label: "IVR Builder",
    href: "/ivr",
    icon: Workflow,
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export default function Sidebar() {
  const pathname =
    usePathname();

  return (
    <aside
      className="
        min-h-screen
        w-64
        border-r
        bg-white
        p-5
      "
    >
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="block"
        >
          <h2
            className="
              text-2xl
              font-bold
              text-blue-600
            "
          >
            AI IVR
          </h2>

          <p
            className="
              text-sm
              text-gray-500
            "
          >
            Management System
          </p>
        </Link>
      </div>

      <nav aria-label="Dashboard navigation">
        <ul className="space-y-2">
          {menu.map(
            (
              item
            ) => {
              const Icon =
                item.icon;

              const isActive =
                pathname ===
                  item.href ||
                (
                  item.href !==
                    "/dashboard" &&
                  pathname.startsWith(
                    `${item.href}/`
                  )
                );

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
                      px-4
                      py-3
                      transition-all
                      duration-200
                      ${
                        isActive
                          ? `
                            bg-blue-600
                            text-white
                            shadow-sm
                          `
                          : `
                            text-gray-700
                            hover:bg-blue-50
                            hover:text-blue-600
                            hover:shadow-sm
                          `
                      }
                    `}
                  >
                    <Icon
                      size={
                        20
                      }
                    />

                    <span className="font-medium">
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