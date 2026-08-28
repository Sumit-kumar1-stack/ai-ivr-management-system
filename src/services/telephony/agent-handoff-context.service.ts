import { prisma } from "@/lib/prisma";
import { IVRFlowSessionService } from "@/services/ivr/ivr-flow-session.service";

export interface AgentHandoffContext {
  callId: string; tenantId: string | null; provider: string; contactId: string | null;
  customerIntent: string | null; department: string | null; language: string | null;
  authenticated: boolean; currentIvrNodeId: string | null; conversationSummary: string | null;
  recentTranscript: string[]; collectedFields: Record<string, string>; toolsExecuted: string[];
  unresolvedQuestion: string | null; sentiment: string | null; callbackEligible: boolean; createdAt: string;
}

/** Builds the single staff-facing transfer context from persisted call/conversation/IVR state. */
export async function buildAgentHandoffContext(callId: string): Promise<AgentHandoffContext | null> {
  const [call, session, toolExecutions] = await Promise.all([
    prisma.call.findUnique({ where: { id: callId }, select: {
      id: true, tenantId: true, provider: true, contactId: true, language: true, authenticationVerifiedAt: true,
      inboundProfile: { select: { callbackEnabled: true } },
      conversation: { select: { summary: true, intent: true, sentiment: true, messages: { orderBy: { createdAt: "desc" }, take: 6, select: { role: true, content: true } } } },
    } }),
    IVRFlowSessionService.get(callId),
    prisma.toolExecution.findMany({ where: { callId }, orderBy: { createdAt: "desc" }, take: 12, select: { tool: true, status: true } }),
  ]);
  if (!call) return null;
  const transcript = [...(call.conversation?.messages ?? [])].reverse().map(message => `${message.role}: ${maskSensitiveData(message.content)}`);
  const collectedFields = Object.fromEntries(Object.entries(session?.collectedFields ?? {}).map(([key, value]) => [key, maskSensitiveData(value)]));
  return {
    callId: call.id, tenantId: call.tenantId, provider: call.provider, contactId: call.contactId ?? null,
    customerIntent: session?.selectedIntent ?? call.conversation?.intent ?? null,
    department: session?.selectedDepartment ?? null, language: session?.preferredLanguage ?? call.language ?? null,
    authenticated: Boolean(call.authenticationVerifiedAt), currentIvrNodeId: session?.currentNodeId ?? null,
    conversationSummary: call.conversation?.summary ? maskSensitiveData(call.conversation.summary) : null,
    recentTranscript: transcript, collectedFields,
    toolsExecuted: toolExecutions.map(tool => `${tool.tool}:${tool.status}`),
    unresolvedQuestion: transcript.find(line => line.startsWith("USER:"))?.slice(6) ?? null,
    sentiment: call.conversation?.sentiment ?? null, callbackEligible: call.inboundProfile?.callbackEnabled !== false,
    createdAt: new Date().toISOString(),
  };
}

/** Removes secrets while retaining only the final four digits of account/card-like values. */
export function maskSensitiveData(value: string): string {
  return value
    .replace(/\b(otp|pin|cvv|password|passcode)\s*[:=-]?\s*\S+/gi, "$1: [REDACTED]")
    .replace(/\b(authorization|api[-_ ]?key|access[-_ ]?token|bearer)\s*[:=-]?\s*\S+/gi, "$1: [REDACTED]")
    .replace(/\b(?:\d[ -]?){12,19}\d\b/g, raw => `**** **** **** ${raw.replace(/\D/g, "").slice(-4)}`)
    .replace(/\b(?:account|acct)\s*(?:number|no)?\s*[:=-]?\s*\d{6,}\b/gi, raw => raw.replace(/\d{6,}/, digits => `******${digits.slice(-4)}`));
}
