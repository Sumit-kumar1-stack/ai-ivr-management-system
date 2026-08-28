import { NextRequest } from "next/server";

import { UserRole } from "@prisma/client";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptTenantInvitation: vi.fn(),
  signToken: vi.fn(),
}));

vi.mock("@/features/onboarding/onboarding.service", () => ({
  acceptTenantInvitation: mocks.acceptTenantInvitation,
  getTenantInvitationByToken: vi.fn(),
}));

vi.mock("@/lib/jwt", () => ({
  signToken: mocks.signToken,
}));

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { POST } from "@/app/api/onboarding/invitations/[token]/route";

describe("onboarding invitation acceptance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.acceptTenantInvitation.mockResolvedValue({
      id: "user-2",
      email: "approver@ivr.com",
      role: UserRole.ADMIN,
      fullName: "Campaign Approver",
    });
    mocks.signToken.mockReturnValue("signed-token");
  });

  it("sets the auth cookie after accepting an invitation", async () => {
    const response = await POST(
      new NextRequest(
        "https://example.com/api/onboarding/invitations/invite-token",
        {
          method: "POST",
          body: JSON.stringify({
            fullName: "Campaign Approver",
            password: "Password@123",
          }),
        }
      ),
      {
        params: Promise.resolve({
          token: "invite-token",
        }),
      }
    );

    expect(response.status).toBe(201);
    expect(mocks.acceptTenantInvitation).toHaveBeenCalledWith(
      "invite-token",
      expect.objectContaining({
        fullName: "Campaign Approver",
      })
    );
    expect(response.headers.get("set-cookie") ?? "").toContain(AUTH_COOKIE_NAME);
  });
});
