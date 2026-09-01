import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { AnalyticsService, type AnalyticsTimeframe } from "@/services/analytics/analytics.service";
import { createServerLogger, getDurationMs, normalizeError } from "@/lib/logger";

const log = createServerLogger("analytics-api");

const ANALYTICS_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.AGENT,
] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = process.hrtime.bigint();

  try {
    const currentUser = await requireRole(ANALYTICS_ROLES);
    const searchParams = request.nextUrl.searchParams;

    const tab = searchParams.get("tab") || "overview";
    const timeframe = (searchParams.get("range") || "7d") as AnalyticsTimeframe;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const provider = searchParams.get("provider") || undefined;
    const runtime = searchParams.get("runtime") || undefined;
    const status = searchParams.get("status") || undefined;
    const campaignId = searchParams.get("campaignId") || undefined;

    // Tenant Scoping: Super Admin can query all tenants or filter by tenantId; standard users are strictly scoped
    const requestedTenantId = searchParams.get("tenantId");
    const tenantId =
      currentUser.role === UserRole.SUPER_ADMIN
        ? requestedTenantId || undefined
        : currentUser.tenantId ?? undefined;

    const filter = {
      timeframe,
      dateFrom,
      dateTo,
      tenantId,
      provider,
      runtime,
      status,
      campaignId,
    };

    let data: any = null;

    switch (tab) {
      case "inbound":
        data = await AnalyticsService.getInboundMetrics(filter);
        break;
      case "outbound":
        data = await AnalyticsService.getOutboundMetrics(filter);
        break;
      case "campaigns":
        data = await AnalyticsService.getCampaignMetrics(filter);
        break;
      case "overview":
      default:
        data = await AnalyticsService.getOverviewMetrics(filter);
        break;
    }

    log.info(
      {
        event: "analytics.query.success",
        tab,
        timeframe,
        tenantId: tenantId ?? "all",
        durationMs: getDurationMs(startedAt),
      },
      "Analytics data loaded"
    );

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    log.error(
      {
        event: "analytics.query.failed",
        error: normalizeError(error),
        durationMs: getDurationMs(startedAt),
      },
      "Analytics data query failed"
    );

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load analytics",
      },
      { status: 500 }
    );
  }
}
