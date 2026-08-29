import {
  AuditEventOutcome,
  CallDirection,
  CallStatus,
  CommunicationCampaignStatus,
  CommunicationOutboundAttemptStatus,
  CommunicationRecipientStatus,
} from "@prisma/client";

import { getPlivoEnvironment } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/services/audit/audit-event.service";
import { AppEvent, EventPublisher } from "@/core/events";

import { tryFinalizeCommunicationCampaign } from "./communication-campaign-finalizer.service";
import { releaseOutboundCapacity } from "./communication-outbound-capacity.service";
import {
  scheduleOutboundRetry,
} from "./communication-outbound-orchestrator.service";
import {
  decideOutboundRetry,
} from "./communication-outbound-retry-policy.service";
import {
  OUTBOUND_REALTIME_EVENTS,
  publishOutboundEvent,
} from "./communication-outbound-events.service";
import {
  mapOutboundAttemptDisposition,
} from "./communication-outbound-progress.service";

export interface OutboundPlivoLifecycleInput {
  attemptId: string;
  providerCallId: string;
  rawStatus: string;
  rawCause?: string | null;
  duration?: number;
  now?: Date;
}

export interface OutboundPlivoLifecycleResult {
  matched: boolean;
  ignored: boolean;
  duplicate: boolean;
  conflict: boolean;
  attemptId: string | null;
  callId: string | null;
  status: CommunicationOutboundAttemptStatus | null;
  terminal: boolean;
}

interface OutboundAttemptLifecycleContext {
  id: string;
  tenantId: string;
  campaignId: string;
  campaignRecipientId: string;
  contactId: string;
  attemptNumber: number;
  status: CommunicationOutboundAttemptStatus;
  provider: string | null;
  providerCallId: string | null;
  requestedRuntime: string | null;
  effectiveRuntime: string | null;
  providerAcceptedAt: Date | null;
  campaign: {
    id: string;
    status: CommunicationCampaignStatus;
    maxAttempts: number;
    businessHoursPolicy: unknown;
    ivrFlowVersionId: string | null;
  };
  campaignRecipient: {
    id: string;
    phone: string;
    language: string;
    status: CommunicationRecipientStatus;
    consentStatus: string;
    dnc: boolean;
    suppressed: boolean;
  };
  call: { id: string } | null;
}

