import {
  redirect,
} from "next/navigation";

import DashboardShell from "@/components/layout/dashboard-shell";

import {
  getCurrentUser,
} from "@/lib/auth";

import {
  getCommunicationPlan,
} from "@/config/communication-plan";


export default async function DashboardLayout({
  children,
}: {
  children:
    React.ReactNode;
}) {

  const user =
    await getCurrentUser();


  if (
    !user
  ) {
    redirect(
      "/login"
    );
  }

  const plan = getCommunicationPlan();

  return (
    <DashboardShell
      plan={plan}
      role={user.role}
    >
      {children}
    </DashboardShell>
  );

}
