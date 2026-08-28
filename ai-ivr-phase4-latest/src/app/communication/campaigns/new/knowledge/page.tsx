import { Suspense } from "react";

import CampaignKnowledgeSelectionScreen from "@/components/omnibank/campaign-knowledge-selection-screen";

export default function CommunicationCampaignKnowledgePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500">
          Loading campaign knowledge...
        </div>
      }
    >
      <CampaignKnowledgeSelectionScreen />
    </Suspense>
  );
}
