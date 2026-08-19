import type {
  ReactNode,
} from "react";

import {
  redirect,
} from "next/navigation";

import DashboardShell from "@/components/layout/dashboard-shell";

import {
  getCommunicationPlan,
} from "@/config/communication-plan";

import {
  getCurrentUser,
} from "@/lib/auth";

interface CommunicationLayoutProps {
  children:
    ReactNode;
}

export default async function CommunicationLayout({
  children,
}: CommunicationLayoutProps) {
  const user =
    await getCurrentUser();

  if (
    !user
  ) {
    redirect(
      "/login"
    );
  }

  const plan =
    getCommunicationPlan();

  return (
    <DashboardShell plan={plan}>
      {children}
    </DashboardShell>
  );
}