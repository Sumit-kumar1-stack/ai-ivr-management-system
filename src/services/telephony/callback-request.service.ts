import { CallbackRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const active = [CallbackRequestStatus.PENDING, CallbackRequestStatus.CONFIRMED, CallbackRequestStatus.CLAIMED, CallbackRequestStatus.REQUESTED, CallbackRequestStatus.SCHEDULED];

export async function createCallbackRequest(input: { originalCallId: string; callbackNumber: string; preferredStart: Date; preferredEnd?: Date; timezone: string; reason?: string; intent?: string; handoffSummary?: string }) {
  const call = await prisma.call.findUnique({ where: { id: input.originalCallId }, select: { id: true, tenantId: true, contactId: true } });
  if (!call?.tenantId) throw new Error("CALLBACK_TENANT_REQUIRED");
  const existing = await prisma.callbackRequest.findFirst({ where: { callId: call.id, status: { in: active } }, select: { id: true } });
  if (existing) throw new Error("CALLBACK_ACTIVE_REQUEST_EXISTS");
  return prisma.callbackRequest.create({ data: { callId: call.id, originalCallId: call.id, tenantId: call.tenantId, contactId: call.contactId, phone: input.callbackNumber, scheduledFor: input.preferredStart, preferredEnd: input.preferredEnd, timezone: input.timezone, reason: input.reason, intent: input.intent, handoffSummary: input.handoffSummary, status: CallbackRequestStatus.PENDING, requestedBy: "CALLER", idempotencyKey: `phase-b:${call.id}:${input.preferredStart.toISOString()}` } });
}

export async function updateCallbackLifecycle(tenantId: string, callbackId: string, action: "confirm" | "claim" | "schedule" | "complete" | "fail" | "cancel", failureReason?: string) {
  const current = await prisma.callbackRequest.findFirst({ where: { id: callbackId, tenantId } });
  if (!current) throw new Error("CALLBACK_NOT_FOUND");
  assertTransition(current.status, action);
  const now = new Date();
  const status = action === "confirm" ? CallbackRequestStatus.CONFIRMED : action === "claim" ? CallbackRequestStatus.CLAIMED : action === "schedule" ? CallbackRequestStatus.SCHEDULED : action === "complete" ? CallbackRequestStatus.COMPLETED : action === "fail" ? CallbackRequestStatus.FAILED : CallbackRequestStatus.CANCELLED;
  return prisma.callbackRequest.update({ where: { id: current.id }, data: { status, claimedAt: action === "claim" ? now : undefined, completedAt: action === "complete" ? now : undefined, failureReason: action === "fail" ? failureReason ?? "CALLBACK_FAILED" : undefined } });
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
