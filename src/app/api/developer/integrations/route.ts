import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import {
  getIntegrationEndpointsForTenant,
  registerIntegrationEndpoint,
  unregisterIntegrationEndpoint,
  isSafeExternalIntegrationUrl,
} from "@/services/integrations/integration-action-gateway.service";
import { createServerLogger, getDurationMs, normalizeError } from "@/lib/logger";

const log = createServerLogger("developer-integrations-api");

const DEVELOPER_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = process.hrtime.bigint();

  try {
    const currentUser = await requireRole(DEVELOPER_ROLES);
    const searchParams = request.nextUrl.searchParams;

    const requestedTenantId = searchParams.get("tenantId");
    const tenantId =
      currentUser.role === UserRole.SUPER_ADMIN && requestedTenantId
        ? requestedTenantId
        : currentUser.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, message: "Tenant context is required" },
        { status: 400 }
      );
    }

    const endpoints = getIntegrationEndpointsForTenant(tenantId).map((ep) => ({
      id: ep.id,
      tenantId: ep.tenantId,
      actionCode: ep.actionCode,
      name: ep.name,
      endpointUrl: ep.endpointUrl,
      timeoutMs: ep.timeoutMs ?? 5000,
      requiredAuthLevel: ep.requiredAuthLevel ?? "AUTH_LEVEL_0",
      hasSecretRef: Boolean(ep.secretRef),
      headerKeys: ep.headers ? Object.keys(ep.headers) : [],
    }));

    return NextResponse.json({
      success: true,
      data: endpoints,
    });
  } catch (error) {
    log.error(
      {
        event: "developer.integrations.get_failed",
        error: normalizeError(error),
        durationMs: getDurationMs(startedAt),
      },
      "Failed to list developer integrations"
    );

    return NextResponse.json(
      { success: false, message: "Failed to list integrations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = process.hrtime.bigint();

  try {
    const currentUser = await requireRole(DEVELOPER_ROLES);
    const body = await request.json();

    const tenantId =
      currentUser.role === UserRole.SUPER_ADMIN && body.tenantId
        ? body.tenantId
        : currentUser.tenantId;

    if (!tenantId) {
      return NextResponse.json(
        { success: false, message: "Tenant context is required" },
        { status: 400 }
      );
    }

    const { actionCode, name, endpointUrl, timeoutMs, requiredAuthLevel, secretRef } = body;

    if (!actionCode || !name || !endpointUrl) {
      return NextResponse.json(
        { success: false, message: "actionCode, name, and endpointUrl are required" },
        { status: 400 }
      );
    }

    if (!isSafeExternalIntegrationUrl(endpointUrl)) {
      return NextResponse.json(
        { success: false, message: "Invalid or insecure endpoint URL. HTTPS required." },
        { status: 400 }
      );
    }

    const endpointId = `int-${Date.now()}`;
    registerIntegrationEndpoint({
      id: endpointId,
      tenantId,
      actionCode,
      name,
      endpointUrl,
      timeoutMs: timeoutMs ? Number(timeoutMs) : 5000,
      requiredAuthLevel: requiredAuthLevel ?? "AUTH_LEVEL_0",
      secretRef: secretRef ?? undefined,
    });

    log.info(
      {
        event: "developer.integrations.registered",
        tenantId,
        actionCode,
        durationMs: getDurationMs(startedAt),
      },
      "Registered developer integration endpoint"
    );

    return NextResponse.json({
      success: true,
      data: {
        id: endpointId,
        tenantId,
        actionCode,
        name,
        endpointUrl,
      },
    });
  } catch (error) {
    log.error(
      {
        event: "developer.integrations.register_failed",
        error: normalizeError(error),
        durationMs: getDurationMs(startedAt),
      },
      "Failed to register developer integration"
    );

    return NextResponse.json(
      { success: false, message: "Failed to register integration" },
      { status: 500 }
    );
  }
}