export async function processOutboundPlivoLifecycle(
  input: OutboundPlivoLifecycleInput
): Promise<OutboundPlivoLifecycleResult> {
  const attemptId = input.attemptId.trim();
  const providerCallId = input.providerCallId.trim();
  if (!attemptId || !providerCallId) return unmatched();

  const attempt = await prisma.communicationOutboundAttempt.findUnique({
    where: { id: attemptId },
    include: {
      campaign: {
        select: {
          id: true,
          status: true,
          maxAttempts: true,
          businessHoursPolicy: true,
          ivrFlowVersionId: true,
        },
      },
      campaignRecipient: {
        select: {
          id: true,
          phone: true,
          language: true,
          status: true,
          consentStatus: true,
          dnc: true,
          suppressed: true,
        },
      },
      call: { select: { id: true } },
    },
  });

  if (!attempt || attempt.provider !== "PLIVO") return unmatched();
  const providerOwner = await prisma.communicationOutboundAttempt.findFirst({
    where: { providerCallId },
    select: { id: true },
  });
  if (providerOwner && providerOwner.id !== attempt.id) {
    await safeAudit(attempt.tenantId, attempt.id, "PROVIDER_CORRELATION_REJECTED", "FAILED", {
      reasonCode: "PROVIDER_CALL_ID_BOUND_TO_ANOTHER_ATTEMPT",
    });
    return { ...unmatched(), matched: true, conflict: true, attemptId: attempt.id };
  }
  if (attempt.providerCallId && attempt.providerCallId !== providerCallId) {
    await safeAudit(attempt.tenantId, attempt.id, "PROVIDER_CORRELATION_REJECTED", "FAILED", {
      reasonCode: "PROVIDER_CALL_ID_MISMATCH",
    });
    return { ...unmatched(), matched: true, conflict: true, attemptId: attempt.id };
  }

  if (!attempt.providerCallId) {
    const bound = await prisma.communicationOutboundAttempt.updateMany({
      where: { id: attempt.id, provider: "PLIVO", providerCallId: null },
      data: { providerCallId },
    });
    if (bound.count === 0) {
      const current = await prisma.communicationOutboundAttempt.findUnique({
        where: { id: attempt.id },
        select: { providerCallId: true },
      });
      if (current?.providerCallId !== providerCallId) {
        return { ...unmatched(), matched: true, conflict: true, attemptId: attempt.id };
      }
    }
  }

  const incoming = normalizePlivoOutboundStatus(input.rawStatus, input.rawCause);
  const transition = reduceOutboundAttemptStatus(attempt.status, incoming);
  const now = input.now ?? new Date();
  const call = await ensureCanonicalOutboundCall({
    attempt,
    providerCallId,
    status: toCallStatus(transition.status),
    now,
  });

  if (!transition.apply) {
    return {
      matched: true,
      ignored: true,
      duplicate: transition.duplicate,
      conflict: false,
      attemptId: attempt.id,
      callId: call.id,
      status: attempt.status,
      terminal: isTerminalOutboundAttemptStatus(attempt.status),
    };
  }

  await prisma.communicationOutboundAttempt.updateMany({
    where: { id: attempt.id, status: attempt.status },
    data: {
      status: transition.status,
      rawProviderStatus: safeProviderText(input.rawStatus),
      rawProviderCause: safeProviderText(input.rawCause),
      providerAcceptedAt: attempt.providerAcceptedAt ?? now,
      ringingAt: transition.status === CommunicationOutboundAttemptStatus.RINGING ? now : undefined,
      answeredAt: transition.status === CommunicationOutboundAttemptStatus.ANSWERED ? now : undefined,
      completedAt: isTerminalOutboundAttemptStatus(transition.status) ? now : undefined,
      failureReason: isSuccessful(transition.status) ? null : safeProviderText(input.rawCause),
    },
  });

  await updateCanonicalCall(call.id, transition.status, input.duration, now);
  await publishCallLifecycle(call.id, transition.status, now);
  await safeAudit(
    attempt.tenantId,
    attempt.id,
    lifecycleAuditAction(transition.status),
    isSuccessful(transition.status) ? "SUCCEEDED" : "ACCEPTED",
    { provider: "PLIVO", attemptNumber: attempt.attemptNumber, status: transition.status }
  );

  const disposition = mapOutboundAttemptDisposition(transition.status);
  publishOutboundEvent(
    OUTBOUND_REALTIME_EVENTS.ATTEMPT_UPDATED,
    {
      tenantId: attempt.tenantId,
      campaignId: attempt.campaignId,
      attemptId: attempt.id,
      callId: call.id,
    },
    {
      state: disposition ?? "FAILED",
      terminal: isTerminalOutboundAttemptStatus(transition.status),
    }
  );
  if (disposition) {
    publishOutboundEvent(
      OUTBOUND_REALTIME_EVENTS.DISPOSITION_UPDATED,
      {
        tenantId: attempt.tenantId,
        campaignId: attempt.campaignId,
        attemptId: attempt.id,
        callId: call.id,
      },
      { disposition }
    );
  }
  publishOutboundEvent(
    OUTBOUND_REALTIME_EVENTS.PROGRESS_UPDATED,
    {
      tenantId: attempt.tenantId,
      campaignId: attempt.campaignId,
      attemptId: attempt.id,
      callId: call.id,
    }
  );

  if (isTerminalOutboundAttemptStatus(transition.status)) {
    await settleTerminalAttempt({ attempt, status: transition.status, now });
  }

  return {
    matched: true,
    ignored: false,
    duplicate: false,
    conflict: false,
    attemptId: attempt.id,
    callId: call.id,
    status: transition.status,
    terminal: isTerminalOutboundAttemptStatus(transition.status),
  };
}

