export const CAMPAIGN_CAPABILITIES = [
  "CAMPAIGN_CREATE",
  "CAMPAIGN_EDIT",
  "CAMPAIGN_SUBMIT",
  "CAMPAIGN_REVIEW",
  "CAMPAIGN_APPROVE",
  "CAMPAIGN_REJECT",
  "CAMPAIGN_LAUNCH",
] as const;

export type CampaignCapability =
  (typeof CAMPAIGN_CAPABILITIES)[number];

export function hasCampaignCapability(
  capabilities:
    readonly string[] | null | undefined,
  capability:
    CampaignCapability
): boolean {
  return Boolean(
    capabilities?.includes(
      capability
    )
  );
}

export function hasAnyCampaignCapability(
  capabilities:
    readonly string[] | null | undefined,
  required:
    readonly CampaignCapability[]
): boolean {
  return required.some(
    capability =>
      hasCampaignCapability(
        capabilities,
        capability
      )
  );
}
