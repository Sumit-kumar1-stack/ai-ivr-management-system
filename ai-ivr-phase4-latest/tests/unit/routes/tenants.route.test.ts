import { NextRequest } from "next/server";

import { UserRole } from "@prisma/client";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createTenantInvitation: vi.fn(),
  authErrorResponse: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/auth-response", () => ({
  createAuthErrorResponse: mocks.authErrorResponse,
}));

vi.mock("@/features/onboarding/onboarding.service", () => ({
  createTenantInvitation: mocks.createTenantInvitation,
}));

import { POST } from "@/app/api/tenants/route";

describe("tenant invitation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: UserRole.SUPER_ADMIN,
    });
    mocks.authErrorResponse.mockReturnValue(null);
    mocks.createTenantInvitation.mockResolvedValue({
      tenant: {
        id: "tenant-1",
        name: "Acme Bank",
        slug: "acme-bank",
      },
      invitation: {
        id: "invite-1",
        tenantId: "tenant-1",
        email: "approver@ivr.com",
        fullName: "Campaign Approver",
        role: UserRole.ADMIN,
        status: "PENDING",
        invitedAt: new Date("2026-08-22T00:00:00.000Z"),
        expiresAt: new Date("2026-08-29T00:00:00.000Z"),
      },
      invitationUrl: "/onboarding/invite-token",
    });
  });

  it("creates a tenant invitation for super admins", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/tenants", {
        method: "POST",
        body: JSON.stringify({
          tenantName: "Acme Bank",
          adminFullName: "Campaign Approver",
          adminEmail: "approver@ivr.com",
          adminRole: "ADMIN",
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(mocks.createTenantInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantName: "Acme Bank",
        adminEmail: "approver@ivr.com",
      }),
      "user-1"
    );
  });
});
