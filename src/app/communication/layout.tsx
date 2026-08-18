import type {
  ReactNode,
} from "react";

import OmniBankShell from "@/components/omnibank/omnibank-shell";

import {
  getCommunicationPlan,
} from "@/config/communication-plan";

interface CommunicationLayoutProps {
  children:
    ReactNode;
}

export default function CommunicationLayout({
  children,
}: CommunicationLayoutProps) {
  const plan =
    getCommunicationPlan();

  return (
    <OmniBankShell
      plan={
        plan
      }
      activeSection="campaigns"
    >
      {children}
    </OmniBankShell>
  );
}