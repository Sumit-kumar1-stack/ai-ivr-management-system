import {
  CommunicationChannel,
  CommunicationFallbackPolicy,
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus,
  CommunicationRecipientStatus,
  SubscriptionStatus,
  TenantStatus,
} from "@prisma/client";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  campaignFindFirst: vi.fn(),
  campaignFindUnique: vi.fn(),
  campaignFindUniqueOrThrow: vi.fn(),
  campaignUpdateMany: vi.fn(),
  recipientFindFirst: vi.fn(),
  recipientFindMany: vi.fn(),
  recipientUpdateMany: vi.fn(),
  attemptFindUnique: vi.fn(),
  attemptUpdateMany: vi.fn(),
  attemptUpsert: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  finalize: vi.fn(),
  enqueueRecipient: vi.fn(),
  billing: vi.fn(),
  entitlements: vi.fn(),
  audit: vi.fn(),
  plivoCall: vi.fn(),
  twilioCall: vi.fn(),
  exotelCall: vi.fn(),
  telnyxCall: vi.fn(),
  capacityPolicy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communicationCampaign: {
      findFirst: mocks.campaignFindFirst,
      findUnique: mocks.campaignFindUnique,
      findUniqueOrThrow: mocks.campaignFindUniqueOrThrow,
      updateMany: mocks.campaignUpdateMany,
    },
    communicationCampaignRecipient: {
      findFirst: mocks.recipientFindFirst,
      findMany: mocks.recipientFindMany,
      updateMany: mocks.recipientUpdateMany,
    },
    communicationOutboundAttempt: {
      findUnique: mocks.attemptFindUnique,
      updateMany: mocks.attemptUpdateMany,
      upsert: mocks.attemptUpsert,
    },
  },
}));

vi.mock("@/services/communication/communication-outbound-capacity.service", () => ({
  acquireOutboundCapacity: mocks.acquire,
  releaseOutboundCapacity: mocks.release,
  resolveOutboundCapacityPolicy: mocks.capacityPolicy,
}));

vi.mock("@/services/communication/communication-campaign-finalizer.service", () => ({
  tryFinalizeCommunicationCampaign: mocks.finalize,
}));

vi.mock("@/services/communication/communication-campaign-queue.service", () => ({
  CommunicationCampaignQueueService: {
    enqueueRecipientAttempt: mocks.enqueueRecipient,
  },
}));

