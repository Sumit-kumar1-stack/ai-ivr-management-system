import { ApiKeyStatus, AuditEventOutcome, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuthErrorResponse } from "@/lib/auth-response";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/services/audit/audit-event.service";
import { extractAuditRequestContext } from "@/services/audit/audit-context";
import { createApiKeyMaterial } from "@/services/developer/developer-security.service";

const DeveloperRoles = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

const ApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET() {
  try {
    const currentUser = await requireRole(DeveloperRoles);

    if (!currentUser.tenantId) {
      return NextResponse.json(
        {
          success: false,
          message: "Tenant context is required for developer tools.",
        },
        {
          status: 400,
        }
      );
    }

    const keys = await prisma.apiKey.findMany({
      where: {
        tenantId: currentUser.tenantId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        createdAt: true,
        createdByUser: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      keys,
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unable to list API keys",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireRole(DeveloperRoles);

    if (!currentUser.tenantId) {
      return NextResponse.json(
        {
          success: false,
          message: "Tenant context is required for developer tools.",
        },
        {
          status: 400,
        }
      );
    }

    const body = ApiKeyCreateSchema.parse(await request.json());
    const material = createApiKeyMaterial();
    const context = extractAuditRequestContext(request);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const key = await prisma.apiKey.create({
      data: {
        tenantId: currentUser.tenantId,
        createdByUserId: currentUser.id,
        name: body.name.trim(),
        prefix: material.prefix,
        hash: material.hash,
        scopes: body.scopes.map(scope => scope.trim()).filter(Boolean),
        status: ApiKeyStatus.ACTIVE,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
      },
    });

    await recordAuditEvent({
      tenantId: currentUser.tenantId,
      actor: currentUser,
      actorType: "USER",
      entityType: "ApiKey",
      resourceType: "ApiKey",
      resourceId: key.id,
      action: "API_KEY_CREATED",
      outcome: AuditEventOutcome.SUCCEEDED,
      result: "SUCCEEDED",
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      metadata: {
        name: key.name,
        prefix: key.prefix,
        scopes: body.scopes,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        key: {
          ...key,
          plaintextKey: material.plaintext,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unable to create API key",
      },
      {
        status: 400,
      }
    );
  }
}
