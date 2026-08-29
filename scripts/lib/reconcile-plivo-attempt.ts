import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";

import type {
  OutboundPlivoLifecycleInput,
  OutboundPlivoLifecycleResult,
} from "@/services/communication/communication-outbound-lifecycle.service";

export interface ReconcileOptions {
  campaignId: string;
  attemptId: string;
  callUuid: string;
  execute: boolean;
  confirmProviderReconciliation: boolean;
}

type ProcessOutboundLifecycle = (
  input: OutboundPlivoLifecycleInput
) => Promise<OutboundPlivoLifecycleResult>;

export interface ReconcileDependencies {
  prisma: PrismaClient;
  queue: Queue;
  processOutboundLifecycle: ProcessOutboundLifecycle;
  report: (lines: string[]) => void;
  now?: Date;
}

export interface ReconcileResult {
  mode: "DRY_RUN" | "EXECUTED";
  alreadyReconciled: boolean;
  attemptId?: string;
  statusBefore?: string;
  statusAfter?: string;
}

const EXPECTED_CAMPAIGN_ID = "cmtece3ej00013z8sq2ql87co";
const EXPECTED_RECIPIENT_ID = "cmtece62d00043z8sb5a6zllp";
const EXPECTED_ATTEMPT_ID = "cmtei91wn00013z7wvmebv6gy";
const EXPECTED_CALL_UUID = "f668ed97-171f-4567-ae7a-79bbf1302ea5";
const EXPECTED_RAW_STATUS = "failed";
const EXPECTED_RAW_CAUSE = "Error Reaching Answer URL";
const EXPECTED_DURATION_SECONDS = 1;
const PENDING_JOB_STATES = [
  "active",
  "wait",
  "delayed",
  "paused",
  "prioritized",
  "waiting-children",
] as const;

function fail(message: string): never {
  throw new Error(`Preflight failed: ${message}`);
}

async function assertNoAttemptTwo(
  prisma: PrismaClient,
  campaignRecipientId: string
): Promise<void> {
  const attempt2 = await prisma.communicationOutboundAttempt.findFirst({
    where: {
      campaignRecipientId,
      attemptNumber: 2,
    },
    select: { id: true },
  });

  if (attempt2) {
    fail(`Outbound attempt 2 already exists with ID ${attempt2.id}`);
  }
}

async function assertNoPendingRecipientJob(
  queue: Queue,
  campaignRecipientId: string
): Promise<void> {
  const jobs = await queue.getJobs([...PENDING_JOB_STATES]);
  const matchingJob = jobs.find(job => {
    const data = job.data as Record<string, unknown>;
    return (
      job.name === "run-communication-campaign-recipient" &&
      data.campaignRecipientId === campaignRecipientId
    );
  });

  if (matchingJob) {
    fail(`Pending recipient job ${matchingJob.id ?? "<unknown>"} exists in queue`);
  }
}

function assertAlreadyReconciledEvidence(
  attempt: {
    providerCallId: string | null;
    rawProviderStatus: string | null;
    rawProviderCause: string | null;
    usageSettledAt: Date | null;
    usageProviderAccepted: boolean | null;
    usageConnected: boolean | null;
    usageDurationSeconds: number | null;
    capacityLease: { id: string } | null;
    campaignRecipient: { status: string; nextAttemptAt: Date | null };
    call: {
      id: string;
      providerCallId: string | null;
      status: string;
      duration: number | null;
      failedAt: Date | null;
      endedAt: Date | null;
    } | null;
  },
  callUuid: string
): void {
  const problems: string[] = [];

  if (attempt.providerCallId !== callUuid) problems.push("providerCallId mismatch");
  if (attempt.rawProviderStatus !== EXPECTED_RAW_STATUS) problems.push("rawProviderStatus mismatch");
  if (attempt.rawProviderCause !== EXPECTED_RAW_CAUSE) problems.push("rawProviderCause mismatch");
  if (!attempt.usageSettledAt) problems.push("usage is not settled");
  if (attempt.usageProviderAccepted !== true) problems.push("usageProviderAccepted is not true");
  if (attempt.usageConnected !== false) problems.push("usageConnected is not false");
  if (attempt.usageDurationSeconds !== EXPECTED_DURATION_SECONDS) problems.push("usage duration is not 1 second");
  if (attempt.capacityLease) problems.push(`capacity lease ${attempt.capacityLease.id} still exists`);
  if (attempt.campaignRecipient.status !== "FAILED") problems.push("recipient is not FAILED");
  if (attempt.campaignRecipient.nextAttemptAt !== null) problems.push("recipient still has nextAttemptAt");
  if (!attempt.call) problems.push("canonical Call row is missing");
  if (attempt.call && attempt.call.providerCallId !== callUuid) problems.push("Call providerCallId mismatch");
  if (attempt.call && attempt.call.status !== "FAILED") problems.push("Call is not FAILED");
  if (attempt.call && attempt.call.duration !== EXPECTED_DURATION_SECONDS) problems.push("Call duration is not 1 second");
  if (attempt.call && !attempt.call.failedAt) problems.push("Call failedAt is missing");
  if (attempt.call && !attempt.call.endedAt) problems.push("Call endedAt is missing");

  if (problems.length > 0) {
    fail(`Attempt is partially reconciled/inconsistent: ${problems.join("; ")}`);
  }
}

