import Sidebar from "./sidebar";
import Header from "./header";
import type { UserRole } from "@prisma/client";
import type { CommunicationPlan } from "@/config/communication-plan";
import type { CampaignCapability } from "@/services/communication/campaign-capabilities";
import { ProductTourProvider } from "@/lib/product-tour-context";
import ProductTourOverlay from "@/components/tour/product-tour-overlay";
import ProductTourWelcomeModal from "@/components/tour/product-tour-welcome-modal";
import ProductTourResumeDialog from "@/components/tour/product-tour-resume-dialog";

export default function DashboardShell({
  children,
  plan,
  role,
  campaignCapabilities,
}: {
  children: React.ReactNode;
  plan?: CommunicationPlan;
  role: UserRole;
  campaignCapabilities?: readonly CampaignCapability[];
}) {
  return (
    <ProductTourProvider role={role}>
      <div className="flex">
        <Sidebar
          plan={plan}
          role={role}
          campaignCapabilities={campaignCapabilities}
        />

        <div className="flex-1">
          <Header role={role} />

          <main className="p-6">
            {children}
          </main>
        </div>
      </div>

      <ProductTourOverlay />
      <ProductTourWelcomeModal />
      <ProductTourResumeDialog />
    </ProductTourProvider>
  );
}

