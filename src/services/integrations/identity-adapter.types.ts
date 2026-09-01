/**
 * Generic External Enterprise Identity / SSO Adapter Boundary
 * 
 * Maps external identity assertions (OIDC/SAML/OAuth2) into the tenant-scoped
 * User and RBAC model without exposing internal database or session tables.
 */

import { UserRole } from "@prisma/client";

export interface ExternalIdentityTokenAssertion {
  issuer: string;
  subject: string;
  tenantId: string;
  email: string;
  fullName?: string;
  department?: string;
  roles?: string[];
  attributes?: Record<string, string | number | boolean>;
}

export interface ExternalIdentityMappingResult {
  valid: boolean;
  tenantId: string;
  externalSubject: string;
  email: string;
  assignedRole: UserRole;
  assignedPersona: string;
  fullName: string;
  errorReason?: string;
}

/**
 * Standard role mapping dictionary from enterprise claims to platform UserRole
 */
export const DEFAULT_ENTERPRISE_ROLE_MAP: Record<string, { role: UserRole; persona: string }> = {
  "admin": { role: UserRole.ADMIN, persona: "ADMIN" },
  "administrator": { role: UserRole.ADMIN, persona: "ADMIN" },
  "developer": { role: UserRole.ADMIN, persona: "DEVELOPER" },
  "engineer": { role: UserRole.ADMIN, persona: "DEVELOPER" },
  "auditor": { role: UserRole.ADMIN, persona: "AUDITOR" },
  "compliance": { role: UserRole.ADMIN, persona: "AUDITOR" },
  "manager": { role: UserRole.ADMIN, persona: "CAMPAIGN_MANAGER" },
  "campaign_manager": { role: UserRole.ADMIN, persona: "CAMPAIGN_MANAGER" },
  "approver": { role: UserRole.ADMIN, persona: "APPROVER" },
  "agent": { role: UserRole.AGENT, persona: "AGENT" },
  "representative": { role: UserRole.AGENT, persona: "AGENT" },
  "viewer": { role: UserRole.AGENT, persona: "AGENT" },
};

export function mapEnterpriseClaimsToRole(claims: string[] = []): { role: UserRole; persona: string } {
  for (const claim of claims) {
    const normalized = claim.trim().toLowerCase();
    if (DEFAULT_ENTERPRISE_ROLE_MAP[normalized]) {
      return DEFAULT_ENTERPRISE_ROLE_MAP[normalized];
    }
  }
  // Safe least-privilege default
  return { role: UserRole.AGENT, persona: "AGENT" };
}

export function validateExternalIdentityAssertion(
  assertion: ExternalIdentityTokenAssertion
): ExternalIdentityMappingResult {
  if (!assertion.tenantId?.trim()) {
    return {
      valid: false,
      tenantId: "",
      externalSubject: assertion.subject || "",
      email: assertion.email || "",
      assignedRole: UserRole.AGENT,
      assignedPersona: "AGENT",
      fullName: assertion.fullName || "",
      errorReason: "TENANT_ID_REQUIRED",
    };
  }

  if (!assertion.email?.trim() || !assertion.email.includes("@")) {
    return {
      valid: false,
      tenantId: assertion.tenantId,
      externalSubject: assertion.subject || "",
      email: assertion.email || "",
      assignedRole: UserRole.AGENT,
      assignedPersona: "AGENT",
      fullName: assertion.fullName || "",
      errorReason: "VALID_EMAIL_REQUIRED",
    };
  }

  const { role, persona } = mapEnterpriseClaimsToRole(assertion.roles);

  return {
    valid: true,
    tenantId: assertion.tenantId.trim(),
    externalSubject: assertion.subject.trim(),
    email: assertion.email.trim().toLowerCase(),
    fullName: assertion.fullName?.trim() || assertion.email.split("@")[0],
    assignedRole: role,
    assignedPersona: persona,
  };
}
