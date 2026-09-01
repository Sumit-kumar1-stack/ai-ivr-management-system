/**
 * Generic External Action Integration Gateway
 * 
 * Provides a secure, tenant-isolated boundary for executing external business actions
 * (e.g. CRM, ticketing, lookup, status checks) without exposing internal IVR core,
 * Redis sessions, Prisma tables, or AI internals.
 */

import { isSafeWebhookUrl } from "../developer/developer-security.service";

export type ExternalActionStatus =
  | "SUCCESS"
  | "FAILURE"
  | "PENDING"
  | "TIMEOUT";

export interface ExternalActionRequest {
  actionCode: string;
  integrationId?: string;
  correlationId: string;
  callId: string;
  tenantId: string;
  idempotencyKey?: string;
  input?: Record<string, unknown>;
  requiredAuthLevel?: "AUTH_LEVEL_0" | "AUTH_LEVEL_1" | "AUTH_LEVEL_2";
  currentAuthLevel?: string;
}

export interface ExternalActionResult {
  status: ExternalActionStatus;
  referenceId?: string;
  output?: Record<string, unknown>;
  safeMessage?: string;
  errorReason?: string;
  durationMs: number;
}

export interface ExternalIntegrationEndpointConfig {
  id: string;
  tenantId: string;
  actionCode: string;
  name: string;
  endpointUrl: string;
  timeoutMs?: number;
  requiredAuthLevel?: "AUTH_LEVEL_0" | "AUTH_LEVEL_1" | "AUTH_LEVEL_2";
  secretRef?: string;
  headers?: Record<string, string>;
}

export type ExternalActionAdapter = (
  request: ExternalActionRequest,
  endpoint: ExternalIntegrationEndpointConfig
) => Promise<Omit<ExternalActionResult, "durationMs">>;

// In-memory tenant integration registry (can be backed by DB integration table)
const integrationRegistry = new Map<string, ExternalIntegrationEndpointConfig>();

function getRegistryKey(tenantId: string, actionCode: string): string {
  return `${tenantId.trim()}:${actionCode.trim().toUpperCase()}`;
}

export function registerIntegrationEndpoint(endpoint: ExternalIntegrationEndpointConfig): void {
  if (!endpoint.tenantId?.trim()) {
    throw new Error("Tenant ID is required for registering an integration endpoint.");
  }
  if (!endpoint.actionCode?.trim()) {
    throw new Error("Action code is required for registering an integration endpoint.");
  }
  if (!isSafeExternalIntegrationUrl(endpoint.endpointUrl)) {
    throw new Error(`Endpoint URL "${endpoint.endpointUrl}" is not allowed (must be safe HTTPS endpoint).`);
  }
  const key = getRegistryKey(endpoint.tenantId, endpoint.actionCode);
  integrationRegistry.set(key, {
    ...endpoint,
    actionCode: endpoint.actionCode.trim().toUpperCase(),
    timeoutMs: Math.min(Math.max(endpoint.timeoutMs ?? 5000, 500), 15000),
  });
}

export function unregisterIntegrationEndpoint(tenantId: string, actionCode: string): boolean {
  const key = getRegistryKey(tenantId, actionCode);
  return integrationRegistry.delete(key);
}

export function clearIntegrationRegistry(): void {
  integrationRegistry.clear();
}

export function getIntegrationEndpointsForTenant(tenantId: string): ExternalIntegrationEndpointConfig[] {
  const result: ExternalIntegrationEndpointConfig[] = [];
  for (const endpoint of integrationRegistry.values()) {
    if (endpoint.tenantId === tenantId) {
      result.push({ ...endpoint });
    }
  }
  return result;
}

export function resolveIntegrationEndpoint(
  tenantId: string,
  actionCode: string
): ExternalIntegrationEndpointConfig | null {
  const key = getRegistryKey(tenantId, actionCode);
  return integrationRegistry.get(key) ?? null;
}

export function isSafeExternalIntegrationUrl(url: string): boolean {
  if (!url) return false;
  // Allow test fixtures if running in test environment
  if (process.env.NODE_ENV === "test" && url.startsWith("https://mock-integration.local")) {
    return true;
  }
  return isSafeWebhookUrl(url);
}

// Custom adapter hook for tests or custom enterprise gateways
let customAdapter: ExternalActionAdapter | null = null;

export function setCustomExternalActionAdapter(adapter: ExternalActionAdapter | null): void {
  customAdapter = adapter;
}

/**
 * Execute an external business action across the generic integration boundary.
 */
