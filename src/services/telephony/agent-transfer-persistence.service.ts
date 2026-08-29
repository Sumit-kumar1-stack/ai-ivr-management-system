import { CallEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentHandoffContext } from "./agent-handoff-context.service";
import {
  OUTBOUND_REALTIME_EVENTS,
  publishOutboundCallLinkedEvent,
} from "@/services/communication/communication-outbound-events.service";

export type PersistedTransferLifecycle = "REQUESTED" | "POLICY_CHECKED" | "CONTEXT_READY" | "TRANSFER_INITIATED" | "DIALING" | "CONNECTED" | "COMPLETED" | "NO_ANSWER" | "BUSY" | "FAILED" | "UNAVAILABLE";

/** Durable, tenant-scoped audit records. Payloads contain only already-masked handoff data. */
export async function persistAgentHandoffContext(context: AgentHandoffContext): Promise<void> {
  await prisma.callEvent.create({ data: {
    callId: context.callId, type: CallEventType.HUMAN_TRANSFER, message: "Agent handoff context prepared",
    payload: { tenantId: context.tenantId, provider: context.provider, contactId: context.contactId, intent: context.customerIntent, department: context.department, language: context.language, authenticated: context.authenticated, currentIvrNodeId: context.currentIvrNodeId, conversationSummary: context.conversationSummary, recentTranscript: context.recentTranscript, collectedFields: context.collectedFields, toolsExecuted: context.toolsExecuted, unresolvedQuestion: context.unresolvedQuestion, sentiment: context.sentiment, callbackEligible: context.callbackEligible, createdAt: context.createdAt },
  } });
}

export async function persistTransferLifecycle(callId: string, stage: PersistedTransferLifecycle, metadata: Record<string, unknown> = {}): Promise<void> {
  await prisma.callEvent.create({ data: { callId, type: CallEventType.HUMAN_TRANSFER, message: `Agent transfer ${stage}`, payload: { stage, ...metadata } } });
  try {
    await publishOutboundCallLinkedEvent(
      callId,
      OUTBOUND_REALTIME_EVENTS.TRANSFER_UPDATED,
      {
        transferStatus: stage,
        transferred: stage === "CONNECTED" || stage === "COMPLETED",
      }
    );
  } catch {
    // Transfer persistence is canonical; realtime observability is best effort.
  }
}

/** A failed Plivo Dial action cannot safely reattach Gemini media to its A-leg.
 * Keep a safe, tenant-visible follow-up marker instead of pretending the caller
 * has returned to the AI. A later authenticated channel can explicitly confirm
 * and create the real callback request. */
export async function persistCallbackFollowUpOffer(callId: string, reason: "NO_ANSWER" | "BUSY" | "FAILED"): Promise<void> {
  await prisma.callEvent.create({ data: { callId, type: CallEventType.HUMAN_TRANSFER, message: "Callback follow-up requires confirmation", payload: { stage: "CALLBACK_OFFERED", reason, confirmationRequired: true, mediaReturnSupported: false } } });
}

export async function listSafeTransferAudit(tenantId: string, callId: string) {
  const call = await prisma.call.findFirst({ where: { id: callId, tenantId }, select: { id: true } });
  if (!call) return [];
  return prisma.callEvent.findMany({ where: { callId, type: CallEventType.HUMAN_TRANSFER }, select: { createdAt: true, message: true, payload: true }, orderBy: { createdAt: "desc" } });
}
