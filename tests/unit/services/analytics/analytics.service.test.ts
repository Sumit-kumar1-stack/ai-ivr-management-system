import { describe, it, expect, vi, beforeEach } from "vitest";
import { CallStatus } from "@prisma/client";
import { AnalyticsService } from "@/services/analytics/analytics.service";

const mocks = vi.hoisted(() => ({
  callCount: vi.fn(),
  callAggregate: vi.fn(),
  callFindMany: vi.fn(),
  campaignFindMany: vi.fn(),
  commCampaignFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    call: {
      count: mocks.callCount,
      aggregate: mocks.callAggregate,
      findMany: mocks.callFindMany,
    },
    campaign: {
      findMany: mocks.campaignFindMany,
    },
    communicationCampaign: {
      findMany: mocks.commCampaignFindMany,
    },
  },
}));

describe("Analytics Service — Final Master Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates Overview KPIs and trends with tenant scoping", async () => {
    mocks.callCount
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(85)  // completed
      .mockResolvedValueOnce(10)  // failed
      .mockResolvedValueOnce(90)  // answered
      .mockResolvedValueOnce(60)  // inbound
      .mockResolvedValueOnce(40)  // outbound
      .mockResolvedValueOnce(70)  // standard
      .mockResolvedValueOnce(30); // premium

    mocks.callAggregate.mockResolvedValue({
      _avg: { duration: 120 },
      _sum: { duration: 12000 },
    });

    mocks.callFindMany.mockResolvedValue([
      {
        id: "call-1",
        status: CallStatus.COMPLETED,
        duration: 120,
        direction: "INBOUND",
        provider: "PLIVO",
        requestedRuntime: "STANDARD",
        createdAt: new Date("2026-08-30T10:00:00Z"),
      },
      {
        id: "call-2",
        status: CallStatus.FAILED,
        duration: 10,
        direction: "OUTBOUND",
        provider: "TWILIO",
        requestedRuntime: "PREMIUM",
        createdAt: new Date("2026-08-30T11:00:00Z"),
      },
    ]);

    const result = await AnalyticsService.getOverviewMetrics({
      timeframe: "7d",
      tenantId: "tenant-alpha",
    });

    expect(result.kpis.totalCalls).toBe(100);
    expect(result.kpis.answerRate).toBe(90);
    expect(result.kpis.completionRate).toBe(85);
    expect(result.kpis.avgDurationSeconds).toBe(120);
    expect(result.kpis.totalDurationSeconds).toBe(12000);
    expect(result.breakdowns.direction.inbound).toBe(60);
    expect(result.breakdowns.direction.outbound).toBe(40);
    expect(result.breakdowns.runtime.standard).toBe(70);
    expect(result.breakdowns.runtime.premium).toBe(30);
    expect(result.trends).toHaveLength(1);
    expect(result.trends[0].date).toBe("2026-08-30");
  });

  it("calculates Inbound Voice metrics and duration buckets", async () => {
    mocks.callCount
      .mockResolvedValueOnce(50) // total inbound
      .mockResolvedValueOnce(45) // answered
      .mockResolvedValueOnce(40) // completed
      .mockResolvedValueOnce(5);  // failed

    mocks.callAggregate.mockResolvedValue({
      _avg: { duration: 75 },
    });

    mocks.callFindMany.mockResolvedValue([
      {
        id: "call-in-1",
        status: CallStatus.COMPLETED,
        duration: 20,
        provider: "PLIVO",
        requestedRuntime: "STANDARD",
        createdAt: new Date(),
      },
      {
        id: "call-in-2",
        status: CallStatus.COMPLETED,
        duration: 150,
        provider: "EXOTEL",
        requestedRuntime: "PREMIUM",
        createdAt: new Date(),
      },
    ]);

    const result = await AnalyticsService.getInboundMetrics({
      timeframe: "30d",
      tenantId: "tenant-alpha",
    });

    expect(result.kpis.totalInbound).toBe(50);
    expect(result.kpis.answerRate).toBe(90);
    expect(result.distributions.byProvider["PLIVO"]).toBe(1);
    expect(result.distributions.byProvider["EXOTEL"]).toBe(1);
    expect(result.distributions.durationBuckets.under30s).toBe(1);
    expect(result.distributions.durationBuckets.under3m).toBe(1);
  });

  it("calculates Outbound Voice metrics and campaign comparisons", async () => {
    mocks.callCount
      .mockResolvedValueOnce(200) // total attempts
      .mockResolvedValueOnce(160) // connected
      .mockResolvedValueOnce(150) // completed
      .mockResolvedValueOnce(30);  // failed

    mocks.callAggregate.mockResolvedValue({
      _avg: { duration: 90 },
    });

    mocks.campaignFindMany.mockResolvedValue([
      {
        id: "camp-1",
        name: "Q3 Survey Campaign",
        status: "RUNNING",
        calls: [
          { status: CallStatus.COMPLETED, duration: 100 },
          { status: CallStatus.ANSWERED, duration: 80 },
          { status: CallStatus.FAILED, duration: 0 },
        ],
      },
    ]);

    const result = await AnalyticsService.getOutboundMetrics({
      timeframe: "today",
      tenantId: "tenant-alpha",
    });

    expect(result.kpis.totalAttempts).toBe(200);
    expect(result.kpis.connectionRate).toBe(80);
    expect(result.campaignComparisons).toHaveLength(1);
    expect(result.campaignComparisons[0].name).toBe("Q3 Survey Campaign");
    expect(result.campaignComparisons[0].attempted).toBe(3);
    expect(result.campaignComparisons[0].connected).toBe(2);
    expect(result.campaignComparisons[0].connectionRate).toBe(67);
  });
});
