import { maskSensitiveData } from "./agent-handoff-context.service";

type CallbackRecord = {
  id: string; tenantId: string | null; originalCallId: string | null; callId: string; contactId: string | null; phone: string;
  scheduledFor: Date; preferredEnd: Date | null; timezone: string; reason: string | null; intent: string | null; handoffSummary: string | null;
  status: string; createdAt: Date; updatedAt: Date; claimedAt: Date | null; completedAt: Date | null; failureReason: string | null;
};

/** Explicit dashboard/API allow-list. Do not spread database callback records. */
export function toSafeCallbackView(callback: CallbackRecord) {
  return {
    id: callback.id,
    originalCallId: callback.originalCallId ?? callback.callId,
    contactId: callback.contactId,
    phone: maskPhone(callback.phone),
    preferredStart: callback.scheduledFor,
    preferredEnd: callback.preferredEnd,
    timezone: callback.timezone,
    reason: callback.reason ? maskSensitiveData(callback.reason) : null,
    intent: callback.intent ? maskSensitiveData(callback.intent) : null,
    handoffSummary: callback.handoffSummary ? maskSensitiveData(callback.handoffSummary) : null,
    status: callback.status,
    createdAt: callback.createdAt,
    updatedAt: callback.updatedAt,
    claimedAt: callback.claimedAt,
    completedAt: callback.completedAt,
    failureReason: callback.failureReason ? maskSensitiveData(callback.failureReason) : null,
  };
}

function maskPhone(value: string): string {
  const compact = value.replace(/\s/g, "");
  return compact.length < 4 ? "[REDACTED]" : `${compact.slice(0, Math.min(3, compact.length - 4))}••••${compact.slice(-4)}`;
}
