import {
  CallbackRequestStatus,
  CallEventType,
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus,
  CommunicationRecipientStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  CanonicalOutboundDisposition,
  CommunicationOutboundAttemptSummaryDTO,
  CommunicationOutboundOperationsDTO,
  CommunicationOutboundProgressDTO,
  OutboundRetryVisibility,
} from "@/types/communication-outbound-operations";

const ACTIVE_ATTEMPT_STATUSES = new Set<CommunicationOutboundAttemptStatus>([
  CommunicationOutboundAttemptStatus.QUEUED,
  CommunicationOutboundAttemptStatus.CLAIMED,
  CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING,
  CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED,
  CommunicationOutboundAttemptStatus.RINGING,
  CommunicationOutboundAttemptStatus.ANSWERED,
]);

const ACTIVE_CALLBACK_STATUSES = new Set<CallbackRequestStatus>([
  CallbackRequestStatus.PENDING,
  CallbackRequestStatus.CONFIRMED,
  CallbackRequestStatus.CLAIMED,
  CallbackRequestStatus.REQUESTED,
  CallbackRequestStatus.SCHEDULED,
]);

interface AttemptSnapshot {
  id: string;
  attemptNumber: number;
  status: CommunicationOutboundAttemptStatus;
  ringingAt: Date | null;
  answeredAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  call: { id: string } | null;
}

interface RecipientSnapshot {
  id: string;
  fullName: string | null;
  externalRecipientId: string | null;
  phone: string;
  status: CommunicationRecipientStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
  outboundAttempts: AttemptSnapshot[];
}

interface OutcomeEvidence {
  transferredCallIds: Set<string>;
  callbackByCallId: Map<string, CallbackRequestStatus[]>;
}

export function mapOutboundAttemptDisposition(
  status: CommunicationOutboundAttemptStatus
): CanonicalOutboundDisposition | null {
  switch (status) {
    case CommunicationOutboundAttemptStatus.QUEUED:
    case CommunicationOutboundAttemptStatus.CLAIMED:
    case CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED:
      return "QUEUED";
    case CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING:
      return "REQUESTING";
    case CommunicationOutboundAttemptStatus.RINGING:
      return "RINGING";
    case CommunicationOutboundAttemptStatus.ANSWERED:
      return "ANSWERED";
    case CommunicationOutboundAttemptStatus.COMPLETED:
      return "COMPLETED";
    case CommunicationOutboundAttemptStatus.BUSY:
      return "BUSY";
    case CommunicationOutboundAttemptStatus.NO_ANSWER:
      return "NO_ANSWER";
    case CommunicationOutboundAttemptStatus.REJECTED:
      return "REJECTED";
    case CommunicationOutboundAttemptStatus.INVALID_NUMBER:
      return "INVALID_NUMBER";
    case CommunicationOutboundAttemptStatus.PROVIDER_ERROR:
      return "PROVIDER_ERROR";
    case CommunicationOutboundAttemptStatus.FAILED:
      return "FAILED";
    case CommunicationOutboundAttemptStatus.CANCELED:
      return "CANCELED";
    case CommunicationOutboundAttemptStatus.SKIPPED:
      return null;
  }
}

export function hasAuthoritativeTransferEvidence(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  return value.stage === "CONNECTED" ||
    value.stage === "COMPLETED" ||
    value.transferStatus === "ANSWERED" ||
    value.transferStatus === "COMPLETED";
}

