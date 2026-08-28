import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  selectRuntime: vi.fn(),
}));

vi.mock("@/services/ivr/ivr-runtime-selector.service", () => ({
  selectRuntime: mocks.selectRuntime,
}));

import {
  buildOutboundAudienceSnapshot,
  buildOutboundCampaignReviewSummary,
  evaluateOutboundContactEligibility,
  validateOutboundCampaign,
} from "@/services/communication/outbound-campaign-validation.service";

const now = new Date("2026-08-28T04:30:00.000Z");

const tenant = {
  tenantId: "tenant-a",
  timezone: "UTC",
  provider: "TWILIO",
  premiumVoiceEnabled: true,
} as const;

const launchableCampaign = {
  id: "campaign-a",
  tenantId: "tenant-a",
  ownerUserId: "owner-a",
  name: "Outbound campaign",
  status: "READY",
  approvalStatus: "APPROVED",
  runtime: {
    mode: "STANDARD" as const,
    defaultRuntime: "STANDARD" as const,
    provider: "TWILIO",
  },
  provider: "TWILIO",
  callerId: "+14155550123",
  consentRequired: true,
  concurrency: 2,
  dailyAttemptLimit: 3,
  totalAttemptLimit: 10,
  terminalDispositions: ["COMPLETED"],
} as const;

const audienceContact = {
  id: "contact-a",
  tenantId: "tenant-a",
  ownerUserId: "owner-a",
  fullName: "Ada",
  phone: "+14155550124",
  language: "English",
  consentStatus: "OPTED_IN" as const,
  dnc: false,
  suppressed: false,
  attemptCount: 1,
  totalAttemptCount: 2,
  lastDisposition: null,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectRuntime.mockImplementation(
    ({ flow, tenant: runtimeTenant }) => {
      const mode = flow?.runtimeMode ?? null;

      if (mode === "PREMIUM" && !runtimeTenant?.premiumVoiceEnabled) {
        return {
          selectedRuntime: "STANDARD",
          reasonCode: "EXPLICIT_RUNTIME_UNSUPPORTED",
          reasonText: "Premium runtime requires a premium entitlement.",
        };
      }

      if (mode === "AUTO") {
        return {
          selectedRuntime: "STANDARD",
          reasonCode: "AUTO_DEFAULT_RUNTIME",
          reasonText: "AUTO runtime uses the configured default runtime.",
        };
      }

      return {
        selectedRuntime: mode === "PREMIUM" ? "PREMIUM" : "STANDARD",
        reasonCode: mode === "PREMIUM" ? "EXPLICIT_PREMIUM" : "EXPLICIT_STANDARD",
        reasonText:
          mode === "PREMIUM"
            ? "Flow configuration explicitly selected the Premium runtime."
            : "Flow configuration explicitly selected the Standard runtime.",
      };
    }
  );
});

describe("outbound campaign audience snapshot", () => {
  it("deduplicates contacts by normalized phone number", () => {
    const snapshot = buildOutboundAudienceSnapshot({
      sourceId: "segment-1",
      sourceName: "Segment A",
      tenantId: "tenant-a",
      contacts: [
        {
          id: "contact-1",
          tenantId: "tenant-a",
          ownerUserId: "owner-a",
          fullName: "First",
          phone: "+14155550124",
          language: "English",
        },
        {
          id: "contact-2",
          tenantId: "tenant-a",
          ownerUserId: "owner-a",
          fullName: "Second",
          phone: "+1 415 555 0124",
          language: "English",
        },
      ],
    });

    expect(snapshot.recipientCount).toBe(1);
    expect(snapshot.recipients[0]).toMatchObject({
      id: "contact-2",
      fullName: "Second",
      phone: "+14155550124",
    });
  });

  it("rejects invalid phone numbers", () => {
    expect(() =>
      buildOutboundAudienceSnapshot({
        sourceId: null,
        sourceName: "Audience",
        tenantId: "tenant-a",
        contacts: [
          {
            id: "contact-1",
            tenantId: "tenant-a",
            ownerUserId: "owner-a",
            phone: "12345",
          },
        ],
      })
    ).toThrow("Invalid audience phone number");
  });

  it("rejects cross-tenant contacts", () => {
    expect(() =>
      buildOutboundAudienceSnapshot({
        sourceId: null,
        sourceName: "Audience",
        tenantId: "tenant-a",
        contacts: [
          {
            id: "contact-1",
            tenantId: "tenant-b",
            ownerUserId: "owner-b",
            phone: "+14155550124",
          },
        ],
      })
    ).toThrow("Cross-tenant contacts cannot be added to an outbound campaign");
  });

  it("keeps the snapshot stable after the source input changes", () => {
    const source = [
      {
        id: "contact-1",
        tenantId: "tenant-a",
        ownerUserId: "owner-a",
        fullName: "Stable",
        phone: "+14155550125",
      },
    ];

    const snapshot = buildOutboundAudienceSnapshot({
      sourceId: "segment-1",
      sourceName: "Segment A",
      tenantId: "tenant-a",
      contacts: source,
    });

    source[0].fullName = "Changed";
    source[0].phone = "+14155550126";

    expect(snapshot).toMatchObject({
      sourceId: "segment-1",
      sourceName: "Segment A",
      recipientCount: 1,
      recipients: [
        {
          id: "contact-1",
          fullName: "Stable",
          phone: "+14155550125",
        },
      ],
    });
  });
});

