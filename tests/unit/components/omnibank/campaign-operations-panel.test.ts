import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  CampaignOperationsView,
  getCampaignRuntimeActions,
  requestCampaignRuntimeAction,
  shouldRefreshOutboundCampaign,
} from "@/components/omnibank/campaign-operations-panel";
import type { CommunicationCampaignDetailsDTO } from "@/types/communication-campaign-details";

const details = {
  campaign: {
    id: "campaign-1",
    name: "Renewals",
    status: "RUNNING",
    tier: "STANDARD",
    channels: ["AI_VOICE"],
    fallbackPolicy: "NONE",
    audienceSourceName: "Customers",
    recipientCount: 10,
    voiceCampaignId: null,
    ivrCampaignId: null,
    runtime: "CASCADED",
    scheduledAt: null,
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:05:00.000Z",
  },
  progress: {
    totalRecipients: 10,
    pending: 1,
    queued: 1,
    requesting: 1,
    ringing: 1,
    answered: 1,
    completed: 3,
    busy: 0,
    noAnswer: 1,
    rejected: 0,
    invalidNumber: 0,
    providerError: 0,
    failed: 1,
    canceled: 0,
    retryScheduled: 1,
    transferred: 1,
    callbackRequested: 1,
    callbackCompleted: 0,
    terminalCount: 5,
    processedCount: 5,
    remainingCount: 5,
    progressPercent: 50,
  },
  attempts: [{
    id: "attempt-1",
    recipientId: "recipient-1",
    recipient: "••••••0101",
    attemptNumber: 2,
    state: "NO_ANSWER",
    disposition: "CALLBACK_REQUESTED",
    retryState: "SCHEDULED",
    nextRetryAt: "2026-08-29T11:00:00.000Z",
    queuedAt: "2026-08-29T10:00:00.000Z",
    ringingAt: null,
    answeredAt: null,
    completedAt: "2026-08-29T10:05:00.000Z",
    transferred: true,
    callbackRequested: true,
    callbackCompleted: false,
    updatedAt: "2026-08-29T10:05:00.000Z",
  }],
  attemptPagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
  funnel: { sent: 1, delivered: 1, opened: 0, converted: 0 },
  secondaryMetrics: { dropped: 0, bounced: 0, unsubscribed: 0, averageTimeToOpenMinutes: null },
  channelMix: {
    SMS: { attempted: 0, dispatched: 0, delivered: 0, read: 0, failed: 0, deliveryRate: 0 },
    WHATSAPP: { attempted: 0, dispatched: 0, delivered: 0, read: 0, failed: 0, deliveryRate: 0 },
    AI_VOICE: { attempted: 1, dispatched: 1, answered: 1, completed: 0, failed: 0, answerRate: 100, averageDurationSeconds: 20 },
    IVR: { attempted: 0, dispatched: 0, answered: 0, completed: 0, failed: 0, answerRate: 0, averageDurationSeconds: null },
  },
  recipients: [],
  pagination: { page: 1, pageSize: 25, total: 10, totalPages: 1 },
  generatedAt: "2026-08-29T10:05:00.000Z",
} satisfies CommunicationCampaignDetailsDTO;

describe("campaign operations UI", () => {
  it("renders progress, lifecycle, retry, transfer, and callback visibility", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CampaignOperationsView, {
        data: details,
        actions: ["pause", "cancel"],
        mutating: null,
        error: null,
        onAction: () => {},
        onRefresh: () => {},
      })
    );
    expect(markup).toContain("50%");
    expect(markup).toContain("Processed / Total");
    expect(markup).toContain("No Answer");
    expect(markup).toContain("Scheduled · #2");
    expect(markup).toContain("Transferred");
    expect(markup).toContain("Callback Requested");
    expect(markup).toContain("Pause");
    expect(markup).toContain("Cancel");
  });

  it("maps lifecycle actions by permission and state", () => {
    expect(getCampaignRuntimeActions("RUNNING", true)).toEqual(["pause", "cancel"]);
    expect(getCampaignRuntimeActions("PAUSED", true)).toEqual(["resume", "cancel"]);
    expect(getCampaignRuntimeActions("COMPLETED", true)).toEqual([]);
    expect(getCampaignRuntimeActions("RUNNING", false)).toEqual([]);
  });

  it("requires cancel confirmation and uses the canonical lifecycle route", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    await requestCampaignRuntimeAction("campaign-1", "cancel", fetcher, () => false);
    expect(fetcher).not.toHaveBeenCalled();
    await requestCampaignRuntimeAction("campaign-1", "cancel", fetcher, () => true);
    expect(fetcher).toHaveBeenCalledWith("/api/communication/campaigns/campaign-1/cancel", { method: "POST" });
  });

  it("refreshes only matching tenant/campaign events", () => {
    const payload = { tenantId: "tenant-1", campaignId: "campaign-1", attemptId: "attempt-1" };
    expect(shouldRefreshOutboundCampaign("outbound.attempt.updated", payload, "campaign-1", "tenant-1")).toBe(true);
    expect(shouldRefreshOutboundCampaign("outbound.attempt.updated", payload, "campaign-2", "tenant-1")).toBe(false);
    expect(shouldRefreshOutboundCampaign("outbound.attempt.updated", payload, "campaign-1", "tenant-2")).toBe(false);
    expect(shouldRefreshOutboundCampaign("call.updated", payload, "campaign-1", "tenant-1")).toBe(false);
  });
});
