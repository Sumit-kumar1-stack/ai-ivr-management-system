import { createHash, randomBytes } from "crypto";

import {
  AccountStatus,
  AuditEventOutcome,
  TenantInvitationStatus,
  SubscriptionPlanTier,
  SubscriptionStatus,
  TenantStatus,
  UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/hash";
import { recordAuditEvent } from "@/services/audit/audit-event.service";
import { getDefaultCampaignCapabilitiesForRole } from "@/features/users/user-campaign-capabilities";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";

import type {
  AcceptTenantInvitationInput,
  CreateTenantInvitationInput,
} from "./onboarding.schema";

function hashToken(token: string) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function slugifyTenantName(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "tenant";
}

async function resolveUniqueTenantSlug(
  preferredSlug: string
) {
  let slug = preferredSlug;
  let suffix = 2;

  while (
    await prisma.tenant.findUnique({
      where: {
        slug,
      },
      select: {
        id: true,
      },
    })
  ) {
    slug = `${preferredSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export async function createTenantInvitation(
  input: CreateTenantInvitationInput,
  invitedByUserId?: string
) {
  const tenantName = input.tenantName.trim();
  const slugBase = input.tenantSlug?.trim() ||
    slugifyTenantName(tenantName);
  const tenantSlug = await resolveUniqueTenantSlug(slugBase);

  const invitationToken =
    randomBytes(32).toString("hex");

  const tokenHash = hashToken(invitationToken);

  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  );

  const result = await prisma.$transaction(async tx => {
    const tenant = await tx.tenant.create({
      data: {
        name: tenantName,
        slug: tenantSlug,
        status: TenantStatus.PENDING,
        ownerUserId: invitedByUserId ?? null,
      },
    });

    await tx.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        provider: null,
        planTier: SubscriptionPlanTier.STANDARD,
        status: SubscriptionStatus.TRIALING,
        entitlements: [],
      },
    });

    const invitation = await tx.tenantInvitation.create({
      data: {
        tenantId: tenant.id,
        email: input.adminEmail.toLowerCase(),
        fullName: input.adminFullName.trim(),
        role: input.adminRole as UserRole,
        tokenHash,
        createdByUserId: invitedByUserId ?? null,
        expiresAt,
      },
    });

    return {
      tenant,
      invitation,
    };
  });

  await recordAuditEvent({
    tenantId: result.tenant.id,
    actor: invitedByUserId
      ? {
          id: invitedByUserId,
          role: UserRole.SUPER_ADMIN,
          tenantId: result.tenant.id,
        }
      : null,
    actorType: invitedByUserId ? "USER" : "SYSTEM",
    entityType: "Tenant",
    resourceType: "Tenant",
    resourceId: result.tenant.id,
    action: "TENANT_CREATED",
    outcome: AuditEventOutcome.SUCCEEDED,
    result: "SUCCEEDED",
    metadata: {
      tenantSlug: result.tenant.slug,
      invitedAdminEmail: result.invitation.email,
    },
  });

  await recordAuditEvent({
    tenantId: result.tenant.id,
    actor: invitedByUserId
      ? {
          id: invitedByUserId,
          role: UserRole.SUPER_ADMIN,
          tenantId: result.tenant.id,
        }
      : null,
    actorType: invitedByUserId ? "USER" : "SYSTEM",
    entityType: "TenantInvitation",
    resourceType: "TenantInvitation",
    resourceId: result.invitation.id,
    action: "USER_INVITED",
    outcome: AuditEventOutcome.SUCCEEDED,
    result: "SUCCEEDED",
    metadata: {
      invitationEmail: result.invitation.email,
      invitedByUserId,
    },
  });

  return {
    tenant: result.tenant,
    invitation: result.invitation,
    invitationToken,
    invitationUrl: `/onboarding/${invitationToken}`,
  };
}

export async function getTenantInvitationByToken(
  token: string
) {
  const tokenHash = hashToken(token);

  const invitation =
    await prisma.tenantInvitation.findUnique({
      where: {
        tokenHash,
      },
      include: {
        tenant: true,
      },
    });

  if (!invitation) {
    return null;
  }

  const expired =
    invitation.status === TenantInvitationStatus.PENDING &&
    invitation.expiresAt.getTime() < Date.now();

  if (expired) {
    await prisma.tenantInvitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: TenantInvitationStatus.EXPIRED,
      },
    });
  }

  return {
    ...invitation,
    status: expired
      ? TenantInvitationStatus.EXPIRED
      : invitation.status,
  };
}

export async function acceptTenantInvitation(
  token: string,
  input: AcceptTenantInvitationInput
) {
  const tokenHash = hashToken(token);

  const invitation =
    await prisma.tenantInvitation.findUnique({
      where: {
        tokenHash,
      },
      include: {
        tenant: true,
      },
    });

  if (!invitation) {
    throw new NotFoundError(
      "Invitation not found"
    );
  }

  if (
    invitation.status !== TenantInvitationStatus.PENDING
  ) {
    throw new ValidationError(
      "Invitation is no longer valid"
    );
  }

  if (
    invitation.expiresAt.getTime() < Date.now()
  ) {
    await prisma.tenantInvitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: TenantInvitationStatus.EXPIRED,
      },
    });

    throw new ValidationError(
      "Invitation has expired"
    );
  }

  const existingUser =
    await prisma.user.findUnique({
      where: {
        email: invitation.email,
      },
      select: {
        id: true,
      },
    });

  if (existingUser) {
    throw new ConflictError(
      "A user with this email already exists"
    );
  }

  const hashedPassword =
    await hashPassword(input.password);

  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: {
        fullName: input.fullName.trim(),
        email: invitation.email,
        password: hashedPassword,
        role: invitation.role,
        campaignCapabilities:
          getDefaultCampaignCapabilitiesForRole(
            invitation.role
          ),
        phone: input.phone?.trim() || null,
        tenantId: invitation.tenantId,
        accountStatus: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        invitedAt: invitation.invitedAt,
        invitedByUserId: invitation.createdByUserId,
        onboardingCompletedAt: new Date(),
        isActive: true,
      },
    });

    await tx.tenantInvitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: TenantInvitationStatus.ACCEPTED,
        acceptedAt: new Date(),
        acceptedByUserId: user.id,
      },
    });

    await tx.tenant.update({
      where: {
        id: invitation.tenantId,
      },
      data: {
        status: TenantStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });

    return user;
  });

  await recordAuditEvent({
    tenantId: invitation.tenantId,
    actor: {
      id: result.id,
      role: result.role,
      tenantId: result.tenantId,
    },
    actorType: "USER",
    entityType: "User",
    resourceType: "User",
    resourceId: result.id,
    action: "USER_REGISTERED",
    outcome: AuditEventOutcome.SUCCEEDED,
    result: "SUCCEEDED",
    metadata: {
      invitedByUserId: invitation.createdByUserId,
    },
  });

  await recordAuditEvent({
    tenantId: invitation.tenantId,
    actor: {
      id: result.id,
      role: result.role,
      tenantId: result.tenantId,
    },
    actorType: "USER",
    entityType: "Tenant",
    resourceType: "Tenant",
    resourceId: invitation.tenantId,
    action: "TENANT_ACTIVATED",
    outcome: AuditEventOutcome.SUCCEEDED,
    result: "SUCCEEDED",
    metadata: {
      invitationId: invitation.id,
    },
  });

  return result;
}
