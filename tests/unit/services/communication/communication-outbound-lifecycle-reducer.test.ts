import {
  CommunicationOutboundAttemptStatus as Status,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  normalizePlivoOutboundStatus,
  reduceOutboundAttemptStatus,
} from "@/services/communication/communication-outbound-lifecycle.service";

describe("outbound provider lifecycle reducer", () => {
  it.each([
    ["queued", Status.PROVIDER_ACCEPTED],
    ["ringing", Status.RINGING],
    ["in-progress", Status.ANSWERED],
    ["completed", Status.COMPLETED],
    ["busy", Status.BUSY],
    ["no-answer", Status.NO_ANSWER],
    ["rejected", Status.REJECTED],
    ["cancelled", Status.CANCELED],
    ["unknown-provider-value", Status.FAILED],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizePlivoOutboundStatus(raw)).toBe(expected);
  });

  it("preserves an invalid-number cause independently of provider wording", () => {
    expect(normalizePlivoOutboundStatus("failed", "Invalid destination number")).toBe(Status.INVALID_NUMBER);
  });

  it("ignores duplicates and out-of-order regressions", () => {
    expect(reduceOutboundAttemptStatus(Status.RINGING, Status.RINGING)).toEqual({
      apply: false, duplicate: true, status: Status.RINGING,
    });
    expect(reduceOutboundAttemptStatus(Status.ANSWERED, Status.RINGING)).toEqual({
      apply: false, duplicate: false, status: Status.ANSWERED,
    });
    expect(reduceOutboundAttemptStatus(Status.COMPLETED, Status.RINGING).status).toBe(Status.COMPLETED);
    expect(reduceOutboundAttemptStatus(Status.FAILED, Status.ANSWERED).status).toBe(Status.FAILED);
    expect(reduceOutboundAttemptStatus(Status.CANCELED, Status.RINGING).status).toBe(Status.CANCELED);
  });
});
