import { createHash } from "crypto";

import { UserRole } from "@prisma/client";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tenantFindUnique: vi.fn(),
  tenantCreate: vi.fn(),
  tenantInvitationCreate: vi.fn(),
  tenantInvitationFindUnique: vi.fn(),
  tenantInvitationUpdate: vi.fn(),
  tenantUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: mocks.tenantFindUnique,
      create: mocks.tenantCreate,
      update: mocks.tenantUpdate,
    },
    tenantInvitation: {
      findUnique: mocks.tenantInvitationFindUnique,
      create: mocks.tenantInvitationCreate,
      update: mocks.tenantInvitationUpdate,
    },
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/hash", () => ({
  hashPassword: mocks.hashPassword,
}));

import {
  acceptTenantInvitation,
  createTenantInvitation,
} from "@/features/onboarding/onboarding.service";

describe("onboarding service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.tenantFindUnique.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue("hashed-password");

    mocks.transaction.mockImplementation(async callback => {
      const tx = {
        tenant: {
          create: mocks.tenantCreate,
          update: mocks.tenantUpdate,
        },
        tenantInvitation: {
          create: mocks.tenantInvitationCreate,
          update: mocks.tenantInvitationUpdate,
        },
        user: {
          findUnique: mocks.userFindUnique,
          create: mocks.userCreate,
        },
      };

      return callback(tx as never);
    });
  });

  it("creates a tenant invitation with a generated onboarding link", async () => {
    mocks.tenantCreate.mockResolvedValue({
      id: "tenant-1",
      name: "Acme Bank",
      slug: "acme-bank",
      status: "PENDING",
    });
    mocks.tenantInvitationCreate.mockResolvedValue({
      id: "invite-1",
      tenantId: "tenant-1",
      email: "approver@ivr.com",
      fullName: "Campaign Approver",
      role: UserRole.ADMIN,
      status: "PENDING",
      invitedAt: new Date("2026-08-22T00:00:00.000Z"),
      expiresAt: new Date("2026-08-29T00:00:00.000Z"),
    });

    const result = await createTenantInvitation({
      tenantName: "Acme Bank",
      adminFullName: "Campaign Approver",
      adminEmail: "approver@ivr.com",
      adminRole: "ADMIN",
    });

    expect(result.invitationUrl).toMatch(/^\/onboarding\//);
    expect(mocks.tenantCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Acme Bank",
          status: "PENDING",
        }),
      })
    );
    expect(mocks.tenantInvitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "approver@ivr.com",
          role: "ADMIN",
        }),
      })
    );
  });

  it("accepts an invitation and activates the tenant", async () => {
    const tokenHash = createHash("sha256")
      .update("invite-token")
      .digest("hex");

    mocks.tenantInvitationFindUnique.mockResolvedValue({
      id: "invite-1",
      tenantId: "tenant-1",
      email: "approver@ivr.com",
      fullName: "Campaign Approver",
      role: UserRole.ADMIN,
      status: "PENDING",
      invitedAt: new Date("2026-08-22T00:00:00.000Z"),
      expiresAt: new Date("2026-08-29T00:00:00.000Z"),
      createdByUserId: "user-1",
      tenant: {
        id: "tenant-1",
        name: "Acme Bank",
        slug: "acme-bank",
        status: "PENDING",
      },
      tokenHash,
    });

    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      id: "user-2",
      fullName: "Campaign Approver",
      email: "approver@ivr.com",
      role: UserRole.ADMIN,
    });
    mocks.tenantInvitationUpdate.mockResolvedValue({});
    mocks.tenantUpdate.mockResolvedValue({});

    const user = await acceptTenantInvitation("invite-token", {
      fullName: "Campaign Approver",
      password: "Password@123",
    });

    expect(user.email).toBe("approver@ivr.com");
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          accountStatus: "ACTIVE",
          isActive: true,
        }),
      })
    );
    expect(mocks.tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
        }),
      })
    );
  });
});