export function normalizePlivoOutboundStatus(
  rawStatus: string,
  rawCause?: string | null
): CommunicationOutboundAttemptStatus {
  const status = rawStatus.trim().toLowerCase().replaceAll("_", "-");
  const cause = rawCause?.trim().toLowerCase() ?? "";
  if (cause.includes("invalid") && cause.includes("number")) {
    return CommunicationOutboundAttemptStatus.INVALID_NUMBER;
  }
  switch (status) {
    case "queued":
    case "initiated":
    case "dialing":
      return CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED;
    case "ringing": return CommunicationOutboundAttemptStatus.RINGING;
    case "answered":
    case "in-progress": return CommunicationOutboundAttemptStatus.ANSWERED;
    case "completed": return CommunicationOutboundAttemptStatus.COMPLETED;
    case "busy": return CommunicationOutboundAttemptStatus.BUSY;
    case "no-answer":
    case "timeout": return CommunicationOutboundAttemptStatus.NO_ANSWER;
    case "rejected": return CommunicationOutboundAttemptStatus.REJECTED;
    case "provider-error":
    case "internal-error":
    case "error": return CommunicationOutboundAttemptStatus.PROVIDER_ERROR;
    case "cancelled":
    case "canceled": return CommunicationOutboundAttemptStatus.CANCELED;
    default: return CommunicationOutboundAttemptStatus.FAILED;
  }
}

export function reduceOutboundAttemptStatus(
  current: CommunicationOutboundAttemptStatus,
  incoming: CommunicationOutboundAttemptStatus
): { apply: boolean; duplicate: boolean; status: CommunicationOutboundAttemptStatus } {
  if (current === incoming) return { apply: false, duplicate: true, status: current };
  if (isTerminalOutboundAttemptStatus(current)) {
    return { apply: false, duplicate: false, status: current };
  }
  if (isTerminalOutboundAttemptStatus(incoming)) {
    return { apply: true, duplicate: false, status: incoming };
  }
  if (rank(incoming) <= rank(current)) {
    return { apply: false, duplicate: false, status: current };
  }
  return { apply: true, duplicate: false, status: incoming };
}

export function isTerminalOutboundAttemptStatus(
  status: CommunicationOutboundAttemptStatus
): boolean {
  return TERMINAL.has(status);
}

async function ensureCanonicalOutboundCall(input: {
  attempt: OutboundAttemptLifecycleContext;
  providerCallId: string;
  status: CallStatus;
  now: Date;
}) {
  const existing = input.attempt.call;
  if (existing) return existing;
  return prisma.call.upsert({
    where: { communicationOutboundAttemptId: input.attempt.id },
    update: { providerCallId: input.providerCallId },
    create: {
      provider: "PLIVO",
      providerCallId: input.providerCallId,
      direction: CallDirection.OUTBOUND,
      callerNumber: getPlivoEnvironment().callerId,
      calledNumber: input.attempt.campaignRecipient.phone,
      tenantId: input.attempt.tenantId,
      ivrFlowVersionId: input.attempt.campaign.ivrFlowVersionId,
      communicationCampaignId: input.attempt.campaignId,
      communicationOutboundAttemptId: input.attempt.id,
      attemptNumber: input.attempt.attemptNumber,
      maxAttempts: input.attempt.campaign.maxAttempts,
      language: input.attempt.campaignRecipient.language,
      requestedRuntime: input.attempt.requestedRuntime,
      effectiveRuntime: input.attempt.effectiveRuntime,
      providerDestination: input.attempt.campaignRecipient.phone,
      contactPhoneSnapshot: input.attempt.campaignRecipient.phone,
      status: input.status,
      queuedAt: input.now,
    },
    select: { id: true },
  });
}

async function updateCanonicalCall(
  callId: string,
  status: CommunicationOutboundAttemptStatus,
  duration: number | undefined,
  now: Date
): Promise<void> {
  const mapped = toCallStatus(status);
  await prisma.call.updateMany({
    where: { id: callId, status: { notIn: terminalCallStatuses() } },
    data: {
      status: mapped,
      duration: Number.isFinite(duration) && Number(duration) >= 0 ? Math.floor(Number(duration)) : undefined,
      ringingAt: mapped === CallStatus.RINGING ? now : undefined,
      answeredAt: mapped === CallStatus.ANSWERED ? now : undefined,
      completedAt: mapped === CallStatus.COMPLETED ? now : undefined,
      failedAt: isTerminalOutboundAttemptStatus(status) && mapped !== CallStatus.COMPLETED ? now : undefined,
      endedAt: isTerminalOutboundAttemptStatus(status) ? now : undefined,
    },
  });
}

