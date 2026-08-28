import { createHmac, timingSafeEqual } from "node:crypto";
import { getPlivoEnvironment } from "@/config/env";

/** Authenticates the media URL embedded in a Plivo stream request without
 * exposing the account Auth Token on the wire. */
export function createPlivoStreamToken(callId: string): string {
  return createHmac("sha256", getPlivoEnvironment().authToken).update(`plivo-media:${callId}`).digest("base64url");
}
export function isValidPlivoStreamToken(callId: string, token: string | null): boolean {
  if (!callId || !token) return false;
  const expected = Buffer.from(createPlivoStreamToken(callId)); const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
