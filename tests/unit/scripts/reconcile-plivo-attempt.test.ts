import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  reconcilePlivoAttempt,
  type ReconcileDependencies,
  type ReconcileOptions,
} from "../../../scripts/lib/reconcile-plivo-attempt";

const CAMPAIGN_ID = "cmtece3ej00013z8sq2ql87co";
const RECIPIENT_ID = "cmtece62d00043z8sb5a6zllp";
const ATTEMPT_ID = "cmtei91wn00013z7wvmebv6gy";
const CALL_UUID = "f668ed97-171f-4567-ae7a-79bbf1302ea5";
const RAW_CAUSE = "Error Reaching Answer URL";

function getValidOptions(overrides: Partial<ReconcileOptions> = {}): ReconcileOptions {
  return {
    campaignId: CAMPAIGN_ID,
    attemptId: ATTEMPT_ID,
    callUuid: CALL_UUID,
    execute: false,
    confirmProviderReconciliation: false,
    ...overrides,
  };
}

function getValidAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT_ID,
    campaignId: CAMPAIGN_ID,
    campaignRecipientId: RECIPIENT_ID,
    attemptNumber: 1,
    status: "PROVIDER_ACCEPTED",
    provider: "PLIVO",
    providerRequestId: CALL_UUID,
    providerCallId: null,
    rawProviderStatus: "queued",
    rawProviderCause: null,
    usageSettledAt: null,
    usageProviderAccepted: null,
    usageConnected: null,
    usageDurationSeconds: null,
    campaign: {
      id: CAMPAIGN_ID,
      status: "CANCELLED",
    },
    campaignRecipient: {
      id: RECIPIENT_ID,
      status: "PROCESSING",
      nextAttemptAt: null,
    },
    capacityLease: { id: "lease-1" },
    call: null,
    ...overrides,
  };
}

function getReconciledAttempt() {
  const terminalAt = new Date("2026-08-29T16:18:29.000Z");
  return getValidAttempt({
    status: "FAILED",
    providerCallId: CALL_UUID,
    rawProviderStatus: "failed",
    rawProviderCause: RAW_CAUSE,
    usageSettledAt: new Date("2026-08-29T16:30:00.000Z"),
    usageProviderAccepted: true,
    usageConnected: false,
    usageDurationSeconds: 1,
    campaignRecipient: {
      id: RECIPIENT_ID,
      status: "FAILED",
      nextAttemptAt: null,
    },
    capacityLease: null,
    call: {
      id: "call-id-123",
      providerCallId: CALL_UUID,
      status: "FAILED",
      duration: 1,
      failedAt: terminalAt,
      endedAt: terminalAt,
    },
  });
}

