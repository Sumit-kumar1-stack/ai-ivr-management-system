import {
  redirect,
} from "next/navigation";

import DashboardShell from "@/components/layout/dashboard-shell";

import {
  getCurrentUser,
} from "@/lib/auth";


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


  return (
    <DashboardShell>
      {children}
    </DashboardShell>
  );

}