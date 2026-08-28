import {
  AuditEventOutcome,
  Prisma,
} from "@prisma/client";

import type {
  AuthenticatedUser,
} from "@/lib/auth";

import {
  prisma,
} from "@/lib/prisma";

export type AuditEventActor =
  Pick<
    AuthenticatedUser,
    "id" | "role" | "tenantId"
  >;

export interface RecordAuditEventInput {
  tenantId: string;
  actor?:
    | AuditEventActor
    | null;
  actorType?:
    | string
    | null;
  entityType: string;
  entityId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  action: string;
  outcome: AuditEventOutcome;
  result?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: unknown;
}

export async function recordAuditEvent(
  input: RecordAuditEventInput
): Promise<void> {
  const tenantId = input.tenantId.trim();

  if (!tenantId) {
    throw new Error(
      "Tenant ID is required for audit events"
    );
  }

  const entityType = input.entityType.trim();

  if (!entityType) {
    throw new Error(
      "Entity type is required for audit events"
    );
  }

  const action = input.action.trim();

  if (!action) {
    throw new Error(
      "Action is required for audit events"
    );
  }

  const actorType =
    normalizeString(input.actorType) ??
    (input.actor ? "USER" : "SYSTEM");

  await prisma.auditEvent.create({
    data: {
      tenantId,
      actorUserId: input.actor?.id ?? null,
      actorRole: input.actor?.role ?? null,
      actorType,
      entityType,
      entityId: normalizeString(input.entityId),
      resourceType: normalizeString(input.resourceType),
      resourceId: normalizeString(input.resourceId),
      action,
      outcome: input.outcome,
      result:
        normalizeString(input.result) ??
        input.outcome,
      reason: normalizeString(input.reason),
      ipAddress: normalizeString(input.ipAddress),
      correlationId: normalizeString(input.correlationId),
      beforeState: toJsonValue(input.beforeState),
      afterState: toJsonValue(input.afterState),
      metadata: toJsonValue(input.metadata),
    },
  });
}

function normalizeString(
  value?: string | null
): string | null {
  const normalized = value?.trim() ?? "";

  return normalized ? normalized : null;
}

function toJsonValue(
  value: unknown
): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}
