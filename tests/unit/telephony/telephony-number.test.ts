import { describe, expect, it } from "vitest";
import { normalizeInboundProviderNumber, normalizePlivoPstnNumber, normalizePstnNumber } from "@/lib/telephony-number";
import { normalizePlivoInboundPayload } from "@/providers/telephony/plivo.provider";

describe("provider PSTN number normalization", () => {
  it.each([
    ["+918031150064", "+918031150064"],
    ["+91 80 3115 0064", "+918031150064"],
    ["+91-80-3115-0064", "+918031150064"],
    ["tel:+918031150064", "+918031150064"],
    ["918031150064", "+918031150064"],
  ])("normalizes supported Plivo callback To form %s", (input, expected) => {
    expect(normalizePlivoPstnNumber(input)).toBe(expected);
  });

  it("does not infer a country code for local, malformed, or non-Plivo values", () => {
    expect(normalizePlivoPstnNumber("08031150064")).toBeNull();
    expect(normalizePlivoPstnNumber("not-a-number")).toBeNull();
    expect(normalizePstnNumber("918031150064")).toBeNull();
    expect(normalizeInboundProviderNumber("TWILIO", "918031150064")).toBeNull();
  });

  it("normalizes Plivo callback numbers but never normalizes CallUUID", () => {
    expect(normalizePlivoInboundPayload({ CallUUID: "call-uuid-1", From: "+91 80 3115 0099", To: "918031150064" })).toEqual({ providerCallId: "call-uuid-1", callerNumber: "+918031150099", calledNumber: "+918031150064" });
  });
});
