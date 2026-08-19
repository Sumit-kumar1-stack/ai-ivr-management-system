"use client";

import Link from "next/link";

import {
  BarChart3,
  CircleHelp,
  FileUp,
  Landmark,
  LayoutDashboard,
  LogOut,
  Megaphone,
  ShieldCheck,
} from "lucide-react";

import type {
  ReactNode,
} from "react";

import type {
  CommunicationPlan,
} from "@/config/communication-plan";

//--------------------------------------------------
// Props
//--------------------------------------------------

interface OmniBankShellProps {
  children:
    ReactNode;

  plan:
    CommunicationPlan;

  activeSection?:
    "dashboard" |
    "csv" |
    "campaigns" |
    "ekyc" |
    "reports";
}

//--------------------------------------------------
// Navigation
//--------------------------------------------------

const navigation = [
  {
    id:
      "dashboard",

    label:
      "Dashboard",

    href:
      "/communication",

    icon:
      LayoutDashboard,
  },

  {
    id:
      "csv",

    label:
      "CSV",

    href:
      "#",

    icon:
      FileUp,
  },

  {
    id:
      "campaigns",

    label:
      "Campaigns",

    href:
      "/communication/campaigns/new/audience",

    icon:
      Megaphone,
  },

  {
    id:
      "ekyc",

    label:
      "eKYC",

    href:
      "#",

    icon:
      ShieldCheck,
  },

  {
    id:
      "reports",

    label:
      "Reports",

    href:
      "#",

    icon:
      BarChart3,
  },
] as const;

//--------------------------------------------------
// Shell
//--------------------------------------------------

export default function OmniBankShell({
  children,
  plan,
  activeSection =
    "campaigns",
}: OmniBankShellProps) {
  return (
    <div
      className="
        min-h-screen
        bg-[#f9f9ff]
        text-[#191c22]
      "
      style={{
        fontFamily:
          "Inter, Arial, Helvetica, sans-serif",
      }}
    >
      <div className="flex min-h-screen">

        {/* =========================================
            SIDEBAR
        ========================================= */}

        <aside
          className="
            fixed
            inset-y-0
            left-0
            z-40
            hidden
            w-[262px]
            border-r
            border-[#c1c6d5]/70
            bg-[#f4f5ff]
            lg:flex
            lg:flex-col
          "
        >
          {/* Brand */}

          <div className="px-4 pt-7">
            <div className="flex items-center gap-3">

              <div
                className="
                  flex
                  h-11
                  w-11
                  items-center
                  justify-center
                  rounded-[10px]
                  bg-[#0056ad]
                  text-white
                  shadow-sm
                "
              >
                <Landmark
                  size={25}
                  strokeWidth={2}
                />
              </div>

              <div>
                <h1
                  className="
                    text-[20px]
                    font-bold
                    tracking-[-0.02em]
                    text-[#004e9f]
                  "
                >
                  OmniBank
                </h1>

                <p
                  className="
                    mt-[1px]
                    text-[12px]
                    text-[#86868b]
                  "
                >
                  Enterprise Portal
                </p>
              </div>
            </div>

            {/* Plan */}

            <div
              className="
                mt-5
                rounded-xl
                border
                border-[#d7e3ff]
                bg-white/70
                px-3
                py-2
              "
            >
              <p
                className="
                  text-[10px]
                  font-bold
                  uppercase
                  tracking-[0.12em]
                  text-[#727784]
                "
              >
                Communication Plan
              </p>

              <p
                className="
                  mt-1
                  text-[12px]
                  font-semibold
                  text-[#004e9f]
                "
              >
                {plan.label}
              </p>
            </div>
          </div>

          {/* Navigation */}

          <nav
            className="
              mt-11
              flex-1
              space-y-2
              px-3
            "
          >
            {navigation.map(
              item => {
                const Icon =
                  item.icon;

                const active =
                  activeSection ===
                  item.id;

                return (
                  <Link
                    key={
                      item.id
                    }
                    href={
                      item.href
                    }
                    className={[
                      "flex h-[50px] items-center gap-4 rounded-[13px] px-4",
                      "text-[13px] font-semibold transition-all duration-200",
                      active
                        ? "bg-[#e1e2eb] text-[#004e9f]"
                        : "text-[#7a7d84] hover:bg-white/70 hover:text-[#191c22]",
                    ].join(
                      " "
                    )}
                  >
                    <Icon
                      size={21}
                      strokeWidth={
                        active
                          ? 2.2
                          : 1.8
                      }
                    />

                    <span>
                      {item.label}
                    </span>
                  </Link>
                );
              }
            )}
          </nav>

          {/* Bottom */}

          <div className="px-3 pb-6">

            <div
              className="
                mb-4
                h-px
                bg-[#c1c6d5]
              "
            />

            <button
              type="button"
              className="
                flex
                h-[48px]
                w-full
                items-center
                gap-4
                rounded-xl
                px-4
                text-[13px]
                font-semibold
                text-[#7a7d84]
                transition
                hover:bg-white/70
              "
            >
              <CircleHelp
                size={20}
              />

              Support
            </button>

            <button
              type="button"
              className="
                flex
                h-[48px]
                w-full
                items-center
                gap-4
                rounded-xl
                px-4
                text-[13px]
                font-semibold
                text-[#7a7d84]
                transition
                hover:bg-white/70
              "
            >
              <LogOut
                size={20}
              />

              Sign Out
            </button>
          </div>
        </aside>

        {/* =========================================
            MAIN CONTENT
        ========================================= */}

        <main
          className="
            min-w-0
            flex-1
            lg:ml-[262px]
          "
        >
          {children}
        </main>
      </div>
    </div>
  );
}