/**
 * Generic Tenant Platform Webhook & Event Model
 * 
 * Provides safe, tenant-scoped event payloads for external platforms.
 * Strips secrets, raw Redis state, and internal DB specifics.
 */

import { randomUUID } from "node:crypto";

export type PlatformEventType =
  | "call.started"
  | "call.answered"
  | "call.completed"
  | "ivr.node.entered"
  | "ivr.action.requested"
  | "ivr.action.completed"
  | "transfer.requested";

export interface TenantPlatformWebhookEvent {
  eventId: string;
  tenantId: string;
  timestamp: string;
  eventType: PlatformEventType;
  callId: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export function createTenantPlatformEventPayload(
  tenantId: string,
  eventType: PlatformEventType,
  callId: string,
  correlationId: string,
  rawPayload: Record<string, unknown> = {}
): TenantPlatformWebhookEvent {
  // Sanitize payload: strip any sensitive tokens, secrets, or internal engine details
  const sanitizedPayload: Record<string, unknown> = {};
  const forbiddenKeys = new Set([
    "secret",
    "password",
    "apikey",
    "token",
    "redis",
    "prisma",
    "connectionstring",
    "privatekey",
  ]);

  for (const [key, value] of Object.entries(rawPayload)) {
    const lowerKey = key.toLowerCase();
    let isForbidden = false;
    for (const forbidden of forbiddenKeys) {
      if (lowerKey.includes(forbidden)) {
        isForbidden = true;
        break;
      }
    }
    if (!isForbidden) {
      sanitizedPayload[key] = value;
    }
  }

  return {
    eventId: `evt_${randomUUID()}`,
    tenantId: tenantId.trim(),
    timestamp: new Date().toISOString(),
    eventType,
    callId: callId.trim(),
    correlationId: correlationId?.trim() || callId.trim(),
    payload: sanitizedPayload,
  };
}
