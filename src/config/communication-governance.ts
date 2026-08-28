import { getBooleanEnv } from "./env";

export function isCommunicationCampaignMakerCheckerEnabled(): boolean {
  return getBooleanEnv(
    "COMMUNICATION_CAMPAIGN_MAKER_CHECKER_ENABLED",
    true
  );
}
