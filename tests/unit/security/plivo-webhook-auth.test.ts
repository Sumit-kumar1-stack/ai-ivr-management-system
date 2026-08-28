import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createPlivoAuthErrorResponse, PlivoWebhookAuthenticationError, validatePlivoWebhook } from "@/lib/plivo-webhook-auth";

const env = {
  PLIVO_AUTH_ID: "MA-test",
  PLIVO_AUTH_TOKEN: "plivo-test-token",
  PLIVO_CALLER_ID: "+14155550123",
  PLIVO_PUBLIC_BASE_URL: "https://obviously-ideal-roughly-always.trycloudflare.com",
  PLIVO_MEDIA_PUBLIC_URL: "wss://barn-reabsorb-banker.ngrok-free.dev",
};

type FormValue = string | string[];

function configureEnv() { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); }

/** The Plivo SDK exposes validation, not signature creation. This mirrors its
 * documented V3 fixture shape solely to generate non-secret test requests. */
function createSdkCompatibleV3Signature(method: "GET" | "POST", url: string, nonce: string, params: Record<string, FormValue>, authToken = env.PLIVO_AUTH_TOKEN): string {
  const parsed = new URL(url);
  const query = new URLSearchParams(parsed.search);
  const sortedQuery = [...query.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  const base = `${parsed.origin}${parsed.pathname}${sortedQuery.length ? `?${sortedQuery.map(([key, value]) => `${key}=${value}`).join("&")}` : method === "POST" && Object.keys(params).length ? "?" : ""}`;
  const sortedParams = Object.keys(params).sort().flatMap(key => {
    const values = Array.isArray(params[key]) ? params[key] : [params[key]];
    return [...values].sort().map(value => `${key}${value}`);
  }).join("");
  const signed = method === "POST" ? `${base}${sortedQuery.length ? "." : ""}${sortedParams}.${nonce}` : `${base}.${nonce}`;
  return createHmac("sha256", authToken).update(signed).digest("base64");
}

function request(pathname: string, params: Record<string, FormValue>, options?: { signature?: string; nonce?: string; authToken?: string; internalOrigin?: string; header?: "x-plivo-signature-v3" | "x-plivo-signature-ma-v3" }) {
  const nonce = options?.nonce ?? "nonce-1";
  const publicUrl = new URL(pathname, `${env.PLIVO_PUBLIC_BASE_URL}/`).toString();
  const signature = options?.signature ?? createSdkCompatibleV3Signature("POST", publicUrl, nonce, params, options?.authToken);
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  return new NextRequest(new URL(pathname, options?.internalOrigin ?? "http://localhost:3000").toString(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(options?.signature === "" ? {} : { [options?.header ?? "x-plivo-signature-v3"]: signature }), ...(options?.nonce === "" ? {} : { "x-plivo-signature-v3-nonce": nonce }) },
    body: form.toString(),
  });
}

async function expectForbidden(input: NextRequest) {
  const error = await validatePlivoWebhook(input).then(() => null).catch(reason => reason);
  expect(error).toBeInstanceOf(PlivoWebhookAuthenticationError);
  expect(createPlivoAuthErrorResponse(error)?.status).toBe(403);
}

describe("Plivo V3 webhook authentication", () => {
  it("accepts an SDK-compatible V3 inbound signature using the configured Cloudflare origin", async () => {
    configureEnv();
    const params = { CallUUID: "uuid-1", From: "+14155550124", To: "+14155550123" };
    await expect(validatePlivoWebhook(request("/api/plivo/inbound", params))).resolves.toEqual(params);
  });

  it("rejects invalid and missing signatures with a 403 response", async () => {
    configureEnv();
    const params = { CallUUID: "uuid-1" };
    await expectForbidden(request("/api/plivo/inbound", params, { signature: "invalid" }));
    await expectForbidden(request("/api/plivo/inbound", params, { signature: "" }));
  });

  it("rejects missing nonces, tampered form data, and signatures made with another token", async () => {
    configureEnv();
    const params = { CallUUID: "uuid-1", Digits: "1" };
    await expectForbidden(request("/api/plivo/input", params, { nonce: "" }));
    const signed = request("/api/plivo/input", params);
    const tampered = new NextRequest(signed.url, { method: "POST", headers: signed.headers, body: "CallUUID=uuid-1&Digits=9" });
    await expectForbidden(tampered);
    await expectForbidden(request("/api/plivo/input", params, { authToken: "wrong-token" }));
  });

  it("uses the configured public origin rather than the internal request origin", async () => {
    configureEnv();
    const params = { CallUUID: "uuid-1" };
    await expect(validatePlivoWebhook(request("/api/plivo/status", params, { internalOrigin: "http://localhost:3000" }))).resolves.toEqual(params);
    const localhostUrl = "http://localhost:3000/api/plivo/status";
    const localhostSignature = createSdkCompatibleV3Signature("POST", localhostUrl, "nonce-1", params);
    await expectForbidden(request("/api/plivo/status", params, { signature: localhostSignature }));
  });

  it("accepts Plivo's managed-account V3 signature header", async () => {
    configureEnv();
    const params = { CallUUID: "managed-account-uuid" };
    await expect(validatePlivoWebhook(request("/api/plivo/inbound", params, { header: "x-plivo-signature-ma-v3" }))).resolves.toEqual(params);
  });

  it("preserves repeated form values for SDK validation and downstream processing", async () => {
    configureEnv();
    const params = { CallUUID: "uuid-1", Tag: ["first", "second"] };
    await expect(validatePlivoWebhook(request("/api/plivo/inbound", params))).resolves.toEqual(params);
  });

  it.each([
    ["/api/plivo/status", { CallUUID: "status-uuid", CallStatus: "in-progress" }],
    ["/api/plivo/input?callId=internal-call", { CallUUID: "input-uuid", Digits: "1" }],
    ["/api/plivo/transfer?callId=internal-call", { CallUUID: "transfer-uuid" }],
    ["/api/plivo/transfer/status?callId=internal-call", { CallUUID: "transfer-uuid", DialBLegUUID: "child-uuid", DialAction: "connected" }],
    ["/api/plivo/recording", { call_uuid: "recording-call", recording_id: "recording-1" }],
  ])("accepts official V3 input for %s", async (pathname, params) => {
    configureEnv();
    await expect(validatePlivoWebhook(request(pathname, params))).resolves.toEqual(params);
  });
});