async function settleTerminalAttempt(input: {
  attempt: OutboundAttemptLifecycleContext;
  status: CommunicationOutboundAttemptStatus;
  now: Date;
}): Promise<void> {
  await releaseOutboundCapacity(input.attempt.id);
  if (input.status === CommunicationOutboundAttemptStatus.COMPLETED) {
    await prisma.communicationCampaignRecipient.updateMany({
      where: { id: input.attempt.campaignRecipientId, campaignId: input.attempt.campaignId },
      data: { status: CommunicationRecipientStatus.COMPLETED, lastError: null, nextAttemptAt: null },
    });
  } else {
    const eligible = !input.attempt.campaignRecipient.dnc &&
      !input.attempt.campaignRecipient.suppressed &&
      input.attempt.campaignRecipient.consentStatus === "OPTED_IN";
    const decision = decideOutboundRetry({
      attemptNumber: input.attempt.attemptNumber,
      maxAttempts: input.attempt.campaign.maxAttempts,
      outcome: input.status,
      campaignStatus: input.attempt.campaign.status,
      recipientStatus: input.attempt.campaignRecipient.status,
      eligible,
      now: input.now,
      businessHoursPolicy: parseBusinessHoursPolicy(input.attempt.campaign.businessHoursPolicy),
    });

    if (decision.decision !== "DO_NOT_RETRY" && decision.scheduledFor) {
      await scheduleOutboundRetry({
        tenantId: input.attempt.tenantId,
        campaignId: input.attempt.campaignId,
        campaignRecipientId: input.attempt.campaignRecipientId,
        contactId: input.attempt.contactId,
        previousAttemptNumber: input.attempt.attemptNumber,
        scheduledFor: decision.scheduledFor,
        now: input.now,
      });
      await safeAudit(input.attempt.tenantId, input.attempt.id, "OUTBOUND_RETRY_SCHEDULED", "ACCEPTED", {
        reasonCode: decision.reasonCode,
        nextAttemptNumber: decision.nextAttemptNumber,
        scheduledFor: decision.scheduledFor.toISOString(),
      });
    } else {
      await prisma.communicationCampaignRecipient.updateMany({
        where: { id: input.attempt.campaignRecipientId, campaignId: input.attempt.campaignId },
        data: {
          status: CommunicationRecipientStatus.FAILED,
          lastError: `Final outbound status: ${input.status}`,
          nextAttemptAt: null,
        },
      });
    }
  }
  await tryFinalizeCommunicationCampaign(input.attempt.campaignId);
}

function toCallStatus(status: CommunicationOutboundAttemptStatus): CallStatus {
  if (status === CommunicationOutboundAttemptStatus.RINGING) return CallStatus.RINGING;
  if (status === CommunicationOutboundAttemptStatus.ANSWERED) return CallStatus.ANSWERED;
  if (status === CommunicationOutboundAttemptStatus.COMPLETED) return CallStatus.COMPLETED;
  if (status === CommunicationOutboundAttemptStatus.BUSY) return CallStatus.BUSY;
  if (status === CommunicationOutboundAttemptStatus.NO_ANSWER) return CallStatus.NO_ANSWER;
  if (status === CommunicationOutboundAttemptStatus.CANCELED) return CallStatus.CANCELED;
  if (isTerminalOutboundAttemptStatus(status)) return CallStatus.FAILED;
  return CallStatus.QUEUED;
}

function rank(status: CommunicationOutboundAttemptStatus): number {
  if (status === CommunicationOutboundAttemptStatus.QUEUED) return 0;
  if (status === CommunicationOutboundAttemptStatus.CLAIMED) return 1;
  if (status === CommunicationOutboundAttemptStatus.PROVIDER_REQUESTING) return 2;
  if (status === CommunicationOutboundAttemptStatus.PROVIDER_ACCEPTED) return 3;
  if (status === CommunicationOutboundAttemptStatus.RINGING) return 4;
  if (status === CommunicationOutboundAttemptStatus.ANSWERED) return 5;
  return 6;
}

