import { NextRequest, NextResponse } from "next/server";
import { validateV3Signature } from "plivo";
import { getPlivoEnvironment } from "@/config/env";
import { createLogger } from "@/lib/logger";
import { getPlivoPublicCallbackUrl } from "@/lib/plivo-public-url";

const log = createLogger({ component: "plivo-webhook-auth" });
export class PlivoWebhookAuthenticationError extends Error { constructor() { super("Invalid Plivo webhook authentication"); this.name = "PlivoWebhookAuthenticationError"; } }

/** Validates Plivo's current V3 HMAC-SHA256 webhook signature and returns the
 * parsed request only after its exact public callback URL has been verified. */
export type PlivoWebhookParams = Record<string, string | string[]>;

export async function validatePlivoWebhook(request: NextRequest): Promise<PlivoWebhookParams> {
  const config = getPlivoEnvironment();
  const params = await parseParams(request);
  const nonce = request.headers.get("x-plivo-signature-v3-nonce")?.trim() ?? "";
  const signatures = [request.headers.get("x-plivo-signature-v3"), request.headers.get("x-plivo-signature-ma-v3")]
    .filter((value): value is string => Boolean(value?.trim()));
  const publicUrl = getPlivoPublicCallbackUrl(request.nextUrl.pathname, request.nextUrl.searchParams).toString();
  const valid = Boolean(nonce) && signatures.some(signature => validateV3Signature(request.method.toUpperCase(), publicUrl, nonce, config.authToken, signature, params));
  if (!valid) {
    log.warn({ event: "plivo.webhook.authentication_rejected", pathname: request.nextUrl.pathname, publicUrlHost: new URL(publicUrl).host, method: request.method, noncePresent: Boolean(nonce), signaturePresent: signatures.length > 0, parameterCount: Object.keys(params).length, validatorUsed: "plivo.validateV3Signature" }, "Plivo V3 webhook authentication rejected");
    throw new PlivoWebhookAuthenticationError();
  }
  return params;
}

export function createPlivoAuthErrorResponse(error: unknown): NextResponse | null { return error instanceof PlivoWebhookAuthenticationError ? NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) : null; }
async function parseParams(request: NextRequest): Promise<PlivoWebhookParams> {
  const params: PlivoWebhookParams = {};
  const append = (key: string, value: string) => {
    const existing = params[key];
    params[key] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  };
  if (request.method === "GET") { request.nextUrl.searchParams.forEach(append); return params; }
  const form = await request.formData();
  form.forEach((value, key) => { if (typeof value === "string") append(key, value); });
  return params;
}
