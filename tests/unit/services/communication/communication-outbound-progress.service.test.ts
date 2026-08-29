import {
  CallbackRequestStatus,
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus as Status,
  CommunicationRecipientStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignFind: vi.fn(),
  eventFind: vi.fn(),
  callbackFind: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communicationCampaign: { findUnique: mocks.campaignFind },
    callEvent: { findMany: mocks.eventFind },
    callbackRequest: { findMany: mocks.callbackFind },
  },
}));

import {
  getCommunicationCampaignOutboundOperations,
  hasAuthoritativeTransferEvidence,
  mapOutboundAttemptDisposition,
} from "@/services/communication/communication-outbound-progress.service";

const now = new Date("2026-08-29T10:00:00.000Z");
const activeStatuses: Status[] = [
  Status.QUEUED,
  Status.PROVIDER_REQUESTING,
  Status.RINGING,
  Status.ANSWERED,
];

function attempt(status: Status, id: string, attemptNumber = 1) {
  return {
    id: `attempt-${id}`,
    attemptNumber,
    status,
    ringingAt: status === Status.RINGING ? now : null,
    answeredAt: status === Status.ANSWERED || status === Status.COMPLETED ? now : null,
    completedAt: activeStatuses.includes(status) ? null : now,
    createdAt: now,
    updatedAt: new Date(now.getTime() + attemptNumber),
    call: { id: `call-${id}` },
  };
}

function recipient(
  id: string,
  status: Status | null,
  options: { recipientStatus?: CommunicationRecipientStatus; nextAttemptAt?: Date | null; attemptNumber?: number } = {}
) {
  return {
    id: `recipient-${id}`,
    fullName: null,
    externalRecipientId: `customer-${id}`,
    phone: `+1415555${id.padStart(4, "0")}`,
    status: options.recipientStatus ?? (status && activeStatuses.includes(status)
      ? CommunicationRecipientStatus.PROCESSING
      : CommunicationRecipientStatus.FAILED),
    attemptCount: options.attemptNumber ?? (status ? 1 : 0),
    nextAttemptAt: options.nextAttemptAt ?? null,
    outboundAttempts: status ? [attempt(status, id, options.attemptNumber)] : [],
  };
}

