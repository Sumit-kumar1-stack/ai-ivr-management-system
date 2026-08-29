import { CallbackRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  tryFinalizeCommunicationCampaign,
} from "@/services/communication/communication-campaign-finalizer.service";
import {
  OUTBOUND_REALTIME_EVENTS,
  publishOutboundCallLinkedEvent,
} from "@/services/communication/communication-outbound-events.service";

const active = [CallbackRequestStatus.PENDING, CallbackRequestStatus.CONFIRMED, CallbackRequestStatus.CLAIMED, CallbackRequestStatus.REQUESTED, CallbackRequestStatus.SCHEDULED];

export async function createCallbackRequest(input: { originalCallId: string; callbackNumber: string; preferredStart: Date; preferredEnd?: Date; timezone: string; reason?: string; intent?: string; handoffSummary?: string }) {
  const call = await prisma.call.findUnique({ where: { id: input.originalCallId }, select: { id: true, tenantId: true, contactId: true } });
  if (!call?.tenantId) throw new Error("CALLBACK_TENANT_REQUIRED");
  const existing = await prisma.callbackRequest.findFirst({ where: { callId: call.id, status: { in: active } }, select: { id: true } });
  if (existing) throw new Error("CALLBACK_ACTIVE_REQUEST_EXISTS");
  const callback = await prisma.callbackRequest.create({ data: { callId: call.id, originalCallId: call.id, tenantId: call.tenantId, contactId: call.contactId, phone: input.callbackNumber, scheduledFor: input.preferredStart, preferredEnd: input.preferredEnd, timezone: input.timezone, reason: input.reason, intent: input.intent, handoffSummary: input.handoffSummary, status: CallbackRequestStatus.PENDING, requestedBy: "CALLER", idempotencyKey: `phase-b:${call.id}:${input.preferredStart.toISOString()}` } });
  await publishCallbackEvent(call.id, callback.status);
  return callback;
}

export async function updateCallbackLifecycle(tenantId: string, callbackId: string, action: "confirm" | "claim" | "schedule" | "complete" | "fail" | "cancel", failureReason?: string) {
  const current = await prisma.callbackRequest.findFirst({ where: { id: callbackId, tenantId } });
  if (!current) throw new Error("CALLBACK_NOT_FOUND");
  assertTransition(current.status, action);
  const now = new Date();
  const status = action === "confirm" ? CallbackRequestStatus.CONFIRMED : action === "claim" ? CallbackRequestStatus.CLAIMED : action === "schedule" ? CallbackRequestStatus.SCHEDULED : action === "complete" ? CallbackRequestStatus.COMPLETED : action === "fail" ? CallbackRequestStatus.FAILED : CallbackRequestStatus.CANCELLED;
  const callback = await prisma.callbackRequest.update({ where: { id: current.id }, data: { status, claimedAt: action === "claim" ? now : undefined, completedAt: action === "complete" ? now : undefined, failureReason: action === "fail" ? failureReason ?? "CALLBACK_FAILED" : undefined } });
  await publishCallbackEvent(callback.originalCallId ?? callback.callId, callback.status);
  if (
    callback.status === CallbackRequestStatus.COMPLETED ||
    callback.status === CallbackRequestStatus.FAILED ||
    callback.status === CallbackRequestStatus.CANCELLED
  ) {
    const call = await prisma.call.findUnique({
      where: { id: callback.originalCallId ?? callback.callId },
      select: { communicationCampaignId: true },
    });
    await tryFinalizeCommunicationCampaign(call?.communicationCampaignId);
  }
  return callback;
}

export function listTenantCallbacks(tenantId: string) { return prisma.callbackRequest.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }); }

/** Exact tenant filter is intentional: callers must never fetch a callback by id alone. */
export function getTenantCallback(tenantId: string, callbackId: string) { return prisma.callbackRequest.findFirst({ where: { id: callbackId, tenantId } }); }

function assertTransition(status: CallbackRequestStatus, action: "confirm" | "claim" | "schedule" | "complete" | "fail" | "cancel") {
  const permitted: Record<typeof action, CallbackRequestStatus[]> = {
    confirm: [CallbackRequestStatus.PENDING, CallbackRequestStatus.REQUESTED],
    claim: [CallbackRequestStatus.CONFIRMED, CallbackRequestStatus.SCHEDULED],
    schedule: [CallbackRequestStatus.CONFIRMED, CallbackRequestStatus.CLAIMED],
    complete: [CallbackRequestStatus.CLAIMED, CallbackRequestStatus.SCHEDULED],
    fail: active,
    cancel: active,
  };
  if (!permitted[action].includes(status)) throw new Error("CALLBACK_CONFIRMATION_REQUIRED");
}

async function publishCallbackEvent(
  callId: string,
  status: CallbackRequestStatus
): Promise<void> {
  try {
    await publishOutboundCallLinkedEvent(
      callId,
      OUTBOUND_REALTIME_EVENTS.CALLBACK_UPDATED,
      {
        callbackStatus: status,
        requested: true,
        completed: status === CallbackRequestStatus.COMPLETED,
      }
    );
  } catch {
    // Callback state is canonical; realtime observability is best effort.
  }
}