export async function executeExternalAction(
  request: ExternalActionRequest,
  adapterOverride?: ExternalActionAdapter
): Promise<ExternalActionResult> {
  const startTime = Date.now();

  if (!request.tenantId?.trim()) {
    return {
      status: "FAILURE",
      errorReason: "TENANT_ID_REQUIRED",
      safeMessage: "Tenant context is missing.",
      durationMs: Date.now() - startTime,
    };
  }

  if (!request.actionCode?.trim()) {
    return {
      status: "FAILURE",
      errorReason: "ACTION_CODE_REQUIRED",
      safeMessage: "Action code is missing.",
      durationMs: Date.now() - startTime,
    };
  }

  const endpoint = resolveIntegrationEndpoint(request.tenantId, request.actionCode);
  if (!endpoint) {
    return {
      status: "FAILURE",
      errorReason: "INTEGRATION_NOT_FOUND",
      safeMessage: "Integration endpoint is not configured for this action.",
      durationMs: Date.now() - startTime,
    };
  }

  // Tenant isolation check
  if (endpoint.tenantId !== request.tenantId) {
    return {
      status: "FAILURE",
      errorReason: "CROSS_TENANT_ACCESS_DENIED",
      safeMessage: "Access to cross-tenant integration is denied.",
      durationMs: Date.now() - startTime,
    };
  }

  // Auth Gate enforcement
  const requiredLevel = endpoint.requiredAuthLevel ?? request.requiredAuthLevel;
  if (requiredLevel && requiredLevel !== "AUTH_LEVEL_0") {
    const current = request.currentAuthLevel;
    const isSufficient =
      requiredLevel === "AUTH_LEVEL_1"
        ? current === "AUTH_LEVEL_1" || current === "AUTH_LEVEL_2"
        : current === "AUTH_LEVEL_2";

    if (!isSufficient) {
      return {
        status: "FAILURE",
        errorReason: "AUTH_GATE_REQUIRED",
        safeMessage: "Authentication is required before performing this operation.",
        durationMs: Date.now() - startTime,
      };
    }
  }

  const timeoutMs = endpoint.timeoutMs ?? 5000;
  const adapter = adapterOverride ?? customAdapter ?? defaultHttpAdapter;

  try {
    const rawResult = await adapter(request, endpoint);
    const durationMs = Date.now() - startTime;

    // Normalize semantic status
    let status: ExternalActionStatus = "FAILURE";
    if (rawResult.status === "SUCCESS") status = "SUCCESS";
    else if (rawResult.status === "PENDING") status = "PENDING";
    else if (rawResult.status === "TIMEOUT") status = "TIMEOUT";
    else status = "FAILURE";

    return {
      status,
      referenceId: rawResult.referenceId,
      output: rawResult.output,
      safeMessage: rawResult.safeMessage,
      errorReason: rawResult.errorReason,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" || error.message.toLowerCase().includes("timeout"));

    return {
      status: isTimeout ? "TIMEOUT" : "FAILURE",
      errorReason: isTimeout ? "TIMEOUT" : (error instanceof Error ? error.message : "UNKNOWN_ERROR"),
      safeMessage: isTimeout ? "External action timed out." : "External action failed.",
      durationMs,
    };
  }
}

/**
 * Default HTTP fetch adapter with timeout, headers, and payload limits
 */
async function defaultHttpAdapter(
  request: ExternalActionRequest,
  endpoint: ExternalIntegrationEndpointConfig
): Promise<Omit<ExternalActionResult, "durationMs">> {
  const controller = new AbortController();
  const timeoutMs = endpoint.timeoutMs ?? 5000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Tenant-ID": request.tenantId,
      "X-Call-ID": request.callId,
      "X-Correlation-ID": request.correlationId,
      ...(request.idempotencyKey ? { "X-Idempotency-Key": request.idempotencyKey } : {}),
      ...(endpoint.headers ?? {}),
    };

    const response = await fetch(endpoint.endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        actionCode: endpoint.actionCode,
        callId: request.callId,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        input: request.input ?? {},
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "FAILURE",
        errorReason: `HTTP_${response.status}`,
        safeMessage: "External service returned an error status.",
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Strict status normalization
    const rawStatus = typeof data.status === "string" ? data.status.toUpperCase() : "";
    let status: ExternalActionStatus = "FAILURE";
    if (rawStatus === "SUCCESS") status = "SUCCESS";
    else if (rawStatus === "PENDING") status = "PENDING";
    else if (rawStatus === "TIMEOUT") status = "TIMEOUT";

    return {
      status,
      referenceId: typeof data.referenceId === "string" ? data.referenceId : undefined,
      output: typeof data.output === "object" && data.output !== null ? (data.output as Record<string, unknown>) : undefined,
      safeMessage: typeof data.safeMessage === "string" ? data.safeMessage : undefined,
      errorReason: typeof data.errorReason === "string" ? data.errorReason : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