describe("canonical outbound operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventFind.mockResolvedValue([
      { callId: "call-complete", payload: { stage: "REQUESTED" } },
      { callId: "call-transfer", payload: { stage: "CONNECTED" } },
    ]);
    mocks.callbackFind.mockResolvedValue([
      { callId: "call-callback", originalCallId: "call-callback", status: CallbackRequestStatus.SCHEDULED },
      { callId: "call-callback-done", originalCallId: "call-callback-done", status: CallbackRequestStatus.COMPLETED },
    ]);
  });

  it.each([
    [Status.QUEUED, "QUEUED"],
    [Status.CLAIMED, "QUEUED"],
    [Status.PROVIDER_REQUESTING, "REQUESTING"],
    [Status.PROVIDER_ACCEPTED, "QUEUED"],
    [Status.RINGING, "RINGING"],
    [Status.ANSWERED, "ANSWERED"],
    [Status.COMPLETED, "COMPLETED"],
    [Status.BUSY, "BUSY"],
    [Status.NO_ANSWER, "NO_ANSWER"],
    [Status.REJECTED, "REJECTED"],
    [Status.INVALID_NUMBER, "INVALID_NUMBER"],
    [Status.PROVIDER_ERROR, "PROVIDER_ERROR"],
    [Status.FAILED, "FAILED"],
    [Status.CANCELED, "CANCELED"],
    [Status.SKIPPED, null],
  ])("maps %s to provider-neutral %s", (status, expected) => {
    expect(mapOutboundAttemptDisposition(status)).toBe(expected);
  });

  it("requires authoritative bridge evidence before TRANSFERRED", () => {
    expect(hasAuthoritativeTransferEvidence({ stage: "REQUESTED" })).toBe(false);
    expect(hasAuthoritativeTransferEvidence({ stage: "CONNECTED" })).toBe(true);
    expect(hasAuthoritativeTransferEvidence({ transferStatus: "COMPLETED" })).toBe(true);
  });

  it("aggregates recipient progress without callback inflation and keeps retries/callback work outstanding", async () => {
    const recipients = [
      recipient("pending", null, { recipientStatus: CommunicationRecipientStatus.PENDING }),
      recipient("queued", Status.QUEUED),
      recipient("requesting", Status.PROVIDER_REQUESTING),
      recipient("ringing", Status.RINGING),
      recipient("answered", Status.ANSWERED),
      recipient("complete", Status.COMPLETED, { recipientStatus: CommunicationRecipientStatus.COMPLETED }),
      recipient("transfer", Status.COMPLETED, { recipientStatus: CommunicationRecipientStatus.COMPLETED }),
      recipient("busy", Status.BUSY, { recipientStatus: CommunicationRecipientStatus.PENDING, nextAttemptAt: new Date("2026-08-29T11:00:00.000Z") }),
      recipient("noanswer", Status.NO_ANSWER),
      recipient("rejected", Status.REJECTED),
      recipient("invalid", Status.INVALID_NUMBER),
      recipient("provider", Status.PROVIDER_ERROR),
      recipient("failed", Status.FAILED, { attemptNumber: 3 }),
      recipient("canceled", Status.CANCELED),
      recipient("callback", Status.COMPLETED, { recipientStatus: CommunicationRecipientStatus.COMPLETED }),
      recipient("callback-done", Status.COMPLETED, { recipientStatus: CommunicationRecipientStatus.COMPLETED }),
    ];
    mocks.campaignFind.mockResolvedValue({
      id: "campaign-1",
      status: CommunicationCampaignStatus.RUNNING,
      maxAttempts: 3,
      recipients,
    });

    const result = await getCommunicationCampaignOutboundOperations("campaign-1", { pageSize: 100 });

    expect(result.progress).toMatchObject({
      totalRecipients: 16,
      pending: 1,
      queued: 1,
      requesting: 1,
      ringing: 1,
      answered: 1,
      completed: 4,
      busy: 1,
      noAnswer: 1,
      rejected: 1,
      invalidNumber: 1,
      providerError: 1,
      failed: 1,
      canceled: 1,
      retryScheduled: 1,
      transferred: 1,
      callbackRequested: 2,
      callbackCompleted: 1,
      remainingCount: 7,
      processedCount: 9,
      terminalCount: 9,
      progressPercent: 56,
    });
    expect(result.attempts.find(value => value.id === "attempt-transfer")?.disposition).toBe("TRANSFERRED");
    expect(result.attempts.find(value => value.id === "attempt-callback")?.disposition).toBe("CALLBACK_REQUESTED");
    expect(result.attempts.find(value => value.id === "attempt-callback-done")?.disposition).toBe("CALLBACK_COMPLETED");
    expect(result.attempts.find(value => value.id === "attempt-busy")?.retryState).toBe("SCHEDULED");
    expect(result.attempts.find(value => value.id === "attempt-failed")?.retryState).toBe("EXHAUSTED");
  });

  it("is zero-recipient safe", async () => {
    mocks.campaignFind.mockResolvedValue({
      id: "campaign-empty",
      status: CommunicationCampaignStatus.RUNNING,
      maxAttempts: 3,
      recipients: [],
    });
    const result = await getCommunicationCampaignOutboundOperations("campaign-empty");
    expect(result.progress).toMatchObject({ totalRecipients: 0, processedCount: 0, remainingCount: 0, progressPercent: 0 });
  });

  it("treats canceled recipients as having no runnable work", async () => {
    mocks.campaignFind.mockResolvedValue({
      id: "campaign-canceled",
      status: CommunicationCampaignStatus.CANCELLED,
      maxAttempts: 3,
      recipients: [recipient("pending", null, { recipientStatus: CommunicationRecipientStatus.PENDING })],
    });
    const result = await getCommunicationCampaignOutboundOperations("campaign-canceled");
    expect(result.progress).toMatchObject({ remainingCount: 0, processedCount: 1, progressPercent: 100 });
  });
});
