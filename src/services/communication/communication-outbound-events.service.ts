import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/services/realtime/redis-realtime-bridge.service";
import type { OutboundRealtimeEvent } from "@/types/communication-outbound-operations";
export { OUTBOUND_REALTIME_EVENTS } from "@/types/communication-outbound-operations";

export interface OutboundEventContext {
  tenantId: string;
  campaignId: string;
  attemptId?: string | null;
  callId?: string | null;
}

export function publishOutboundEvent(
  event: OutboundRealtimeEvent,
  context: OutboundEventContext,
  metadata: Record<string, string | number | boolean | null> = {}
): void {
  const tenantId = context.tenantId.trim();
  const campaignId = context.campaignId.trim();
  if (!tenantId || !campaignId) return;

  const payload = {
    tenantId,
    campaignId,
    attemptId: context.attemptId ?? null,
    callId: context.callId ?? null,
    ...sanitizeOutboundEventMetadata(metadata),
    timestamp: Date.now(),
  };
  void publishRealtimeEvent(event, payload).catch(() => {
    // Canonical lifecycle mutation must not fail because observability failed.
  });
}

export function sanitizeOutboundEventMetadata(
  metadata: Record<string, string | number | boolean | null>
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/phone|destination|secret|credential|signature|token|raw|providercallid/i.test(key)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export async function publishOutboundCallLinkedEvent(
  callId: string,
  event: OutboundRealtimeEvent,
  metadata: Record<string, string | number | boolean | null> = {}
): Promise<boolean> {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: {
      id: true,
      tenantId: true,
      communicationCampaignId: true,
      communicationOutboundAttemptId: true,
    },
  });

  if (!call?.tenantId || !call.communicationCampaignId) return false;

  publishOutboundEvent(
    event,
    {
      tenantId: call.tenantId,
      campaignId: call.communicationCampaignId,
      attemptId: call.communicationOutboundAttemptId,
      callId: call.id,
    },
    metadata
  );
  return true;
}
