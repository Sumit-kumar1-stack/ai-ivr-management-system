import { CallStatus } from "@prisma/client";
import { AppEvent, EventPublisher } from "@/core/events";
import { cleanupCallRuntime } from "@/services/calls/call-runtime-cleanup.service";
import { updateCallStatus, type UpdateCallStatusResult } from "@/services/calls/call.service";
import { clearHumanTransferState } from "./human-transfer-lifecycle.service";

export async function processProviderStatusCallback(input: { callId?: string; providerCallId: string; status: string; duration?: number }) {
  const result = await updateCallStatus(input);
  if (!result.callId || result.ignored || result.duplicate) return result;
  const event = result.status ? statusEvent(result.status) : null;
  if (event) await EventPublisher.publish(event, { callId: result.callId, timestamp: Date.now() });
  if (result.status && isTerminal(result.status)) {
    await EventPublisher.publish(AppEvent.CALL_TERMINATED, { callId: result.callId, status: result.status, actorType: "SYSTEM", timestamp: Date.now() });
  }
  if (result.terminalTransition) {
    await cleanupCallRuntime(result.callId);
    await clearHumanTransferState(result.callId);
  }
  return result;
}

function isTerminal(status: CallStatus): boolean {
  return status === CallStatus.COMPLETED || status === CallStatus.FAILED || status === CallStatus.BUSY || status === CallStatus.NO_ANSWER || status === CallStatus.CANCELED;
}

function statusEvent(status: CallStatus): AppEvent | null {
  if (status === CallStatus.QUEUED) return AppEvent.CALL_STARTED;
  if (status === CallStatus.RINGING) return AppEvent.CALL_RINGING;
  if (status === CallStatus.ANSWERED) return AppEvent.CALL_ANSWERED;
  if (status === CallStatus.COMPLETED) return AppEvent.CALL_COMPLETED;
  return isTerminal(status) ? AppEvent.CALL_FAILED : null;
}