export async function reconcilePlivoAttempt(
  options: ReconcileOptions,
  dependencies: ReconcileDependencies
): Promise<ReconcileResult> {
  const { prisma, queue, report, processOutboundLifecycle } = dependencies;
  const currentNow = dependencies.now ?? new Date();

  if (options.campaignId !== EXPECTED_CAMPAIGN_ID) {
    fail(`Campaign ID must be ${EXPECTED_CAMPAIGN_ID}, received ${options.campaignId}`);
  }
  if (options.attemptId !== EXPECTED_ATTEMPT_ID) {
    fail(`Attempt ID must be ${EXPECTED_ATTEMPT_ID}, received ${options.attemptId}`);
  }
  if (options.callUuid !== EXPECTED_CALL_UUID) {
    fail(`Call UUID must be ${EXPECTED_CALL_UUID}, received ${options.callUuid}`);
  }

  const attempt = await prisma.communicationOutboundAttempt.findUnique({
    where: { id: options.attemptId },
    include: {
      campaign: {
        select: {
          id: true,
          status: true,
        },
      },
      campaignRecipient: {
        select: {
          id: true,
          status: true,
          nextAttemptAt: true,
        },
      },
      capacityLease: {
        select: { id: true },
      },
      call: {
        select: {
          id: true,
          providerCallId: true,
          status: true,
          duration: true,
          failedAt: true,
          endedAt: true,
        },
      },
    },
  });

  if (!attempt) {
    fail(`Attempt ${options.attemptId} does not exist`);
  }
  if (attempt.campaignId !== EXPECTED_CAMPAIGN_ID) {
    fail(`Attempt's campaignId ${attempt.campaignId} does not match expected campaign ID`);
  }
  if (attempt.campaign.status !== "CANCELLED") {
    fail(`Campaign is in ${attempt.campaign.status} status, expected CANCELLED`);
  }
  if (attempt.campaignRecipientId !== EXPECTED_RECIPIENT_ID) {
    fail(`Recipient ID is ${attempt.campaignRecipientId}, expected ${EXPECTED_RECIPIENT_ID}`);
  }
  if (attempt.attemptNumber !== 1) {
    fail(`Attempt number is ${attempt.attemptNumber}, expected 1`);
  }
  if (attempt.provider !== "PLIVO") {
    fail(`Provider is ${attempt.provider ?? "null"}, expected PLIVO`);
  }
  if (attempt.providerRequestId !== options.callUuid) {
    fail(`Attempt providerRequestId ${attempt.providerRequestId ?? "null"} does not match call UUID ${options.callUuid}`);
  }
  if (attempt.providerCallId !== null && attempt.providerCallId !== options.callUuid) {
    fail(`Attempt providerCallId ${attempt.providerCallId} is already set and does not match call UUID ${options.callUuid}`);
  }

  // These safety checks apply to both first execution and the idempotent no-op path.
  await assertNoAttemptTwo(prisma, attempt.campaignRecipientId);
  await assertNoPendingRecipientJob(queue, attempt.campaignRecipientId);

  if (attempt.status !== "PROVIDER_ACCEPTED") {
    if (attempt.status === "FAILED") {
      assertAlreadyReconciledEvidence(attempt, options.callUuid);
      report([
        "--- Preflight Success (Already Reconciled) ---",
        `Campaign ID: ${attempt.campaignId} (CANCELLED)`,
        `Recipient ID: ${attempt.campaignRecipientId} (FAILED)`,
        `Attempt ID: ${attempt.id} (FAILED)`,
        `Provider Call UUID: ${attempt.providerCallId}`,
        `Usage Settled At: ${attempt.usageSettledAt!.toISOString()}`,
        "Capacity lease: NONE",
        "Pending retry jobs: NONE",
        "Attempt 2: NONE",
        "Status: Fully reconciled already (safe no-op).",
      ]);
      return {
        mode: options.execute ? "EXECUTED" : "DRY_RUN",
        alreadyReconciled: true,
        attemptId: attempt.id,
        statusBefore: attempt.status,
        statusAfter: attempt.status,
      };
    }

    fail(`Attempt status is ${attempt.status}, expected PROVIDER_ACCEPTED`);
  }

  report([
    "--- Preflight Success ---",
    `Mode: ${options.execute ? "EXECUTE" : "DRY_RUN"}`,
    `Campaign ID: ${attempt.campaignId} (CANCELLED)`,
    `Recipient ID: ${attempt.campaignRecipientId} (${attempt.campaignRecipient.status})`,
    `Attempt ID: ${attempt.id} (PROVIDER_ACCEPTED)`,
    `Provider Call UUID: ${options.callUuid}`,
    `Attempt Number: ${attempt.attemptNumber}`,
    `Provider: ${attempt.provider}`,
    `Usage settled: ${attempt.usageSettledAt ? "YES" : "NO"}`,
    `Capacity lease: ${attempt.capacityLease ? "PRESENT" : "NONE"}`,
    "Pending retry jobs: NONE",
    "Attempt 2: NONE",
    "Would bind providerCallId, terminalize attempt/Call as FAILED, settle attempt usage once, release capacity, and mark recipient FAILED.",
    "Would NOT create a provider call, enqueue a retry, create attempt 2, or resume the campaign.",
  ]);

  if (!options.execute) {
    return {
      mode: "DRY_RUN",
      alreadyReconciled: false,
      attemptId: attempt.id,
      statusBefore: attempt.status,
      statusAfter: undefined,
    };
  }

  if (!options.confirmProviderReconciliation) {
    throw new Error("Execution blocked: --execute requires --confirm-provider-reconciliation");
  }

  const result = await processOutboundLifecycle({
    attemptId: attempt.id,
    providerCallId: options.callUuid,
    rawStatus: EXPECTED_RAW_STATUS,
    rawCause: EXPECTED_RAW_CAUSE,
    duration: EXPECTED_DURATION_SECONDS,
    now: currentNow,
  });

  if (!result.matched) {
    throw new Error("Reconciliation failed: processOutboundPlivoLifecycle returned unmatched attempt");
  }
  if (result.conflict) {
    throw new Error("Reconciliation failed: provider call correlation conflict");
  }
  if (!result.terminal || result.status !== "FAILED") {
    throw new Error(`Reconciliation failed: lifecycle ended in unexpected status ${result.status ?? "null"}`);
  }

  const updatedAttempt = await prisma.communicationOutboundAttempt.findUnique({
    where: { id: attempt.id },
    include: {
      campaign: { select: { status: true } },
      campaignRecipient: { select: { status: true, nextAttemptAt: true } },
      capacityLease: { select: { id: true } },
      call: {
        select: {
          id: true,
          providerCallId: true,
          status: true,
          duration: true,
          failedAt: true,
          endedAt: true,
        },
      },
    },
  });

  if (!updatedAttempt) {
    throw new Error("Postflight failed: reconciled attempt no longer exists");
  }
  if (updatedAttempt.campaign.status !== "CANCELLED") {
    throw new Error(`Postflight failed: campaign changed to ${updatedAttempt.campaign.status}`);
  }
  if (updatedAttempt.status !== "FAILED") {
    throw new Error(`Postflight failed: attempt is ${updatedAttempt.status}, expected FAILED`);
  }

  // Reuse the same evidence validator so repeated execution and initial execution
  // have exactly the same definition of "fully reconciled".
  assertAlreadyReconciledEvidence(updatedAttempt, options.callUuid);
  await assertNoAttemptTwo(prisma, updatedAttempt.campaignRecipientId);
  await assertNoPendingRecipientJob(queue, updatedAttempt.campaignRecipientId);

  return {
    mode: "EXECUTED",
    alreadyReconciled: false,
    attemptId: attempt.id,
    statusBefore: attempt.status,
    statusAfter: updatedAttempt.status,
  };
}
