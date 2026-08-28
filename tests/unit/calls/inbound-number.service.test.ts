import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      inboundNumber: {
        findFirst: vi.fn(),
      },
      resolveBilling: vi.fn(),
      logger: {
        warn: vi.fn(),
      },
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      inboundNumber: mocks.inboundNumber,
    },
  })
);

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger: () => mocks.logger,
    normalizeError: (error: unknown) => error,
  })
);

vi.mock(
  "@/services/billing/tenant-subscription.service",
  () => ({
    resolveTenantBillingContextForTenant:
      mocks.resolveBilling,
  })
);

import {
  resolveActiveInboundConfiguration,
} from "@/services/calls/inbound-number.service";

describe(
  "resolveActiveInboundConfiguration",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
        mocks.resolveBilling.mockResolvedValue({
          launchAllowed: true,
          tenantEntitlements: new Set(["AI_VOICE"]),
          premiumVoiceEnabled: false,
        });
      }
    );

    it(
      "derives the inbound tenant from the active provider number",
      async () => {
        mocks.inboundNumber.findFirst.mockResolvedValue({
          id: "number-1",
          tenantId: "tenant-a",
          inboundProfileId: "profile-a",
          inboundProfile: {
            defaultLanguage: "Hindi",
            knowledgeDocumentIds: ["document-a"],
            callbackEnabled: true,
            transferEnabled: false,
            voiceRuntime: "CASCADED",
          },
        });

        await expect(
          resolveActiveInboundConfiguration({
            provider: "twilio",
            calledNumber: "+91 (40) 1234-5678",
          })
        ).resolves.toEqual({
          configured: true,
          configuration: {
            inboundNumberId: "number-1",
            tenantId: "tenant-a",
            inboundProfileId: "profile-a",
            defaultLanguage: "Hindi",
            knowledgeDocumentIds: ["document-a"],
            callbackEnabled: true,
            transferEnabled: false,
            requestedRuntime: "CASCADED",
          },
        });

        expect(
          mocks.inboundNumber.findFirst
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              provider: "TWILIO",
              providerNumber: "+914012345678",
              active: true,
            }),
          })
        );
      }
    );

    it.each([
      ["+918031150064"],
      ["+91 80 3115 0064"],
      ["+91-80-3115-0064"],
      ["tel:+918031150064"],
      ["918031150064"],
    ])("resolves supported Plivo callback number format %s with an exact canonical lookup", async calledNumber => {
      mocks.inboundNumber.findFirst.mockResolvedValue(null);

      await expect(resolveActiveInboundConfiguration({ provider: "PLIVO", calledNumber })).resolves.toEqual({ configured: false, reason: "NUMBER_NOT_CONFIGURED" });

      expect(mocks.inboundNumber.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ provider: "PLIVO", providerNumber: "+918031150064", active: true, inboundProfile: { active: true } }),
      }));
    });

    it("rejects invalid local-only values before any lookup", async () => {
      await expect(resolveActiveInboundConfiguration({ provider: "PLIVO", calledNumber: "08031150064" })).resolves.toEqual({ configured: false, reason: "NUMBER_NOT_CONFIGURED" });
      expect(mocks.inboundNumber.findFirst).not.toHaveBeenCalled();
    });

    it("never performs a suffix-only or cross-provider lookup", async () => {
      mocks.inboundNumber.findFirst.mockResolvedValue(null);
      await resolveActiveInboundConfiguration({ provider: "PLIVO", calledNumber: "+918031150065" });
      expect(mocks.inboundNumber.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ provider: "PLIVO", providerNumber: "+918031150065" }) }));

      await resolveActiveInboundConfiguration({ provider: "TWILIO", calledNumber: "+918031150064" });
      expect(mocks.inboundNumber.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ provider: "TWILIO", providerNumber: "+918031150064" }) }));
    });
    it(
      "denies an unknown inbound number without selecting a tenant",
      async () => {
        mocks.inboundNumber.findFirst.mockResolvedValue(null);

        await expect(
          resolveActiveInboundConfiguration({
            provider: "TWILIO",
            calledNumber: "+911111111111",
          })
        ).resolves.toEqual({
          configured: false,
          reason: "NUMBER_NOT_CONFIGURED",
        });

        expect(
          mocks.resolveBilling
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "denies a configured number when the tenant is not eligible",
      async () => {
        mocks.inboundNumber.findFirst.mockResolvedValue({
          id: "number-1",
          tenantId: "tenant-a",
          inboundProfileId: "profile-a",
          inboundProfile: {
            defaultLanguage: "English",
            knowledgeDocumentIds: [],
            callbackEnabled: true,
            transferEnabled: false,
            voiceRuntime: "CASCADED",
          },
        });
        mocks.resolveBilling.mockResolvedValue({
          launchAllowed: false,
          tenantEntitlements: new Set(),
        });

        await expect(
          resolveActiveInboundConfiguration({
            provider: "TWILIO",
            calledNumber: "+914012345678",
          })
        ).resolves.toEqual({
          configured: false,
          reason: "TENANT_NOT_ELIGIBLE",
        });
      }
    );

    it("allows a persisted Premium inbound runtime only for a Premium-entitled tenant", async () => {
      mocks.inboundNumber.findFirst.mockResolvedValue({
        id: "number-1",
        tenantId: "tenant-a",
        inboundProfileId: "profile-a",
        inboundProfile: {
          defaultLanguage: "English",
          knowledgeDocumentIds: [],
          callbackEnabled: true,
          transferEnabled: true,
          ivrFlowVersionId: "version-1",
          voiceRuntime: "GEMINI_LIVE",
        },
      });
      mocks.resolveBilling.mockResolvedValue({
        launchAllowed: true,
        tenantEntitlements: new Set(["AI_VOICE", "PREMIUM_VOICE"]),
        premiumVoiceEnabled: true,
      });

      await expect(resolveActiveInboundConfiguration({
        provider: "TWILIO",
        calledNumber: "+914012345678",
      })).resolves.toMatchObject({
        configured: true,
        configuration: {
          requestedRuntime: "GEMINI_LIVE",
          ivrFlowVersionId: "version-1",
        },
      });
    });

    it("rejects a Premium inbound profile without the Premium entitlement", async () => {
      mocks.inboundNumber.findFirst.mockResolvedValue({
        id: "number-1",
        tenantId: "tenant-a",
        inboundProfileId: "profile-a",
        inboundProfile: {
          defaultLanguage: "English",
          knowledgeDocumentIds: [],
          callbackEnabled: true,
          transferEnabled: false,
          voiceRuntime: "GEMINI_LIVE",
        },
      });

      await expect(resolveActiveInboundConfiguration({
        provider: "TWILIO",
        calledNumber: "+914012345678",
      })).resolves.toEqual({
        configured: false,
        reason: "PREMIUM_VOICE_NOT_ENTITLED",
      });
    });
  }
);
