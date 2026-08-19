import Sidebar from "./sidebar";
import Header from "./header";
import type { CommunicationPlan } from "@/config/communication-plan";

export default function DashboardShell({
  children,
  plan,
}: {
  children: React.ReactNode;
  plan?: CommunicationPlan;
}) {
  return (
    <div className="flex">
      <Sidebar plan={plan} />

      <div className="flex-1">
        <Header />

        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}