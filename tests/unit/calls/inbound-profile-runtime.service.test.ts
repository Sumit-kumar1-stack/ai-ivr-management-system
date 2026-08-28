import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  resolveBilling: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inboundProfile: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}));

vi.mock("@/services/billing/tenant-subscription.service", () => ({
  resolveTenantBillingContextForTenant: mocks.resolveBilling,
}));

import {
  updateInboundProfileVoiceRuntime,
} from "@/services/calls/inbound-profile-runtime.service";

const actor = { id: "user-1", tenantId: "tenant-1" };

describe("inbound profile voice runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: "profile-1",
      tenantId: "tenant-1",
      name: "Main line",
    });
    mocks.update.mockImplementation(async ({ data }) => ({
      id: "profile-1",
      name: "Main line",
      voiceRuntime: data.voiceRuntime,
      updatedAt: new Date(),
    }));
  });

  it("saves the Standard cascaded runtime for the actor tenant", async () => {
    await expect(updateInboundProfileVoiceRuntime({
      inboundProfileId: "profile-1",
      voiceRuntime: "CASCADED",
      actor,
    })).resolves.toMatchObject({ voiceRuntime: "CASCADED" });

    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "profile-1", tenantId: "tenant-1" },
    }));
    expect(mocks.resolveBilling).not.toHaveBeenCalled();
  });

  it("saves Premium realtime only when the tenant is entitled", async () => {
    mocks.resolveBilling.mockResolvedValue({ premiumVoiceEnabled: true });

    await expect(updateInboundProfileVoiceRuntime({
      inboundProfileId: "profile-1",
      voiceRuntime: "GEMINI_LIVE",
      actor,
    })).resolves.toMatchObject({ voiceRuntime: "GEMINI_LIVE" });

    expect(mocks.resolveBilling).toHaveBeenCalledWith("tenant-1");
  });

  it("rejects Premium realtime without PREMIUM_VOICE", async () => {
    mocks.resolveBilling.mockResolvedValue({ premiumVoiceEnabled: false });

    await expect(updateInboundProfileVoiceRuntime({
      inboundProfileId: "profile-1",
      voiceRuntime: "GEMINI_LIVE",
      actor,
    })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a profile outside the actor tenant", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(updateInboundProfileVoiceRuntime({
      inboundProfileId: "other-tenant-profile",
      voiceRuntime: "CASCADED",
      actor,
    })).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    expect(mocks.update).not.toHaveBeenCalled();
  });
});
