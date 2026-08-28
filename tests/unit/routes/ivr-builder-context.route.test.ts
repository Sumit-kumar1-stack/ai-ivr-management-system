import { UserRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  resolveIVRBuilderContext: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/services/ivr/ivr-builder-catalog.service", () => ({
  resolveIVRBuilderContext: mocks.resolveIVRBuilderContext,
}));

import { GET } from "@/app/api/ivr-builder/context/route";

describe("ivr builder context route", () => {
  it("returns the tenant-safe builder context for campaign binding", async () => {
    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
      campaignCapabilities: [],
    });

    mocks.resolveIVRBuilderContext.mockResolvedValue({
      currentUser: {
        id: "user-1",
        role: UserRole.ADMIN,
        tenantId: "tenant-a",
        campaignCapabilities: [],
      },
      target: {
        kind: "CAMPAIGN",
        campaignId: "campaign-123",
        returnTo: "/communication/campaigns/123",
      },
      catalog: {
        supportedNodeKinds: ["START"],
        supportedChannels: [],
        knowledgeDocuments: [],
        actions: [],
        transferDestinations: [],
        callbackConfigurations: [],
        approvedMessageTemplates: [],
        inboundProfiles: [],
        campaigns: [],
        businessHoursPolicies: [],
        authenticationLevels: [],
        warnings: [],
      },
      templates: [],
    });

    const request = new NextRequest(
      "https://example.com/api/ivr-builder/context?campaignId=campaign-123&returnTo=%2Fcommunication%2Fcampaigns%2F123",
      {
        method: "GET",
      }
    );

    const response = await GET(request, {
      params: Promise.resolve({}),
    } as never);
    const payload = await response.json();
    const [passedUser, passedInput] = mocks.resolveIVRBuilderContext.mock.calls[0] ?? [];

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalled();
    expect(passedUser.id).toBe("user-1");
    expect(passedUser.role).toBe(UserRole.ADMIN);
    expect(passedUser.tenantId).toBe("tenant-a");
    expect(passedInput).toEqual({
      campaignId: "campaign-123",
      inboundProfileId: null,
      returnTo: "/communication/campaigns/123",
    });
    expect(payload.success).toBe(true);
    expect(payload.data.target.kind).toBe("CAMPAIGN");
  });
});
