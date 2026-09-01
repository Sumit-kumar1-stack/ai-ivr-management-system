import { prisma } from "@/lib/prisma";
import { CallStatus } from "@prisma/client";

export type AnalyticsTimeframe = "today" | "7d" | "30d" | "custom";

export interface AnalyticsFilter {
  timeframe?: AnalyticsTimeframe;
  dateFrom?: string;
  dateTo?: string;
  tenantId?: string | null;
  campaignId?: string;
  provider?: string;
  runtime?: string;
  status?: string;
}

function resolveDateRange(filter: AnalyticsFilter): { start: Date; end: Date } {
  const now = new Date();
  const end = filter.dateTo ? new Date(filter.dateTo) : now;

  if (filter.dateFrom) {
    return { start: new Date(filter.dateFrom), end };
  }

  const start = new Date(now);
  switch (filter.timeframe) {
    case "today":
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "30d":
      start.setUTCDate(start.getUTCDate() - 30);
      break;
    case "7d":
    default:
      start.setUTCDate(start.getUTCDate() - 7);
      break;
  }

  return { start, end };
}

function buildBaseWhere(filter: AnalyticsFilter, start: Date, end: Date) {
  const where: any = {
    createdAt: {
      gte: start,
      lte: end,
    },
  };

  if (filter.tenantId) {
    where.tenantId = filter.tenantId;
  }

  if (filter.campaignId) {
    where.campaignId = filter.campaignId;
  }

  if (filter.provider) {
    where.provider = filter.provider;
  }

  if (filter.runtime) {
    where.requestedRuntime = filter.runtime;
  }

  if (filter.status) {
    where.status = filter.status as CallStatus;
  }

  return where;
}

