import { createHmac, timingSafeEqual } from "node:crypto";

export const BILLING_WEBHOOK_SIGNATURE_HEADER =
  "x-billing-signature";

export function getBillingWebhookSecret(): string {
  const secret = process.env.BILLING_WEBHOOK_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "BILLING_WEBHOOK_SECRET must be configured for billing webhooks."
    );
  }

  return secret;
}

export function verifyBillingWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  const secret = getBillingWebhookSecret();

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature.trim(), "hex");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}