vi.mock("@/services/audit/audit-event.service", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/services/billing/tenant-subscription.service", () => ({ resolveTenantBillingContextForTenant: mocks.billing }));
vi.mock("@/services/communication/communication-entitlement.service", () => ({
  assertCommunicationCampaignEntitlements: mocks.entitlements,
  resolveCommunicationVoiceRuntime: vi.fn(() => "CASCADED"),
}));
vi.mock("@/providers/telephony/plivo.provider", () => ({ initiateOutboundCall: mocks.plivoCall }));
vi.mock("@/providers/telephony/twilio.provider", () => ({ initiateOutboundCall: mocks.twilioCall }));
vi.mock("@/providers/telephony/exotel.provider", () => ({ initiateOutboundCall: mocks.exotelCall }));
vi.mock("@/providers/telephony/telnyx.provider", () => ({ initiateOutboundCall: mocks.telnyxCall }));

import {
  executeOutboundCampaignAttempt,
  orchestrateOutboundCampaignLaunch,
  scheduleOutboundRetry,
  SKIPPED_CAMPAIGN_NOT_RUNNABLE,
} from "@/services/communication/communication-outbound-orchestrator.service";

const job = {
  jobVersion: 1,
  tenantId: "tenant-1",
  campaignId: "campaign-1",
  campaignRecipientId: "recipient-1",
  contactId: "contact-1",
  attemptNumber: 1,
  scheduledFor: "2026-08-29T10:00:00.000Z",
  now: new Date("2026-08-29T10:00:00.000Z"),
};

function runnableCampaign(
  status: CommunicationCampaignStatus =
    CommunicationCampaignStatus.RUNNING
) {
  return {
    id: "campaign-1",
    status,
    tier: "STANDARD",
    concurrencyLimit: null,
    outboundProvider: "MOCK",
    ownerUserId: "owner-1",
    maxAttempts: 3,
    timezone: null,
    businessHoursPolicy: null,
    channels: [CommunicationChannel.AI_VOICE],
    smartChanneling: false,
    fallbackPolicy: CommunicationFallbackPolicy.NONE,
    recipientCount: 1,
  };
}

function pendingRecipient(
  status: CommunicationRecipientStatus =
    CommunicationRecipientStatus.PENDING
) {
  return {
    id: "recipient-1",
    externalRecipientId: "contact-1",
    fullName: "Recipient",
    phone: "+15551234567",
    language: "English",
    consentStatus: "OPTED_IN",
    dnc: false,
    suppressed: false,
    timezone: null,
    status,
    lastError: null,
    attemptCount: 0,
    nextAttemptAt: null,
  };
}

function queuedAttempt(
  status: CommunicationOutboundAttemptStatus = CommunicationOutboundAttemptStatus.QUEUED
) {
  return {
    id: "attempt-1",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    campaignRecipientId: "recipient-1",
    attemptNumber: 1,
    status,
  };
}

describe("outbound attempt safety and idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignFindFirst.mockResolvedValue(runnableCampaign());
    mocks.campaignFindUnique.mockResolvedValue({ status: CommunicationCampaignStatus.RUNNING });
    mocks.recipientFindFirst.mockResolvedValue(pendingRecipient());
    mocks.attemptFindUnique.mockResolvedValue(queuedAttempt());
    mocks.recipientUpdateMany.mockResolvedValue({ count: 1 });
    mocks.attemptUpdateMany.mockResolvedValue({ count: 1 });
    mocks.acquire.mockResolvedValue({ acquired: true, reused: false, blockedDimension: null, leaseId: "lease-1" });
    mocks.release.mockResolvedValue(undefined);
    mocks.finalize.mockResolvedValue(undefined);
    mocks.enqueueRecipient.mockResolvedValue({ id: "job-1" });
    mocks.attemptUpsert.mockResolvedValue(queuedAttempt());
    mocks.capacityPolicy.mockReturnValue({
      provider: "PLIVO",
      limits: { campaign: null, tenant: 2, provider: null, global: null },
      effectiveLimit: 2,
    });
    mocks.billing.mockResolvedValue({
      tenantStatus: TenantStatus.ACTIVE,
      subscription: { status: SubscriptionStatus.ACTIVE },
      effectiveCampaignTier: "STANDARD",
      premiumVoiceEnabled: false,
      launchAllowed: true,
    });
    process.env.PLIVO_AUTH_ID = "test-auth-id";
    process.env.PLIVO_AUTH_TOKEN = "test-auth-token";
    process.env.PLIVO_CALLER_ID = "+14155550100";
    process.env.PLIVO_PUBLIC_BASE_URL = "https://voice.example.test";
    process.env.PLIVO_MEDIA_PUBLIC_URL = "wss://media.example.test";
  });

  it.each([
    CommunicationCampaignStatus.PAUSED,
    CommunicationCampaignStatus.CANCELLED,
    CommunicationCampaignStatus.COMPLETED,
    CommunicationCampaignStatus.FAILED,
  ])("skips %s campaigns before capacity or provider execution", async status => {
    mocks.campaignFindFirst.mockResolvedValue(runnableCampaign(status));
    const boundary = vi.fn();
    const result = await executeOutboundCampaignAttempt(job, { providerBoundary: boundary });
    expect(result.reasonCode).toBe(SKIPPED_CAMPAIGN_NOT_RUNNABLE);
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(boundary).not.toHaveBeenCalled();
  });

  it("invokes the fake boundary once and releases capacity on success", async () => {
    const boundary = vi.fn().mockResolvedValue(undefined);
    await executeOutboundCampaignAttempt(job, { providerBoundary: boundary });
    expect(boundary).toHaveBeenCalledTimes(1);
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
    expect(mocks.release).toHaveBeenCalledWith("attempt-1");
  });

  it("releases capacity when the fake provider boundary fails", async () => {
    const boundary = vi.fn().mockRejectedValue(new Error("fake provider failure"));
    await expect(executeOutboundCampaignAttempt(job, { providerBoundary: boundary })).rejects.toThrow("fake provider failure");
    expect(mocks.release).toHaveBeenCalledWith("attempt-1");
    expect(mocks.attemptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: CommunicationOutboundAttemptStatus.FAILED }),
    }));
  });

  it("does not invoke the boundary when the atomic DB claim fails", async () => {
    mocks.attemptUpdateMany.mockRejectedValueOnce(new Error("claim failed"));
    const boundary = vi.fn();
    await expect(executeOutboundCampaignAttempt(job, { providerBoundary: boundary })).rejects.toThrow("claim failed");
    expect(boundary).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });

  it("duplicate delivery cannot claim or invoke the provider twice", async () => {
    let claims = 0;
    mocks.attemptUpdateMany.mockImplementation(async input => {
      if (input.data.status === CommunicationOutboundAttemptStatus.CLAIMED) {
        claims += 1;
        return { count: claims === 1 ? 1 : 0 };
      }
      return { count: 1 };
    });
    const boundary = vi.fn().mockResolvedValue(undefined);
    await executeOutboundCampaignAttempt(job, { providerBoundary: boundary });
    await executeOutboundCampaignAttempt(job, { providerBoundary: boundary });
    expect(boundary).toHaveBeenCalledTimes(1);
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
  });

  it("fails closed at capacity and restores the attempt without invoking the boundary", async () => {
    mocks.acquire.mockResolvedValue({ acquired: false, reused: false, blockedDimension: "tenant", leaseId: null });
    const boundary = vi.fn();
    await expect(executeOutboundCampaignAttempt(job, { providerBoundary: boundary })).rejects.toThrow("tenant concurrency");
    expect(boundary).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("re-checks canonical campaign state immediately before the boundary", async () => {
    mocks.campaignFindUnique.mockResolvedValue({ status: CommunicationCampaignStatus.PAUSED });
    const boundary = vi.fn();
    const result = await executeOutboundCampaignAttempt(job, { providerBoundary: boundary });
    expect(result.reasonCode).toBe(SKIPPED_CAMPAIGN_NOT_RUNNABLE);
    expect(boundary).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("attempt-1");
  });

  it("DNC and opt-out rechecks happen before capacity acquisition", async () => {
    mocks.recipientFindFirst.mockResolvedValue({ ...pendingRecipient(), dnc: true });
    const boundary = vi.fn();
    await executeOutboundCampaignAttempt(job, { providerBoundary: boundary });
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(boundary).not.toHaveBeenCalled();
  });

  it("uses no Plivo, Twilio, Exotel, or Telnyx adapter in E.2", async () => {
    await executeOutboundCampaignAttempt(job, { providerBoundary: vi.fn() });
    expect(mocks.plivoCall).toHaveBeenCalledTimes(0);
    expect(mocks.twilioCall).toHaveBeenCalledTimes(0);
    expect(mocks.exotelCall).toHaveBeenCalledTimes(0);
    expect(mocks.telnyxCall).toHaveBeenCalledTimes(0);
  });

  it("persists provider-requesting before execution and holds capacity after acceptance", async () => {
    const executor = vi.fn().mockResolvedValue({
      accepted: true,
      provider: "PLIVO",
      providerRequestId: "request-1",
      providerCallId: null,
      rawProviderStatus: "queued",
    });

    const result = await executeOutboundCampaignAttempt(job, { outboundExecutor: executor });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(mocks.attemptUpdateMany.mock.calls).toEqual(expect.arrayContaining([
      [expect.objectContaining({ data: expect.objectContaining({ status: CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING }) })],
      [expect.objectContaining({ data: expect.objectContaining({ status: CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED, providerRequestId: "request-1" }) })],
    ]));
    expect(mocks.release).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(false);
    const providerRequest = executor.mock.calls[0][0];
    expect(providerRequest).toEqual(expect.objectContaining({
      attemptId: "attempt-1",
      to: "+15551234567",
      answerUrl: "https://voice.example.test/api/plivo/outbound/answer?attempt=attempt-1",
      statusCallbackUrl: "https://voice.example.test/api/plivo/outbound/status?attempt=attempt-1",
    }));
    expect(providerRequest).not.toHaveProperty("campaign");
    expect(providerRequest).not.toHaveProperty("ivrGraph");
  });

  it("rechecks subscription state immediately before paid execution", async () => {
    mocks.billing.mockResolvedValue({
      tenantStatus: TenantStatus.ACTIVE,
      subscription: { status: SubscriptionStatus.SUSPENDED },
      effectiveCampaignTier: "STANDARD",
      premiumVoiceEnabled: false,
      launchAllowed: false,
    });
    const executor = vi.fn();

    await expect(executeOutboundCampaignAttempt(job, { outboundExecutor: executor }))
      .rejects.toThrow("not active at the provider boundary");

    expect(executor).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("attempt-1");
  });

  it("rechecks campaign entitlements immediately before paid execution", async () => {
    mocks.entitlements.mockImplementationOnce(() => {
      throw new Error("AI Voice is no longer entitled");
    });
    const executor = vi.fn();

    await expect(executeOutboundCampaignAttempt(job, { outboundExecutor: executor }))
      .rejects.toThrow("no longer entitled");

    expect(executor).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("attempt-1");
  });

  it("fails closed when acceptance persistence is ambiguous", async () => {
    mocks.attemptUpdateMany.mockImplementation(async input => ({
      count: input.data.status === CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED ? 0 : 1,
    }));
    const executor = vi.fn().mockResolvedValue({
      accepted: true,
      provider: "PLIVO",
      providerRequestId: "request-ambiguous",
      providerCallId: null,
      rawProviderStatus: "queued",
    });

    await expect(executeOutboundCampaignAttempt(job, { outboundExecutor: executor })).rejects.toThrow("ambiguous");
    expect(executor).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();

    mocks.attemptFindUnique.mockResolvedValue(queuedAttempt(CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING));
    mocks.attemptUpdateMany.mockResolvedValue({ count: 0 });
    await executeOutboundCampaignAttempt(job, { outboundExecutor: executor });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("retains capacity when acceptance persistence throws after the paid boundary", async () => {
    mocks.attemptUpdateMany.mockImplementation(async input => {
      if (input.data.status === CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED) {
        throw new Error("database unavailable after acceptance");
      }
      return { count: 1 };
    });
    const executor = vi.fn().mockResolvedValue({
      accepted: true,
      provider: "PLIVO",
      providerRequestId: "request-crash-window",
      providerCallId: null,
      rawProviderStatus: "queued",
    });

    await expect(executeOutboundCampaignAttempt(job, { outboundExecutor: executor })).rejects.toThrow("database unavailable");
    expect(executor).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("records a confirmed SDK rejection and releases capacity", async () => {
    const executor = vi.fn().mockRejectedValue(new Error("Plivo rejected before acceptance"));
    await expect(executeOutboundCampaignAttempt(job, { outboundExecutor: executor })).rejects.toThrow("Plivo rejected");
    expect(mocks.attemptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: CommunicationOutboundAttemptStatus.PROVIDER_ERROR }),
    }));
    expect(mocks.release).toHaveBeenCalledWith("attempt-1");
  });

  it("recovers a durable provider failure by idempotently scheduling the next attempt", async () => {
    mocks.attemptFindUnique.mockResolvedValue({
      ...queuedAttempt(CommunicationOutboundAttemptStatus.PROVIDER_ERROR),
      contactId: "contact-1",
      completedAt: new Date("2026-08-29T10:00:00.000Z"),
    });
    const executor = vi.fn();
    const result = await executeOutboundCampaignAttempt(job, { outboundExecutor: executor });
    expect(result.reasonCode).toBe("RETRY_PROVIDER_ERROR");
    expect(executor).not.toHaveBeenCalled();
    expect(mocks.enqueueRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 2 }),
      300_000
    );
  });

  it("rechecks DNC after claiming and immediately before paid execution", async () => {
    mocks.recipientFindFirst
      .mockResolvedValueOnce(pendingRecipient())
      .mockResolvedValueOnce({ ...pendingRecipient(CommunicationRecipientStatus.PROCESSING), dnc: true });
    const executor = vi.fn();
    const result = await executeOutboundCampaignAttempt(job, { outboundExecutor: executor });
    expect(result.reasonCode).toBe("DNC_ACTIVE");
    expect(executor).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith("attempt-1");
  });

  it.each([CommunicationCampaignStatus.PAUSED, CommunicationCampaignStatus.CANCELLED])(
    "does not invoke the provider when the campaign becomes %s at the final boundary",
    async status => {
      mocks.campaignFindUnique
        .mockResolvedValueOnce({ status: CommunicationCampaignStatus.RUNNING })
        .mockResolvedValueOnce({ status });
      const executor = vi.fn();
      const result = await executeOutboundCampaignAttempt(job, { outboundExecutor: executor });
      expect(result.reasonCode).toBe(SKIPPED_CAMPAIGN_NOT_RUNNABLE);
      expect(executor).not.toHaveBeenCalled();
      expect(mocks.release).toHaveBeenCalledWith("attempt-1");
    }
  );
});

