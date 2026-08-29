import {
  CallStatus,
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus as Status,
  CommunicationRecipientStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attemptFind: vi.fn(),
  attemptFindFirst: vi.fn(),
  attemptUpdate: vi.fn(),
  callUpsert: vi.fn(),
  callUpdate: vi.fn(),
  recipientUpdate: vi.fn(),
  release: vi.fn(),
  scheduleRetry: vi.fn(),
  finalize: vi.fn(),
  audit: vi.fn(),
  publish: vi.fn(),
  outboundEmit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communicationOutboundAttempt: {
      findUnique: mocks.attemptFind,
      findFirst: mocks.attemptFindFirst,
      updateMany: mocks.attemptUpdate,
    },
    call: { upsert: mocks.callUpsert, updateMany: mocks.callUpdate },
    communicationCampaignRecipient: { updateMany: mocks.recipientUpdate },
  },
}));
vi.mock("@/services/communication/communication-outbound-capacity.service", () => ({
  releaseOutboundCapacity: mocks.release,
}));
vi.mock("@/services/communication/communication-outbound-orchestrator.service", () => ({
  scheduleOutboundRetry: mocks.scheduleRetry,
}));
vi.mock("@/services/communication/communication-campaign-finalizer.service", () => ({
  tryFinalizeCommunicationCampaign: mocks.finalize,
}));
vi.mock("@/services/audit/audit-event.service", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/core/events", () => ({
  AppEvent: {
    CALL_RINGING: "call.ringing",
    CALL_ANSWERED: "call.answered",
    CALL_COMPLETED: "call.completed",
    CALL_FAILED: "call.failed",
    CALL_TERMINATED: "call.terminated",
  },
  EventPublisher: { publish: mocks.publish },
}));
vi.mock("@/services/communication/communication-outbound-events.service", () => ({
  OUTBOUND_REALTIME_EVENTS: {
    ATTEMPT_UPDATED: "outbound.attempt.updated",
    DISPOSITION_UPDATED: "outbound.disposition.updated",
    PROGRESS_UPDATED: "campaign.progress.updated",
  },
  publishOutboundEvent: mocks.outboundEmit,
}));

import {
  normalizePlivoOutboundStatus,
  processOutboundPlivoLifecycle,
} from "@/services/communication/communication-outbound-lifecycle.service";

function attempt(status: Status, providerCallId: string | null = "call-uuid-1") {
  return {
    id: "attempt-1",
    tenantId: "tenant-1",
    campaignId: "campaign-1",
    campaignRecipientId: "recipient-1",
    contactId: "contact-1",
    attemptNumber: 1,
    status,
    provider: "PLIVO",
    providerCallId,
    requestedRuntime: "CASCADED",
    effectiveRuntime: "CASCADED",
    providerAcceptedAt: new Date("2026-08-29T10:00:00.000Z"),
    answeredAt: status === Status.ANSWERED ? new Date("2026-08-29T10:01:00.000Z") : null,
    campaign: {
      id: "campaign-1",
      status: CommunicationCampaignStatus.RUNNING as CommunicationCampaignStatus,
      maxAttempts: 3,
      businessHoursPolicy: null,
      ivrFlowVersionId: "version-1",
    },
    campaignRecipient: {
      id: "recipient-1",
      phone: "+14155550101",
      language: "English",
      status: CommunicationRecipientStatus.PROCESSING,
      consentStatus: "OPTED_IN",
      dnc: false,
      suppressed: false,
    },
    call: null,
  };
}

