import { NextRequest } from "next/server";

import { UserRole } from "@prisma/client";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  createAuthErrorResponse: vi.fn(),
  getUsers: vi.fn(),
  getUsersForTenant: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/auth-response", () => ({
  createAuthErrorResponse: mocks.createAuthErrorResponse,
}));

vi.mock("@/features/users/user.service", () => ({
  UserService: {
    getUsers: mocks.getUsers,
    getUsersForTenant: mocks.getUsersForTenant,
    createUser: mocks.createUser,
  },
}));

import { GET, POST } from "@/app/api/users/route";

describe("users route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.requireRole.mockResolvedValue({
      id: "user-1",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
    });

    mocks.createAuthErrorResponse.mockReturnValue(null);
    mocks.getUsersForTenant.mockResolvedValue([
      {
        id: "user-2",
        fullName: "Tenant User",
        email: "tenant@ivr.com",
        role: UserRole.AGENT,
        phone: null,
        avatar: null,
        tenantId: "tenant-a",
        accountStatus: "ACTIVE",
        emailVerifiedAt: null,
        invitedAt: null,
        onboardingCompletedAt: null,
        isActive: true,
        lastLogin: null,
        createdAt: new Date("2026-08-22T00:00:00.000Z"),
        updatedAt: new Date("2026-08-22T00:00:00.000Z"),
      },
    ]);
    mocks.getUsers.mockResolvedValue([]);
    mocks.createUser.mockResolvedValue({
      id: "user-3",
      fullName: "Created User",
      email: "created@ivr.com",
      role: UserRole.ADMIN,
      tenantId: "tenant-a",
      phone: null,
      avatar: null,
      accountStatus: "ACTIVE",
      emailVerifiedAt: null,
      invitedAt: null,
      onboardingCompletedAt: null,
      isActive: true,
      lastLogin: null,
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
      updatedAt: new Date("2026-08-22T00:00:00.000Z"),
    });
  });

  it("lists only the authenticated tenant users by default", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/users")
    );

    expect(response.status).toBe(200);
    expect(mocks.getUsersForTenant).toHaveBeenCalledWith("tenant-a");
    expect(mocks.getUsers).not.toHaveBeenCalled();
  });

  it("rejects the platform users scope for tenant admins", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.com/api/users?scope=platform"
      )
    );

    expect(response.status).toBe(403);
    expect(mocks.getUsers).not.toHaveBeenCalled();
  });

  it("rejects super administrator creation from the tenant users endpoint", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/users", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Platform Admin",
          email: "platform@ivr.com",
          password: "Password@123",
          role: "SUPER_ADMIN",
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});