describe("outbound launch fan-out recovery", () => {
  const now = new Date("2026-08-29T10:00:00.000Z");
  const snapshotRecipient = pendingRecipient();
  const preflightCampaign = {
    id: "campaign-1",
    name: "Campaign",
    status: CommunicationCampaignStatus.RUNNING,
    approvalRequired: false,
    approvalStatus: "APPROVED",
    currentRevision: 1,
    approvedRevision: 1,
    archivedAt: null,
    tier: "STANDARD",
    channels: ["AI_VOICE"],
    smartChanneling: false,
    fallbackPolicy: "NONE",
    ownerUserId: "owner-1",
    timezone: null,
    businessHoursPolicy: null,
    ownerUser: { tenantId: "tenant-1" },
    _count: { recipients: 1 },
  };
  const fanoutCampaign = {
    id: "campaign-1",
    status: CommunicationCampaignStatus.RUNNING,
    ownerUserId: "owner-1",
    maxAttempts: 3,
    timezone: null,
    businessHoursPolicy: null,
    ownerUser: { tenantId: "tenant-1" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignUpdateMany.mockResolvedValue({ count: 1 });
    mocks.campaignFindUnique.mockImplementation(async input =>
      Object.keys(input.select).length === 1
        ? { status: CommunicationCampaignStatus.RUNNING }
        : preflightCampaign
    );
    mocks.campaignFindUniqueOrThrow.mockResolvedValue(fanoutCampaign);
    mocks.recipientFindMany.mockResolvedValue([snapshotRecipient]);
    mocks.attemptUpsert.mockResolvedValue(queuedAttempt());
    mocks.enqueueRecipient.mockResolvedValue({ id: "outbound-call-campaign-1-recipient-1-1" });
    mocks.billing.mockResolvedValue({
      tenantId: "tenant-1",
      tenantStatus: "ACTIVE",
      subscription: { status: "ACTIVE" },
      effectiveCampaignTier: "STANDARD",
    });
    mocks.entitlements.mockReturnValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    mocks.finalize.mockResolvedValue(undefined);
  });

  it("uses the same durable attempt and queue payload when launch delivery repeats", async () => {
    mocks.campaignUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await orchestrateOutboundCampaignLaunch({ campaignId: "campaign-1", tenantId: "tenant-1", requestedByUserId: "operator-1", now });
    await orchestrateOutboundCampaignLaunch({ campaignId: "campaign-1", tenantId: "tenant-1", requestedByUserId: "operator-1", now });

    expect(mocks.attemptUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.attemptUpsert.mock.calls[0][0].where).toEqual(
      mocks.attemptUpsert.mock.calls[1][0].where
    );
    expect(mocks.enqueueRecipient.mock.calls[0][0]).toEqual(
      mocks.enqueueRecipient.mock.calls[1][0]
    );
  });

  it("surfaces Redis enqueue failure while leaving a retriable QUEUED attempt and RUNNING campaign", async () => {
    mocks.enqueueRecipient.mockRejectedValue(new Error("redis unavailable"));
    await expect(orchestrateOutboundCampaignLaunch({
      campaignId: "campaign-1",
      tenantId: "tenant-1",
      requestedByUserId: "operator-1",
      now,
    })).rejects.toThrow("redis unavailable");

    expect(mocks.attemptUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ attemptNumber: 1 }),
    }));
    expect(mocks.campaignUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.recipientUpdateMany).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: CommunicationRecipientStatus.COMPLETED }),
    }));
  });
});