export function aggregateOutboundProgress(input: {
  campaignStatus: CommunicationCampaignStatus;
  recipients: RecipientSnapshot[];
  evidence: OutcomeEvidence;
}): CommunicationOutboundProgressDTO {
  const progress = emptyProgress(input.recipients.length);

  for (const recipient of input.recipients) {
    const attempt = latestAttempt(recipient.outboundAttempts);
    const state = attempt
      ? mapOutboundAttemptDisposition(attempt.status)
      : "PENDING";
    if (state) incrementDisposition(progress, state);

    const callId = attempt?.call?.id ?? null;
    const callbackStatuses = callId
      ? input.evidence.callbackByCallId.get(callId) ?? []
      : [];
    const transferred = Boolean(callId && input.evidence.transferredCallIds.has(callId));
    const callbackCompleted = callbackStatuses.includes(CallbackRequestStatus.COMPLETED);
    const callbackRequested = callbackStatuses.length > 0;

    if (transferred) progress.transferred += 1;
    if (callbackRequested) progress.callbackRequested += 1;
    if (callbackCompleted) progress.callbackCompleted += 1;
    if (recipient.nextAttemptAt) progress.retryScheduled += 1;

    const callbackOutstanding = callbackStatuses.some(status => ACTIVE_CALLBACK_STATUSES.has(status));
    const runnable = input.campaignStatus !== CommunicationCampaignStatus.CANCELLED && (
      recipient.status === CommunicationRecipientStatus.PENDING ||
      recipient.status === CommunicationRecipientStatus.PROCESSING ||
      Boolean(attempt && ACTIVE_ATTEMPT_STATUSES.has(attempt.status)) ||
      callbackOutstanding
    );
    if (runnable) progress.remainingCount += 1;
  }

  progress.processedCount = Math.max(0, progress.totalRecipients - progress.remainingCount);
  progress.terminalCount = progress.processedCount;
  progress.progressPercent = progress.totalRecipients === 0
    ? 0
    : Math.min(100, Math.max(0, Math.round(
        (progress.processedCount / progress.totalRecipients) * 100
      )));
  return progress;
}

