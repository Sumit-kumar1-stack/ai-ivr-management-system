import {
  Suspense,
} from "react";

import ChannelSelectionScreen from "@/components/omnibank/channel-selection-screen";

import {
  getCommunicationDeploymentCapabilities,
} from "@/config/communication-deployment-capabilities";

import {
  getCommunicationPlan,
} from "@/config/communication-plan";

export default function ChannelSelectionPage() {
  const plan =
    getCommunicationPlan();

  const deploymentCapabilities =
    getCommunicationDeploymentCapabilities();

  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500"
        >
          Loading campaign channels...
        </div>
      }
    >
      <ChannelSelectionScreen
        plan={
          plan
        }
        deploymentCapabilities={
          deploymentCapabilities
        }
      />
    </Suspense>
  );
}
