import Sidebar from "./sidebar";
import Header from "./header";
import type { UserRole } from "@prisma/client";
import type { CommunicationPlan } from "@/config/communication-plan";

export default function DashboardShell({
  children,
  plan,
  role,
}: {
  children: React.ReactNode;
  plan?: CommunicationPlan;
  role: UserRole;
}) {
  return (
    <div className="flex">
      <Sidebar plan={plan} role={role} />

      <div className="flex-1">
        <Header role={role} />

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