describe("Communication outbound signed-callback lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PLIVO_AUTH_ID = "test-auth-id";
    process.env.PLIVO_AUTH_TOKEN = "test-auth-token";
    process.env.PLIVO_CALLER_ID = "+14155550100";
    process.env.PLIVO_PUBLIC_BASE_URL = "https://voice.example.test";
    mocks.attemptUpdate.mockResolvedValue({ count: 1 });
    mocks.attemptFindFirst.mockResolvedValue(null);
    mocks.callUpsert.mockResolvedValue({ id: "call-1" });
    mocks.callUpdate.mockResolvedValue({ count: 1 });
    mocks.recipientUpdate.mockResolvedValue({ count: 1 });
    mocks.release.mockResolvedValue(undefined);
    mocks.publish.mockResolvedValue(true);
    mocks.scheduleRetry.mockResolvedValue({ scheduled: true, attemptNumber: 2, reasonCode: "RETRY_SCHEDULED" });
  });

  it.each([
    ["completed", null, Status.COMPLETED],
    ["busy", null, Status.BUSY],
    ["no-answer", null, Status.NO_ANSWER],
    ["rejected", null, Status.REJECTED],
    ["failed", "invalid number", Status.INVALID_NUMBER],
    ["provider-error", null, Status.PROVIDER_ERROR],
    ["provider-mystery", null, Status.FAILED],
  ])("maps provider status %s to canonical %s", (rawStatus, cause, expected) => {
    expect(normalizePlivoOutboundStatus(rawStatus, cause)).toBe(expected);
  });

  it("reconciles an ambiguous provider request through the exact attempt", async () => {
    mocks.attemptFind.mockResolvedValue(attempt(Status.PROVIDER_REQUESTING, null));
    const result = await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "ringing",
    });
    expect(result).toEqual(expect.objectContaining({ matched: true, conflict: false, status: Status.RINGING }));
    expect(mocks.attemptUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ providerCallId: null }),
      data: { providerCallId: "call-uuid-1" },
    }));
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.publish).toHaveBeenCalledWith("call.ringing", {
      callId: "call-1",
      timestamp: expect.any(Number),
    });
  });

  it("rejects a CallUUID bound to a different attempt without mutation", async () => {
    mocks.attemptFind.mockResolvedValue(attempt(Status.PROVIDER_ACCEPTED, "different-call-uuid"));
    const result = await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "ringing",
    });
    expect(result.conflict).toBe(true);
    expect(mocks.callUpsert).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("rejects a provider UUID already owned by another attempt", async () => {
    mocks.attemptFind.mockResolvedValue(attempt(Status.PROVIDER_ACCEPTED, null));
    mocks.attemptFindFirst.mockResolvedValue({ id: "attempt-2" });
    const result = await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "ringing",
    });
    expect(result.conflict).toBe(true);
    expect(mocks.attemptUpdate).not.toHaveBeenCalled();
    expect(mocks.callUpsert).not.toHaveBeenCalled();
  });

  it("keeps capacity during active states and releases it on terminal completion", async () => {
    mocks.attemptFind.mockResolvedValueOnce(attempt(Status.PROVIDER_ACCEPTED));
    await processOutboundPlivoLifecycle({ attemptId: "attempt-1", providerCallId: "call-uuid-1", rawStatus: "answered" });
    expect(mocks.release).not.toHaveBeenCalled();

    mocks.attemptFind.mockResolvedValueOnce(attempt(Status.ANSWERED));
    await processOutboundPlivoLifecycle({ attemptId: "attempt-1", providerCallId: "call-uuid-1", rawStatus: "completed" });
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.recipientUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: CommunicationRecipientStatus.COMPLETED }),
    }));
    expect(mocks.attemptUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "attempt-1",
        tenantId: "tenant-1",
        campaignId: "campaign-1",
        usageSettledAt: null,
      }),
      data: expect.objectContaining({
        usageProviderAccepted: true,
        usageConnected: true,
      }),
    }));
  });

  it("makes a duplicate terminal callback logically idempotent", async () => {
    mocks.attemptFind.mockResolvedValue(attempt(Status.COMPLETED));
    mocks.attemptUpdate.mockResolvedValue({ count: 0 });
    const result = await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "completed",
    });
    expect(result.duplicate).toBe(true);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(mocks.outboundEmit).not.toHaveBeenCalled();
    expect(mocks.attemptUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ usageSettledAt: null }),
    }));
    expect(mocks.audit).not.toHaveBeenCalledWith(expect.objectContaining({
      action: "OUTBOUND_USAGE_SETTLED",
    }));
  });

  it("discards a stale transition when another callback wins the atomic update", async () => {
    mocks.attemptFind
      .mockResolvedValueOnce(attempt(Status.ANSWERED))
      .mockResolvedValueOnce({ status: Status.COMPLETED });
    mocks.attemptUpdate.mockResolvedValueOnce({ count: 0 });

    const result = await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "completed",
    });

    expect(result).toEqual(expect.objectContaining({
      ignored: true,
      duplicate: true,
      status: Status.COMPLETED,
      terminal: true,
    }));
    expect(mocks.callUpdate).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.outboundEmit).not.toHaveBeenCalled();
  });

  it("ignores an out-of-order regression", async () => {
    mocks.attemptFind.mockResolvedValue(attempt(Status.ANSWERED));
    const result = await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "ringing",
    });
    expect(result).toEqual(expect.objectContaining({ ignored: true, duplicate: false, status: Status.ANSWERED }));
    expect(mocks.release).not.toHaveBeenCalled();
  });


  it("creates a non-terminal canonical Call baseline before a first terminal callback", async () => {
    const snapshot = attempt(Status.PROVIDER_ACCEPTED);
    snapshot.campaign.status = CommunicationCampaignStatus.CANCELLED;
    mocks.attemptFind.mockResolvedValue(snapshot);
    const now = new Date("2026-08-29T16:18:29.000Z");

    const result = await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "failed",
      rawCause: "Error Reaching Answer URL",
      duration: 1,
      now,
    });

    expect(result).toEqual(expect.objectContaining({
      matched: true,
      status: Status.FAILED,
      terminal: true,
    }));
    expect(mocks.callUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: CallStatus.FAILED,
        duration: 1,
        failedAt: now,
        endedAt: now,
      }),
    }));
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleRetry).not.toHaveBeenCalled();
    expect(mocks.recipientUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: CommunicationRecipientStatus.FAILED,
        nextAttemptAt: null,
      }),
    }));
  });

  it("schedules one bounded retry for a retryable terminal outcome", async () => {
    mocks.attemptFind.mockResolvedValue(attempt(Status.ANSWERED));
    await processOutboundPlivoLifecycle({
      attemptId: "attempt-1",
      providerCallId: "call-uuid-1",
      rawStatus: "busy",
      now: new Date("2026-08-31T10:00:00.000Z"),
    });
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleRetry).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleRetry).toHaveBeenCalledWith(expect.objectContaining({ previousAttemptNumber: 1 }));
  });
});