describe("outbound contact eligibility", () => {
  it("accepts an eligible contact", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: launchableCampaign,
      contact: audienceContact,
      now,
    });

    expect(result).toEqual({
      allowed: true,
      reasonCode: "ELIGIBLE",
      reasonText: "Contact is eligible for outbound launch.",
    });
  });

  it("blocks missing consent", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: launchableCampaign,
      contact: {
        ...audienceContact,
        consentStatus: "UNKNOWN",
      },
      now,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "CONSENT_REQUIRED",
    });
  });

  it("blocks DNC contacts", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: launchableCampaign,
      contact: {
        ...audienceContact,
        dnc: true,
      },
      now,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "DNC_ACTIVE",
    });
  });

  it("blocks suppressed contacts", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: launchableCampaign,
      contact: {
        ...audienceContact,
        suppressed: true,
      },
      now,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "SUPPRESSION_ACTIVE",
    });
  });

  it("blocks contacts outside business hours", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: {
        ...launchableCampaign,
        businessHoursPolicy: {
          timezone: "UTC",
          enabledDays: [5],
          startTime: "09:00",
          endTime: "17:00",
        },
      },
      contact: audienceContact,
      now: new Date("2026-08-28T23:30:00.000Z"),
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "OUTSIDE_CALLING_HOURS",
    });
  });

  it("blocks contacts that reached the daily attempt limit", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: {
        ...launchableCampaign,
        dailyAttemptLimit: 2,
      },
      contact: {
        ...audienceContact,
        attemptCount: 2,
      },
      now,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "DAILY_ATTEMPT_LIMIT_REACHED",
    });
  });

  it("blocks contacts that reached the total attempt limit", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: {
        ...launchableCampaign,
        totalAttemptLimit: 2,
      },
      contact: {
        ...audienceContact,
        totalAttemptCount: 2,
      },
      now,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "TOTAL_ATTEMPT_LIMIT_REACHED",
    });
  });

  it("blocks contacts that already reached a terminal disposition", () => {
    const result = evaluateOutboundContactEligibility({
      tenant,
      campaign: launchableCampaign,
      contact: {
        ...audienceContact,
        lastDisposition: "COMPLETED",
      },
      now,
    });

    expect(result).toMatchObject({
      allowed: false,
      reasonCode: "TERMINAL_DISPOSITION_BLOCKED",
    });
  });
});