const TERMINAL = new Set<CommunicationOutboundAttemptStatus>([
  CommunicationOutboundAttemptStatus.COMPLETED,
  CommunicationOutboundAttemptStatus.BUSY,
  CommunicationOutboundAttemptStatus.NO_ANSWER,
  CommunicationOutboundAttemptStatus.REJECTED,
  CommunicationOutboundAttemptStatus.FAILED,
  CommunicationOutboundAttemptStatus.INVALID_NUMBER,
  CommunicationOutboundAttemptStatus.PROVIDER_ERROR,
  CommunicationOutboundAttemptStatus.CANCELED,
  CommunicationOutboundAttemptStatus.SKIPPED,
]);

function terminalCallStatuses(): CallStatus[] {
  return [CallStatus.COMPLETED, CallStatus.FAILED, CallStatus.BUSY, CallStatus.NO_ANSWER, CallStatus.CANCELED];
}

function isSuccessful(status: CommunicationOutboundAttemptStatus): boolean {
  return status === CommunicationOutboundAttemptStatus.COMPLETED;
}

function lifecycleAuditAction(status: CommunicationOutboundAttemptStatus): string {
  if (status === CommunicationOutboundAttemptStatus.RINGING) return "OUTBOUND_CALL_RINGING";
  if (status === CommunicationOutboundAttemptStatus.ANSWERED) return "OUTBOUND_CALL_ANSWERED";
  if (status === CommunicationOutboundAttemptStatus.COMPLETED) return "OUTBOUND_CALL_COMPLETED";
  return isTerminalOutboundAttemptStatus(status) ? "OUTBOUND_CALL_FAILED" : "OUTBOUND_PROVIDER_ACCEPTED";
}

async function publishCallLifecycle(
  callId: string,
  status: CommunicationOutboundAttemptStatus,
  now: Date
): Promise<void> {
  try {
    const mapped = toCallStatus(status);
    const event = mapped === CallStatus.RINGING
      ? AppEvent.CALL_RINGING
      : mapped === CallStatus.ANSWERED
        ? AppEvent.CALL_ANSWERED
        : mapped === CallStatus.COMPLETED
          ? AppEvent.CALL_COMPLETED
          : isTerminalOutboundAttemptStatus(status)
            ? AppEvent.CALL_FAILED
            : null;
    if (event) await EventPublisher.publish(event, { callId, timestamp: now.getTime() });
    if (isTerminalOutboundAttemptStatus(status)) {
      await EventPublisher.publish(AppEvent.CALL_TERMINATED, {
        callId,
        status: mapped,
        actorType: "SYSTEM",
        timestamp: now.getTime(),
      });
    }
  } catch {
    // Realtime observability is best effort and cannot block settlement.
  }
}

async function safeAudit(
  tenantId: string,
  attemptId: string,
  action: string,
  result: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await recordAuditEvent({
      tenantId,
      actor: null,
      entityType: "CommunicationOutboundAttempt",
      entityId: attemptId,
      action,
      outcome: result === "FAILED" ? AuditEventOutcome.FAILED : AuditEventOutcome.SUCCEEDED,
      result,
      metadata,
    });
  } catch {
    // Provider lifecycle must not fail because best-effort audit storage failed.
  }
}

function safeProviderText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function parseBusinessHoursPolicy(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const policy = value as Record<string, unknown>;
  if (
    typeof policy.timezone !== "string" ||
    typeof policy.startTime !== "string" ||
    typeof policy.endTime !== "string" ||
    !Array.isArray(policy.enabledDays) ||
    !policy.enabledDays.every(day => Number.isInteger(day))
  ) return null;
  return {
    timezone: policy.timezone,
    startTime: policy.startTime,
    endTime: policy.endTime,
    enabledDays: policy.enabledDays.map(Number),
  };
}

function unmatched(): OutboundPlivoLifecycleResult {
  return {
    matched: false,
    ignored: true,
    duplicate: false,
    conflict: false,
    attemptId: null,
    callId: null,
    status: null,
    terminal: false,
  };
}
