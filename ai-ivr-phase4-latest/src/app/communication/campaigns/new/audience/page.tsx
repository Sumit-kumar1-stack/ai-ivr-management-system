import {
  Suspense,
} from "react";

import AudienceSelectionScreen from "@/components/omnibank/audience-selection-screen";

import {
  getCommunicationPlan,
} from "@/config/communication-plan";

export default function CommunicationCampaignAudiencePage() {
  const plan =
    getCommunicationPlan();

  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500"
        >
          Loading campaign audience...
        </div>
      }
    >
      <AudienceSelectionScreen
        plan={
          plan
        }
      />
    </Suspense>
  );
}
