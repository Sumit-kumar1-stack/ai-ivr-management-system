import { UserRole, AuditEventOutcome, WebhookEndpointStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { createAuthErrorResponse } from "@/lib/auth-response";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractAuditRequestContext } from "@/services/audit/audit-context";
import { recordAuditEvent } from "@/services/audit/audit-event.service";
import { createWebhookSecretMaterial, isSafeWebhookUrl } from "@/services/developer/developer-security.service";

const DeveloperRoles = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

const WebhookCreateSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url(),
  description: z.string().max(500).optional().nullable(),
  events: z.array(z.string().min(1)).default([]),
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
        { status: 400 }
      );
    }

    const webhooks = await prisma.webhookEndpoint.findMany({
      where: {
        tenantId: currentUser.tenantId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        url: true,
        description: true,
        events: true,
        status: true,
        lastDeliveredAt: true,
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
      webhooks,
    });
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unable to list webhooks",
      },
      { status: 500 }
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
        { status: 400 }
      );
    }

    const body = WebhookCreateSchema.parse(await request.json());
    const context = extractAuditRequestContext(request);

    if (!isSafeWebhookUrl(body.url)) {
      return NextResponse.json(
        {
          success: false,
          message: "Webhook URL must use HTTPS and point to a public endpoint.",
        },
        { status: 400 }
      );
    }

    const secret = createWebhookSecretMaterial();

    const webhook = await prisma.webhookEndpoint.create({
      data: {
        tenantId: currentUser.tenantId,
        createdByUserId: currentUser.id,
        name: body.name.trim(),
        url: body.url.trim(),
        description: body.description?.trim() || null,
        secretHash: secret.hash,
        secretPrefix: secret.prefix,
        events: body.events.map(event => event.trim()).filter(Boolean),
        status: WebhookEndpointStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        url: true,
        description: true,
        secretPrefix: true,
      },
    });

    await recordAuditEvent({
      tenantId: currentUser.tenantId,
      actor: currentUser,
      actorType: "USER",
      entityType: "WebhookEndpoint",
      resourceType: "WebhookEndpoint",
      resourceId: webhook.id,
      action: "WEBHOOK_CREATED",
      outcome: AuditEventOutcome.SUCCEEDED,
      result: "SUCCEEDED",
      ipAddress: context.ipAddress,
      correlationId: context.correlationId,
      metadata: {
        name: webhook.name,
        url: webhook.url,
        events: body.events,
        secretPrefix: webhook.secretPrefix,
      },
    });

    return NextResponse.json(
      {
        success: true,
        webhook: {
          ...webhook,
          plaintextSecret: secret.plaintext,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = createAuthErrorResponse(error);
    if (authResponse) {
      return authResponse;
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unable to create webhook",
      },
      { status: 400 }
    );
  }
}