export class AnalyticsService {
  /**
   * Top-level Overview KPIs and trends.
   */
  static async getOverviewMetrics(filter: AnalyticsFilter) {
    const { start, end } = resolveDateRange(filter);
    const where = buildBaseWhere(filter, start, end);

    const [
      totalCalls,
      completedCalls,
      failedCalls,
      answeredCalls,
      inboundCount,
      outboundCount,
      standardCount,
      premiumCount,
      durationAggregate,
      recentCalls,
    ] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: CallStatus.COMPLETED } }),
      prisma.call.count({ where: { ...where, status: CallStatus.FAILED } }),
      prisma.call.count({ where: { ...where, status: { in: [CallStatus.ANSWERED, CallStatus.COMPLETED] } } }),
      prisma.call.count({ where: { ...where, direction: "INBOUND" } }),
      prisma.call.count({ where: { ...where, direction: "OUTBOUND" } }),
      prisma.call.count({ where: { ...where, requestedRuntime: "STANDARD" } }),
      prisma.call.count({ where: { ...where, requestedRuntime: { in: ["PREMIUM", "HYBRID"] } } }),
      prisma.call.aggregate({
        where: { ...where, duration: { not: null } },
        _avg: { duration: true },
        _sum: { duration: true },
      }),
      prisma.call.findMany({
        where,
        take: 100,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          duration: true,
          direction: true,
          provider: true,
          requestedRuntime: true,
          createdAt: true,
        },
      }),
    ]);

    const avgDuration = Math.round(durationAggregate._avg.duration ?? 0);
    const totalDurationSeconds = durationAggregate._sum.duration ?? 0;
    const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;
    const completionRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

    // Time-series volume bucketed by day
    const volumeByDayMap = new Map<string, { date: string; total: number; completed: number; failed: number }>();

    for (const call of recentCalls) {
      const dayKey = new Date(call.createdAt).toISOString().split("T")[0];
      const entry = volumeByDayMap.get(dayKey) ?? { date: dayKey, total: 0, completed: 0, failed: 0 };
      entry.total += 1;
      if (call.status === CallStatus.COMPLETED) entry.completed += 1;
      if (call.status === CallStatus.FAILED) entry.failed += 1;
      volumeByDayMap.set(dayKey, entry);
    }

    const volumeTrends = Array.from(volumeByDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return {
      kpis: {
        totalCalls,
        answeredCalls,
        completedCalls,
        failedCalls,
        answerRate,
        completionRate,
        avgDurationSeconds: avgDuration,
        totalDurationSeconds,
      },
      breakdowns: {
        direction: {
          inbound: inboundCount,
          outbound: outboundCount,
        },
        runtime: {
          standard: standardCount,
          premium: premiumCount,
        },
      },
      trends: volumeTrends,
      timeframe: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  /**
   * Inbound-specific analytics.
   */
  static async getInboundMetrics(filter: AnalyticsFilter) {
    const { start, end } = resolveDateRange(filter);
    const where = {
      ...buildBaseWhere(filter, start, end),
      direction: "INBOUND",
    };

    const [
      totalInbound,
      answeredInbound,
      completedInbound,
      failedInbound,
      durationAgg,
      inboundCalls,
    ] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: { in: [CallStatus.ANSWERED, CallStatus.COMPLETED] } } }),
      prisma.call.count({ where: { ...where, status: CallStatus.COMPLETED } }),
      prisma.call.count({ where: { ...where, status: CallStatus.FAILED } }),
      prisma.call.aggregate({
        where: { ...where, duration: { not: null } },
        _avg: { duration: true },
      }),
      prisma.call.findMany({
        where,
        take: 200,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          duration: true,
          provider: true,
          requestedRuntime: true,
          createdAt: true,
        },
      }),
    ]);

    const avgDuration = Math.round(durationAgg._avg.duration ?? 0);
    const answerRate = totalInbound > 0 ? Math.round((answeredInbound / totalInbound) * 100) : 0;

    // Provider distribution
    const providerCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    const durationBuckets = {
      under30s: 0,
      under1m: 0,
      under3m: 0,
      over3m: 0,
    };

    for (const call of inboundCalls) {
      const p = call.provider || "UNKNOWN";
      providerCounts[p] = (providerCounts[p] ?? 0) + 1;

      const s = call.status;
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;

      const d = call.duration ?? 0;
      if (d < 30) durationBuckets.under30s += 1;
      else if (d < 60) durationBuckets.under1m += 1;
      else if (d < 180) durationBuckets.under3m += 1;
      else durationBuckets.over3m += 1;
    }

    return {
      kpis: {
        totalInbound,
        answeredInbound,
        completedInbound,
        failedInbound,
        answerRate,
        avgDurationSeconds: avgDuration,
      },
      distributions: {
        byProvider: providerCounts,
        byStatus: statusCounts,
        durationBuckets,
      },
      timeframe: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  /**
   * Outbound-specific analytics.
   */
  static async getOutboundMetrics(filter: AnalyticsFilter) {
    const { start, end } = resolveDateRange(filter);
    const where = {
      ...buildBaseWhere(filter, start, end),
      direction: "OUTBOUND",
    };

    const [
      totalAttempts,
      connectedOutbound,
      completedOutbound,
      failedOutbound,
      durationAgg,
      campaignsWithCalls,
    ] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: { in: [CallStatus.ANSWERED, CallStatus.COMPLETED] } } }),
      prisma.call.count({ where: { ...where, status: CallStatus.COMPLETED } }),
      prisma.call.count({ where: { ...where, status: CallStatus.FAILED } }),
      prisma.call.aggregate({
        where: { ...where, duration: { not: null } },
        _avg: { duration: true },
      }),
      prisma.campaign.findMany({
        where: filter.tenantId ? { ownerUser: { tenantId: filter.tenantId } } : {},
        take: 15,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          calls: {
            where: { createdAt: { gte: start, lte: end } },
            select: { status: true, duration: true },
          },
        },
      }),
    ]);

    const avgDuration = Math.round(durationAgg._avg.duration ?? 0);
    const connectionRate = totalAttempts > 0 ? Math.round((connectedOutbound / totalAttempts) * 100) : 0;

    const campaignComparisons = campaignsWithCalls.map((camp) => {
      const calls = camp.calls;
      const attempted = calls.length;
      const connected = calls.filter((c) => c.status === CallStatus.ANSWERED || c.status === CallStatus.COMPLETED).length;
      const completed = calls.filter((c) => c.status === CallStatus.COMPLETED).length;
      const failed = calls.filter((c) => c.status === CallStatus.FAILED).length;
      const connRate = attempted > 0 ? Math.round((connected / attempted) * 100) : 0;

      return {
        id: camp.id,
        name: camp.name,
        status: camp.status,
        attempted,
        connected,
        completed,
        failed,
        connectionRate: connRate,
      };
    });

    return {
      kpis: {
        totalAttempts,
        connectedOutbound,
        completedOutbound,
        failedOutbound,
        connectionRate,
        avgDurationSeconds: avgDuration,
      },
      campaignComparisons,
      timeframe: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  /**
   * Campaigns list with complete aggregated operational data.
   */
  static async getCampaignMetrics(filter: AnalyticsFilter) {
    const campaigns = await prisma.communicationCampaign.findMany({
      where: filter.tenantId ? { ownerUser: { tenantId: filter.tenantId } } : {},
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        approvalStatus: true,
        tier: true,
        channels: true,
        recipientCount: true,
        attemptedContactCount: true,
        createdAt: true,
        submittedAt: true,
        approvedAt: true,
      },
    });

    return {
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.approvalStatus,
        tier: c.tier,
        channels: c.channels,
        audienceSize: c.recipientCount,
        attempted: c.attemptedContactCount,
        createdAt: c.createdAt.toISOString(),
        submittedAt: c.submittedAt ? c.submittedAt.toISOString() : null,
        approvedAt: c.approvedAt ? c.approvedAt.toISOString() : null,
      })),
    };
  }
}
