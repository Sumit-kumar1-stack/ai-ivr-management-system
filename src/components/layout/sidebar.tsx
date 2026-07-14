import Link from "next/link";

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
  return (
    <aside className="w-64 min-h-screen border-r bg-white p-5">

      <div className="mb-8">

        <h2 className="text-2xl font-bold text-blue-600">
          AI IVR
        </h2>

        <p className="text-sm text-gray-500">
          Management System
        </p>

      </div>

      <ul className="space-y-2">

        {menu.map((item) => {

          const Icon = item.icon;

          return (

            <li key={item.href}>

              <Link
                href={item.href}
                className="
                  flex
                  items-center
                  gap-3
                  rounded-lg
                  px-4
                  py-3
                  text-gray-700
                  transition-all
                  duration-200
                  hover:bg-blue-50
                  hover:text-blue-600
                  hover:shadow-sm
                "
              >

                <Icon size={20} />

                <span className="font-medium">
                  {item.label}
                </span>

              </Link>

            </li>

          );

        })}

      </ul>

    </aside>
  );
}