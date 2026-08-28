import { describe, expect, it } from "vitest";

import { getFlowValidationDisplay, maskInboundNumber } from "@/components/ivr/ivr-flow-management.helpers";

describe("IVR flow management display", () => {
  it("keeps published validation separate from a new draft validation state", () => {
    expect(getFlowValidationDisplay({
      validationStatus: "NOT_VALIDATED",
      versions: [{ status: "PUBLISHED", validationStatus: "VALID" }],
    })).toEqual({ draftValidation: "NOT_VALIDATED", publishedValidation: "VALID" });
  });

  it("does not invent a published validation state when no version is published", () => {
    expect(getFlowValidationDisplay({ validationStatus: "VALID", versions: [{ status: "DRAFT", validationStatus: "VALID" }] }).publishedValidation).toBeNull();
  });

  it("masks inbound numbers while retaining the final four digits", () => {
    expect(maskInboundNumber("+918031150064")).toBe("+91••••0064");
  });
});
