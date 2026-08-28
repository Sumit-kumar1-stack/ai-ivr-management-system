import {
  CommunicationCampaignStatus as CampaignStatus,
  CommunicationOutboundAttemptStatus as Outcome,
  CommunicationRecipientStatus as RecipientStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { decideOutboundRetry } from "@/services/communication/communication-outbound-retry-policy.service";

const base = {
  attemptNumber: 1,
  maxAttempts: 3,
  campaignStatus: CampaignStatus.RUNNING,
  recipientStatus: RecipientStatus.PROCESSING,
  eligible: true,
  now: new Date("2026-08-31T10:00:00.000Z"),
};

describe("outbound retry policy", () => {
  it.each([Outcome.BUSY, Outcome.NO_ANSWER, Outcome.FAILED, Outcome.PROVIDER_ERROR])(
    "retries bounded transient outcome %s",
    outcome => expect(decideOutboundRetry({ ...base, outcome }).decision).toBe("RETRY")
  );

  it.each([Outcome.COMPLETED, Outcome.INVALID_NUMBER, Outcome.REJECTED, Outcome.CANCELED])(
    "never retries terminal outcome %s",
    outcome => expect(decideOutboundRetry({ ...base, outcome }).decision).toBe("DO_NOT_RETRY")
  );

  it("enforces maximum attempts and mutable eligibility", () => {
    expect(decideOutboundRetry({ ...base, outcome: Outcome.BUSY, attemptNumber: 3 }).reasonCode).toBe("MAX_ATTEMPTS_REACHED");
    expect(decideOutboundRetry({ ...base, outcome: Outcome.BUSY, eligible: false }).reasonCode).toBe("RECIPIENT_INELIGIBLE");
    expect(decideOutboundRetry({ ...base, outcome: Outcome.BUSY, campaignStatus: CampaignStatus.CANCELLED }).reasonCode).toBe("CAMPAIGN_CANCELLED");
  });

  it("defers outside business hours to a deterministic allowed minute", () => {
    const result = decideOutboundRetry({
      ...base,
      outcome: Outcome.BUSY,
      now: new Date("2026-08-30T02:00:00.000Z"),
      businessHoursPolicy: {
        timezone: "UTC",
        enabledDays: [1],
        startTime: "09:00",
        endTime: "17:00",
      },
    });
    expect(result.decision).toBe("DEFER");
    expect(result.reasonCode).toBe("OUTSIDE_CALLING_HOURS");
    expect(result.scheduledFor?.toISOString()).toBe("2026-08-31T09:00:00.000Z");
  });
});