describe("outbound campaign validation", () => {
  it("accepts a valid draft campaign", () => {
    const result = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        status: "DRAFT",
        approvalStatus: "DRAFT",
        runtime: {
          mode: "STANDARD",
          defaultRuntime: "STANDARD",
          provider: "TWILIO",
        },
        concurrency: 2,
      },
      audience: [audienceContact],
      now,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.audienceCount).toBe(1);
    expect(result.eligibleCount).toBe(1);
  });

  it("flags an invalid draft when no audience exists", () => {
    const result = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        status: "DRAFT",
        approvalStatus: "DRAFT",
      },
      audience: [],
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map(issue => issue.code)).toContain("AUDIENCE_MISSING");
  });

  it("accepts a published IVR binding and rejects draft or cross-tenant bindings", () => {
    const published = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        ivrFlowId: "flow-a",
        ivrFlowVersionId: "version-a",
        publishedIvrVersionId: "version-a",
        ivrVersionStatus: "PUBLISHED",
        ivrFlowTenantId: "tenant-a",
      },
      audience: [audienceContact],
      now,
    });

    const draftBinding = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        ivrFlowId: "flow-a",
        ivrFlowVersionId: null,
        publishedIvrVersionId: null,
        ivrVersionStatus: "DRAFT",
        ivrFlowTenantId: "tenant-a",
      },
      audience: [audienceContact],
      now,
    });

    const crossTenant = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        ivrFlowId: "flow-b",
        ivrFlowVersionId: "version-b",
        publishedIvrVersionId: "version-b",
        ivrVersionStatus: "PUBLISHED",
        ivrFlowTenantId: "tenant-b",
      },
      audience: [audienceContact],
      now,
    });

    expect(published.valid).toBe(true);
    expect(published.errors.map(issue => issue.code)).not.toContain("PUBLISHED_IVR_REQUIRED");
    expect(draftBinding.errors.map(issue => issue.code)).toContain("PUBLISHED_IVR_REQUIRED");
    expect(crossTenant.errors.map(issue => issue.code)).toContain("CROSS_TENANT_IVR_REJECTED");
  });

  it("keeps warning and info severities non-blocking", () => {
    const result = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        runtime: {
          mode: "AUTO",
          defaultRuntime: "STANDARD",
          provider: "TWILIO",
        },
        businessHoursPolicy: {
          timezone: "UTC",
          enabledDays: [5],
          startTime: "09:00",
          endTime: "17:00",
        },
      },
      audience: [audienceContact],
      now: new Date("2026-08-28T23:30:00.000Z"),
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.map(issue => issue.code)).toContain("OUTSIDE_CALLING_HOURS");
    expect(result.issues.map(issue => issue.severity)).toContain("INFO");
  });

  it("flags Premium runtime as denied when the tenant is not entitled", () => {
    const result = validateOutboundCampaign({
      tenant: {
        ...tenant,
        premiumVoiceEnabled: false,
      },
      campaign: {
        ...launchableCampaign,
        runtime: {
          mode: "PREMIUM",
          defaultRuntime: "STANDARD",
          provider: "TWILIO",
        },
      },
      audience: [audienceContact],
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map(issue => issue.code)).toContain("PREMIUM_ENTITLEMENT_REQUIRED");
  });

  it("rejects a provider/runtime mismatch", () => {
    const result = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        runtime: {
          mode: "STANDARD",
          defaultRuntime: "STANDARD",
          provider: "PLIVO",
        },
        provider: "TWILIO",
      },
      audience: [audienceContact],
      now,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.map(issue => issue.code)).toContain("PROVIDER_RUNTIME_MISMATCH");
  });

  it("accepts Premium runtime when the tenant is entitled", () => {
    const result = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        runtime: {
          mode: "PREMIUM",
          defaultRuntime: "STANDARD",
          provider: "TWILIO",
        },
      },
      audience: [audienceContact],
      now,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("blocks unauthorized transfer, callback, and follow-up configuration", () => {
    const result = validateOutboundCampaign({
      tenant,
      campaign: {
        ...launchableCampaign,
        transferConfigured: true,
        transferAuthorized: false,
        callbackConfigured: true,
        callbackAuthorized: false,
        followUpTemplateAuthorized: false,
      },
      audience: [audienceContact],
      now,
    });

    expect(result.errors.map(issue => issue.code)).toEqual(
      expect.arrayContaining([
        "TRANSFER_DESTINATION_UNAUTHORIZED",
        "CALLBACK_CONFIGURATION_INVALID",
        "FOLLOW_UP_TEMPLATE_UNAUTHORIZED",
      ])
    );
  });
});

describe("outbound campaign review summary", () => {
  it("returns a safe readable summary without raw payloads", () => {
    const summary = buildOutboundCampaignReviewSummary({
      tenant,
      campaign: {
        ...launchableCampaign,
        runtime: {
          mode: "AUTO",
          defaultRuntime: "STANDARD",
          provider: "TWILIO",
        },
        businessHoursPolicy: {
          timezone: "UTC",
          enabledDays: [5],
          startTime: "09:00",
          endTime: "17:00",
        },
      },
      audience: [audienceContact],
      now,
    });

    expect(summary).toMatchObject({
      campaign: {
        id: "campaign-a",
        name: "Outbound campaign",
        tenantId: "tenant-a",
        ownerUserId: "owner-a",
      },
      audienceCount: 1,
      eligibleCount: 1,
      excludedCount: 0,
      provider: "TWILIO",
      callerId: "+14155550123",
    });
    expect(summary.complianceWarnings.every(warning => !warning.includes("Ada"))).toBe(true);
  });
});
