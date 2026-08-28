import {
  Suspense,
} from "react";

import CampaignSummaryScreen from "@/components/omnibank/campaign-summary-screen";

export default function CommunicationCampaignSummaryPage() {
  return (
    <Suspense
      fallback={
        <div
          className="
            flex
            min-h-[70vh]
            items-center
            justify-center
            text-sm
            text-[#6b7079]
          "
        >
          Loading campaign summary...
        </div>
      }
    >
      <CampaignSummaryScreen />
    </Suspense>
  );
}