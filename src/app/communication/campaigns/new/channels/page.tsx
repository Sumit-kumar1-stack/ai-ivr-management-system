import ChannelSelectionScreen from "@/components/omnibank/channel-selection-screen";

import {
  getCommunicationPlan,
} from "@/config/communication-plan";

export default function ChannelSelectionPage() {
  const plan =
    getCommunicationPlan();

  return (
    <ChannelSelectionScreen
      plan={
        plan
      }
    />
  );
}