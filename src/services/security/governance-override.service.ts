import { AuditEventOutcome, UserRole } from "@prisma/client";
import { recordAuditEvent } from "@/services/audit/audit-event.service";
import type { AuthenticatedUser } from "@/lib/auth";

/**
 * Checks whether the non-production Super Admin testing self-approval override is active.
 *
 * PRODUCTION FAIL-SAFE:
 * If NODE_ENV is "production", this helper STRICTLY returns false regardless of
 * environment variables, preventing any accidental self-approval bypass in production.
 */
export function isSuperAdminSelfApprovalOverrideEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    if (process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL === "true") {
      console.warn(
        "CRITICAL_SECURITY_WARNING: ALLOW_SUPER_ADMIN_SELF_APPROVAL is ignored in production environment."
      );
    }
    return false;
  }

  return process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL === "true";
}

/**
 * Determines whether the actor is eligible to bypass maker-checker self-approval rules
 * for non-production testing convenience.
 *
 * Rules:
 * 1. Actor must have role === SUPER_ADMIN (no tenant Admin, Maker, Checker, Developer, or Agent can ever bypass).
 * 2. NODE_ENV must NOT be "production".
 * 3. ALLOW_SUPER_ADMIN_SELF_APPROVAL must be explicitly set to "true".
 */
export function canBypassMakerCheckerForTesting(
  actor: { role?: UserRole | string | null } | null | undefined
): boolean {
  if (!actor || actor.role !== UserRole.SUPER_ADMIN) {
    return false;
  }

  return isSuperAdminSelfApprovalOverrideEnabled();
}

/**
 * Records an audit marker when SUPER_ADMIN utilizes the testing self-approval override.
 */
export async function recordSuperAdminSelfApprovalOverrideAudit(params: {
  actor: { id: string; role?: UserRole | string; tenantId?: string | null; [key: string]: any };
  entityType: "CAMPAIGN" | "IVR_FLOW";
  entityId: string;
  tenantId?: string | null;
}): Promise<void> {
  await recordAuditEvent({
    tenantId: params.tenantId ?? "",
    actor: {
      id: params.actor.id,
      role: (params.actor.role ?? UserRole.SUPER_ADMIN) as UserRole,
      tenantId: params.actor.tenantId ?? params.tenantId ?? null,
    },
    entityType: params.entityType,
    entityId: params.entityId,
    action: "governance.super_admin_self_approval_override",
    outcome: AuditEventOutcome.SUCCEEDED,
    metadata: {
      overrideReason: "Non-production testing self-approval override enabled",
      environment: process.env.NODE_ENV ?? "development",
    },
  });
}