type MockPrisma = {
  communicationOutboundAttempt: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

type MockQueue = {
  getJobs: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
};

describe("Plivo outbound call reconciliation utility", () => {
  let mockPrisma: MockPrisma;
  let mockQueue: MockQueue;
  const processOutboundLifecycle = vi.fn<
    ReconcileDependencies["processOutboundLifecycle"]
  >();
  let reportFn: (lines: string[]) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    reportFn = vi.fn();
    mockPrisma = {
      communicationOutboundAttempt: {
        findUnique: vi.fn(async () => getValidAttempt()),
        findFirst: vi.fn(async () => null),
      },
    };
    mockQueue = {
      getJobs: vi.fn(async () => []),
      add: vi.fn(),
    };
  });

  const dependencies = (): ReconcileDependencies => ({
    prisma: mockPrisma as unknown as ReconcileDependencies["prisma"],
    queue: mockQueue as unknown as ReconcileDependencies["queue"],
    processOutboundLifecycle,
    report: reportFn,
  });

  it("performs zero mutations and returns DRY_RUN mode in dry-run mode", async () => {
    const result = await reconcilePlivoAttempt(getValidOptions(), dependencies());

    expect(result).toEqual({
      mode: "DRY_RUN",
      alreadyReconciled: false,
      attemptId: ATTEMPT_ID,
      statusBefore: "PROVIDER_ACCEPTED",
      statusAfter: undefined,
    });
    expect(processOutboundLifecycle).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it.each([
    ["campaignId", "wrong-campaign", "Campaign ID must be"],
    ["attemptId", "wrong-attempt", "Attempt ID must be"],
    ["callUuid", "wrong-uuid", "Call UUID must be"],
  ])("aborts when %s is incorrect", async (field, value, message) => {
    await expect(
      reconcilePlivoAttempt(getValidOptions({ [field]: value }), dependencies())
    ).rejects.toThrow(message);
  });

  it("aborts when the database attempt belongs to a different campaign", async () => {
    mockPrisma.communicationOutboundAttempt.findUnique.mockResolvedValueOnce(
      getValidAttempt({ campaignId: "wrong-campaign" })
    );
    await expect(reconcilePlivoAttempt(getValidOptions(), dependencies())).rejects.toThrow(
      "does not match expected campaign ID"
    );
  });

  it("aborts when the database attempt has a different recipient", async () => {
    mockPrisma.communicationOutboundAttempt.findUnique.mockResolvedValueOnce(
      getValidAttempt({ campaignRecipientId: "wrong-recipient" })
    );
    await expect(reconcilePlivoAttempt(getValidOptions(), dependencies())).rejects.toThrow(
      `expected ${RECIPIENT_ID}`
    );
  });

  it("aborts when the campaign is not CANCELLED", async () => {
    mockPrisma.communicationOutboundAttempt.findUnique.mockResolvedValueOnce(
      getValidAttempt({ campaign: { id: CAMPAIGN_ID, status: "RUNNING" } })
    );
    await expect(reconcilePlivoAttempt(getValidOptions(), dependencies())).rejects.toThrow(
      "expected CANCELLED"
    );
  });

  it("aborts when attempt 2 already exists", async () => {
    mockPrisma.communicationOutboundAttempt.findFirst.mockResolvedValueOnce({ id: "attempt-2-id" });
    await expect(reconcilePlivoAttempt(getValidOptions(), dependencies())).rejects.toThrow(
      "Outbound attempt 2 already exists"
    );
  });

  it("aborts when a pending recipient job exists", async () => {
    mockQueue.getJobs.mockResolvedValueOnce([
      {
        id: "job-1",
        name: "run-communication-campaign-recipient",
        data: { campaignRecipientId: RECIPIENT_ID },
      },
    ]);
    await expect(reconcilePlivoAttempt(getValidOptions(), dependencies())).rejects.toThrow(
      "Pending recipient job"
    );
  });

  it("uses only read-only queue inspection in dry-run", async () => {
    await reconcilePlivoAttempt(getValidOptions(), dependencies());
    expect(mockQueue.getJobs).toHaveBeenCalledWith([
      "active",
      "wait",
      "delayed",
      "paused",
      "prioritized",
      "waiting-children",
    ]);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("blocks execution when the second confirmation flag is absent", async () => {
    await expect(
      reconcilePlivoAttempt(
        getValidOptions({ execute: true, confirmProviderReconciliation: false }),
        dependencies()
      )
    ).rejects.toThrow("--execute requires --confirm-provider-reconciliation");
    expect(processOutboundLifecycle).not.toHaveBeenCalled();
  });

  it("executes the existing lifecycle once and verifies fully reconciled postflight state", async () => {
    processOutboundLifecycle.mockResolvedValueOnce({
      matched: true,
      ignored: false,
      duplicate: false,
      conflict: false,
      attemptId: ATTEMPT_ID,
      callId: "call-id-123",
      status: "FAILED",
      terminal: true,
    });
    mockPrisma.communicationOutboundAttempt.findUnique
      .mockResolvedValueOnce(getValidAttempt())
      .mockResolvedValueOnce(getReconciledAttempt());

    const result = await reconcilePlivoAttempt(
      getValidOptions({ execute: true, confirmProviderReconciliation: true }),
      dependencies()
    );

    expect(result).toEqual({
      mode: "EXECUTED",
      alreadyReconciled: false,
      attemptId: ATTEMPT_ID,
      statusBefore: "PROVIDER_ACCEPTED",
      statusAfter: "FAILED",
    });
    expect(processOutboundLifecycle).toHaveBeenCalledTimes(1);
    expect(processOutboundLifecycle).toHaveBeenCalledWith({
      attemptId: ATTEMPT_ID,
      providerCallId: CALL_UUID,
      rawStatus: "failed",
      rawCause: RAW_CAUSE,
      duration: 1,
      now: expect.any(Date),
    });
    expect(mockPrisma.communicationOutboundAttempt.findFirst).toHaveBeenCalledTimes(2);
    expect(mockQueue.getJobs).toHaveBeenCalledTimes(2);
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("accepts repeated reconciliation only when all durable evidence is complete", async () => {
    mockPrisma.communicationOutboundAttempt.findUnique.mockResolvedValueOnce(getReconciledAttempt());

    const result = await reconcilePlivoAttempt(
      getValidOptions({ execute: true, confirmProviderReconciliation: true }),
      dependencies()
    );

    expect(result).toEqual({
      mode: "EXECUTED",
      alreadyReconciled: true,
      attemptId: ATTEMPT_ID,
      statusBefore: "FAILED",
      statusAfter: "FAILED",
    });
    expect(processOutboundLifecycle).not.toHaveBeenCalled();
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it("rejects a partially reconciled FAILED attempt instead of silently no-oping", async () => {
    mockPrisma.communicationOutboundAttempt.findUnique.mockResolvedValueOnce(
      getValidAttempt({
        status: "FAILED",
        providerCallId: CALL_UUID,
        usageSettledAt: new Date(),
      })
    );

    await expect(reconcilePlivoAttempt(getValidOptions(), dependencies())).rejects.toThrow(
      "partially reconciled/inconsistent"
    );
  });

  it("aborts when attempt has an unsupported terminal status", async () => {
    mockPrisma.communicationOutboundAttempt.findUnique.mockResolvedValueOnce(
      getValidAttempt({ status: "CANCELED" })
    );
    await expect(reconcilePlivoAttempt(getValidOptions(), dependencies())).rejects.toThrow(
      "expected PROVIDER_ACCEPTED"
    );
  });
});