export async function getCommunicationCampaignOutboundOperations(
  campaignId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<CommunicationOutboundOperationsDTO> {
  const id = campaignId.trim();
  if (!id) throw new Error("Communication campaign ID is required");

  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      maxAttempts: true,
      recipients: {
        select: {
          id: true,
          fullName: true,
          externalRecipientId: true,
          phone: true,
          status: true,
          attemptCount: true,
          nextAttemptAt: true,
          outboundAttempts: {
            orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              attemptNumber: true,
              status: true,
              ringingAt: true,
              answeredAt: true,
              completedAt: true,
              createdAt: true,
              updatedAt: true,
              call: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!campaign) throw new Error("Communication campaign not found");

  const callIds = campaign.recipients.flatMap(recipient =>
    recipient.outboundAttempts.flatMap(attempt => attempt.call ? [attempt.call.id] : [])
  );
  const [transferEvents, callbacks] = callIds.length > 0
    ? await Promise.all([
        prisma.callEvent.findMany({
          where: { callId: { in: callIds }, type: CallEventType.HUMAN_TRANSFER },
          select: { callId: true, payload: true },
        }),
        prisma.callbackRequest.findMany({
          where: {
            OR: [
              { callId: { in: callIds } },
              { originalCallId: { in: callIds } },
            ],
          },
          select: { callId: true, originalCallId: true, status: true },
        }),
      ])
    : [[], []];

  const evidence: OutcomeEvidence = {
    transferredCallIds: new Set(
      transferEvents.filter(event => hasAuthoritativeTransferEvidence(event.payload)).map(event => event.callId)
    ),
    callbackByCallId: new Map(),
  };
  for (const callback of callbacks) {
    const callId = callback.originalCallId ?? callback.callId;
    const statuses = evidence.callbackByCallId.get(callId) ?? [];
    statuses.push(callback.status);
    evidence.callbackByCallId.set(callId, statuses);
  }

  const allAttempts = campaign.recipients.flatMap(recipient =>
    recipient.outboundAttempts.map(attempt => ({ recipient, attempt }))
  ).sort((left, right) =>
    right.attempt.updatedAt.getTime() - left.attempt.updatedAt.getTime()
  );
  const pageSize = normalizePositiveInteger(options.pageSize, 25, 100);
  const totalPages = Math.max(1, Math.ceil(allAttempts.length / pageSize));
  const page = Math.min(normalizePositiveInteger(options.page, 1, totalPages), totalPages);
  const attempts = allAttempts
    .slice((page - 1) * pageSize, page * pageSize)
    .map(({ recipient, attempt }) => summarizeAttempt(recipient, attempt, campaign.maxAttempts, evidence));

  return {
    progress: aggregateOutboundProgress({
      campaignStatus: campaign.status,
      recipients: campaign.recipients,
      evidence,
    }),
    attempts,
    pagination: { page, pageSize, total: allAttempts.length, totalPages },
  };
}

function summarizeAttempt(
  recipient: RecipientSnapshot,
  attempt: AttemptSnapshot,
  maxAttempts: number,
  evidence: OutcomeEvidence
): CommunicationOutboundAttemptSummaryDTO {
  const state = mapOutboundAttemptDisposition(attempt.status) ?? "FAILED";
  const callId = attempt.call?.id ?? null;
  const callbackStatuses = callId ? evidence.callbackByCallId.get(callId) ?? [] : [];
  const callbackCompleted = callbackStatuses.includes(CallbackRequestStatus.COMPLETED);
  const callbackRequested = callbackStatuses.length > 0;
  const transferred = Boolean(callId && evidence.transferredCallIds.has(callId));
  const disposition: CanonicalOutboundDisposition = callbackCompleted
    ? "CALLBACK_COMPLETED"
    : transferred
      ? "TRANSFERRED"
      : callbackRequested
        ? "CALLBACK_REQUESTED"
        : state;

  return {
    id: attempt.id,
    recipientId: recipient.id,
    recipient: recipient.fullName?.trim() ||
      recipient.externalRecipientId?.trim() ||
      maskPhone(recipient.phone),
    attemptNumber: attempt.attemptNumber,
    state,
    disposition,
    retryState: retryVisibility(recipient, attempt, maxAttempts),
    nextRetryAt: recipient.nextAttemptAt?.toISOString() ?? null,
    queuedAt: attempt.createdAt.toISOString(),
    ringingAt: attempt.ringingAt?.toISOString() ?? null,
    answeredAt: attempt.answeredAt?.toISOString() ?? null,
    completedAt: attempt.completedAt?.toISOString() ?? null,
    transferred,
    callbackRequested,
    callbackCompleted,
    updatedAt: attempt.updatedAt.toISOString(),
  };
}

function retryVisibility(
  recipient: RecipientSnapshot,
  attempt: AttemptSnapshot,
  maxAttempts: number
): OutboundRetryVisibility {
  if (recipient.nextAttemptAt) return "SCHEDULED";
  if (!ACTIVE_ATTEMPT_STATUSES.has(attempt.status) && attempt.attemptNumber >= maxAttempts) {
    return "EXHAUSTED";
  }
  return "NONE";
}

function latestAttempt(attempts: AttemptSnapshot[]): AttemptSnapshot | null {
  return attempts.reduce<AttemptSnapshot | null>((latest, attempt) => {
    if (!latest || attempt.attemptNumber > latest.attemptNumber) return attempt;
    if (attempt.attemptNumber === latest.attemptNumber && attempt.updatedAt > latest.updatedAt) return attempt;
    return latest;
  }, null);
}

function incrementDisposition(
  progress: CommunicationOutboundProgressDTO,
  disposition: CanonicalOutboundDisposition
): void {
  const key: Partial<Record<CanonicalOutboundDisposition, keyof CommunicationOutboundProgressDTO>> = {
    PENDING: "pending",
    QUEUED: "queued",
    REQUESTING: "requesting",
    RINGING: "ringing",
    ANSWERED: "answered",
    COMPLETED: "completed",
    BUSY: "busy",
    NO_ANSWER: "noAnswer",
    REJECTED: "rejected",
    INVALID_NUMBER: "invalidNumber",
    PROVIDER_ERROR: "providerError",
    FAILED: "failed",
    CANCELED: "canceled",
  };
  const field = key[disposition];
  if (field) progress[field] += 1;
}

function emptyProgress(totalRecipients: number): CommunicationOutboundProgressDTO {
  return {
    totalRecipients,
    pending: 0,
    queued: 0,
    requesting: 0,
    ringing: 0,
    answered: 0,
    completed: 0,
    busy: 0,
    noAnswer: 0,
    rejected: 0,
    invalidNumber: 0,
    providerError: 0,
    failed: 0,
    canceled: 0,
    retryScheduled: 0,
    transferred: 0,
    callbackRequested: 0,
    callbackCompleted: 0,
    terminalCount: 0,
    processedCount: 0,
    remainingCount: 0,
    progressPercent: 0,
  };
}

function normalizePositiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.min(maximum, Math.floor(Number(value)))
    : fallback;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? "••••" : `••••••${digits.slice(-4)}`;
}
