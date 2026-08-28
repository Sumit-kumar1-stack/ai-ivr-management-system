import { UserRole } from "@prisma/client";

import type { CampaignCapability } from "@/services/communication/campaign-capabilities";

const CAMPAIGN_MAKER_CAPABILITIES: readonly CampaignCapability[] = [
  "CAMPAIGN_CREATE",
  "CAMPAIGN_EDIT",
  "CAMPAIGN_SUBMIT",
  "CAMPAIGN_LAUNCH",
];

const CAMPAIGN_CHECKER_CAPABILITIES: readonly CampaignCapability[] = [
  "CAMPAIGN_REVIEW",
  "CAMPAIGN_APPROVE",
  "CAMPAIGN_REJECT",
];

export function getDefaultCampaignCapabilitiesForRole(
  role: UserRole
): CampaignCapability[] {
  switch (role) {
    case UserRole.ADMIN:
      return [...CAMPAIGN_MAKER_CAPABILITIES];

    case UserRole.AGENT:
      return [...CAMPAIGN_CHECKER_CAPABILITIES];

    case UserRole.SUPER_ADMIN:
    default:
      return [];
  }
}

