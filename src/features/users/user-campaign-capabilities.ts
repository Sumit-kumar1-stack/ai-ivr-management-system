import { UserRole } from "@prisma/client";
import {
  CAMPAIGN_CAPABILITIES,
  type CampaignCapability,
} from "@/services/communication/campaign-capabilities";

export { CAMPAIGN_CAPABILITIES, type CampaignCapability };

export type AccessProfile =
  | "ORGANIZATION_ADMIN"
  | "MAKER"
  | "CHECKER"
  | "DEVELOPER"
  | "AGENT"
  | "SUPER_ADMIN"
  | "CUSTOM";

export const ACCESS_PROFILE_LABELS: Record<AccessProfile, string> = {
  ORGANIZATION_ADMIN: "Organization Admin",
  MAKER: "Maker",
  CHECKER: "Checker",
  DEVELOPER: "Developer",
  AGENT: "Agent",
  SUPER_ADMIN: "Super Admin",
  CUSTOM: "Custom",
};

export const ACCESS_PROFILE_DESCRIPTIONS: Record<AccessProfile, string> = {
  ORGANIZATION_ADMIN: "Manages organization users, settings, and full operational workflows.",
  MAKER: "Creates, configures, and submits campaigns and IVR flows for approval.",
  CHECKER: "Reviews and decides submitted campaigns and IVR flows, and releases approved artifacts.",
  DEVELOPER: "Manages technical integrations, API keys, webhooks, usage, and developer documentation.",
  AGENT: "Operational agent handling active calls and contacts.",
  SUPER_ADMIN: "Platform owner with cross-tenant administrative and operations access.",
  CUSTOM: "Customized capability configuration for specialized access.",
};

export const MAKER_CAPABILITIES: readonly CampaignCapability[] = [
  "CAMPAIGN_CREATE",
  "CAMPAIGN_EDIT",
  "CAMPAIGN_SUBMIT",
  "CAMPAIGN_LAUNCH",
];

export const CHECKER_CAPABILITIES: readonly CampaignCapability[] = [
  "CAMPAIGN_REVIEW",
  "CAMPAIGN_APPROVE",
  "CAMPAIGN_REJECT",
  "CAMPAIGN_DELETE",
  "IVR_PUBLISH",
];

export const DEVELOPER_CAPABILITIES: readonly CampaignCapability[] = [
  "DEVELOPER_PORTAL_ACCESS",
  "API_KEYS_MANAGE",
  "WEBHOOKS_MANAGE",
];

export const ORGANIZATION_ADMIN_CAPABILITIES: readonly CampaignCapability[] = [
  "ORG_USERS_MANAGE",
  "ORG_SETTINGS_MANAGE",
  "CAMPAIGN_CREATE",
  "CAMPAIGN_EDIT",
  "CAMPAIGN_SUBMIT",
  "CAMPAIGN_REVIEW",
  "CAMPAIGN_APPROVE",
  "CAMPAIGN_REJECT",
  "CAMPAIGN_LAUNCH",
  "CAMPAIGN_DELETE",
  "IVR_PUBLISH",
  "DEVELOPER_PORTAL_ACCESS",
  "API_KEYS_MANAGE",
  "WEBHOOKS_MANAGE",
];

export function getDefaultCampaignCapabilitiesForRole(
  role: UserRole
): CampaignCapability[] {
  switch (role) {
    case UserRole.ADMIN:
      return [...MAKER_CAPABILITIES];

    case UserRole.AGENT:
      return [];

    case UserRole.SUPER_ADMIN:
      return [...CAMPAIGN_CAPABILITIES];

    default:
      return [];
  }
}

export function getCapabilitiesForAccessProfile(profile: AccessProfile): CampaignCapability[] {
  switch (profile) {
    case "ORGANIZATION_ADMIN":
      return [...ORGANIZATION_ADMIN_CAPABILITIES];
    case "MAKER":
      return [...MAKER_CAPABILITIES];
    case "CHECKER":
      return [...CHECKER_CAPABILITIES];
    case "DEVELOPER":
      return [...DEVELOPER_CAPABILITIES];
    case "SUPER_ADMIN":
      return [...CAMPAIGN_CAPABILITIES];
    case "AGENT":
    case "CUSTOM":
    default:
      return [];
  }
}

export function resolveAccessProfile(
  role: UserRole,
  capabilities: readonly string[] | null | undefined
): AccessProfile {
  if (role === UserRole.SUPER_ADMIN) {
    return "SUPER_ADMIN";
  }
  if (role === UserRole.AGENT) {
    return "AGENT";
  }

  const rawCaps = capabilities ?? [];
  const capSet = new Set(rawCaps);

  const hasAll = (bundle: readonly string[]) => bundle.every(c => capSet.has(c));
  const isExact = (bundle: readonly string[]) => bundle.length === capSet.size && hasAll(bundle);

  if (isExact(MAKER_CAPABILITIES)) {
    return "MAKER";
  }
  if (isExact(CHECKER_CAPABILITIES)) {
    return "CHECKER";
  }
  if (isExact(DEVELOPER_CAPABILITIES)) {
    return "DEVELOPER";
  }
  if (isExact(ORGANIZATION_ADMIN_CAPABILITIES) || hasAll(ORGANIZATION_ADMIN_CAPABILITIES)) {
    return "ORGANIZATION_ADMIN";
  }

  return "CUSTOM";
}