describe("outbound retry hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.campaignFindFirst.mockResolvedValue({ id: "campaign-1", status: CommunicationCampaignStatus.RUNNING, maxAttempts: 3 });
    mocks.recipientFindFirst.mockResolvedValue(pendingRecipient());
    mocks.attemptUpsert.mockResolvedValue({ ...queuedAttempt(), attemptNumber: 2 });
    mocks.recipientUpdateMany.mockResolvedValue({ count: 1 });
    mocks.enqueueRecipient.mockResolvedValue({ id: "retry-job" });
  });

  const retry = {
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    campaignRecipientId: "recipient-1",
    contactId: "contact-1",
    previousAttemptNumber: 1,
    scheduledFor: new Date("2026-08-29T10:05:00.000Z"),
    now: new Date("2026-08-29T10:00:00.000Z"),
  };

  it("uses a deterministic next attempt and is idempotent when requested twice", async () => {
    const first = await scheduleOutboundRetry(retry);
    const second = await scheduleOutboundRetry(retry);
    expect(first.attemptNumber).toBe(2);
    expect(second.attemptNumber).toBe(2);
    expect(mocks.attemptUpsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { campaignRecipientId_attemptNumber: { campaignRecipientId: "recipient-1", attemptNumber: 2 } },
    }));
    expect(mocks.enqueueRecipient).toHaveBeenCalledWith(expect.objectContaining({ attemptNumber: 2 }), 300_000);
  });

  it("does not retry terminal, DNC, opted-out, or exhausted recipients", async () => {
    mocks.recipientFindFirst.mockResolvedValue({ ...pendingRecipient(CommunicationRecipientStatus.COMPLETED) });
    await expect(scheduleOutboundRetry(retry)).resolves.toMatchObject({ scheduled: false, reasonCode: "RECIPIENT_NOT_RETRYABLE" });
    mocks.recipientFindFirst.mockResolvedValue({ ...pendingRecipient(), consentStatus: "OPTED_OUT" });
    await expect(scheduleOutboundRetry(retry)).resolves.toMatchObject({ scheduled: false, reasonCode: "RECIPIENT_NOT_RETRYABLE" });
    mocks.recipientFindFirst.mockResolvedValue(pendingRecipient());
    mocks.campaignFindFirst.mockResolvedValue({ id: "campaign-1", status: CommunicationCampaignStatus.RUNNING, maxAttempts: 1 });
    await expect(scheduleOutboundRetry(retry)).resolves.toMatchObject({ scheduled: false, reasonCode: "MAX_ATTEMPTS_REACHED" });
    expect(mocks.enqueueRecipient).not.toHaveBeenCalled();
  });
});
