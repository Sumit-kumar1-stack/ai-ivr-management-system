import {
  AccountStatus,
  TenantStatus,
  UserRole,
} from "@prisma/client";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      verifyToken:
        vi.fn(),
      findUnique:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/jwt",
  () => ({
    verifyToken:
      mocks.verifyToken,
  })
);

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      user: {
        findUnique:
          mocks.findUnique,
      },
    },
  })
);

import {
  authenticateSocket,
} from "@/server/socket-auth";

function createSocket() {
  return {
    id: "socket-1",
    handshake: {
      headers: {
        cookie: "token=socket-token",
      },
    },
  } as never;
}

describe("socket authentication", () => {
  it("rejects deleted users", async () => {
    mocks.verifyToken.mockReturnValue({
      userId: "user-1",
    });
    mocks.findUnique.mockResolvedValue(null);

    await expect(
      authenticateSocket(createSocket())
    ).rejects.toThrow("Authenticated user was not found");
  });

  it("rejects suspended tenants", async () => {
    mocks.verifyToken.mockReturnValue({
      userId: "user-1",
    });
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      fullName: "Admin User",
      email: "admin@ivr.com",
      accountStatus: AccountStatus.ACTIVE,
      role: UserRole.ADMIN,
      tenantId: "tenant-1",
      isActive: true,
      tenant: {
        id: "tenant-1",
        status: TenantStatus.SUSPENDED,
      },
    });

    await expect(
      authenticateSocket(createSocket())
    ).rejects.toThrow("Authenticated tenant is not active");
  });

  it("returns an authenticated socket user when tenant and user are active", async () => {
    mocks.verifyToken.mockReturnValue({
      userId: "user-1",
    });
    mocks.findUnique.mockResolvedValue({
      id: "user-1",
      fullName: "Admin User",
      email: "admin@ivr.com",
      accountStatus: AccountStatus.ACTIVE,
      role: UserRole.ADMIN,
      tenantId: "tenant-1",
      isActive: true,
      tenant: {
        id: "tenant-1",
        status: TenantStatus.ACTIVE,
      },
    });

    const result =
      await authenticateSocket(
        createSocket()
      );

    expect(
      result.user.role
    ).toBe(UserRole.ADMIN);
    expect(
      result.user.tenantId
    ).toBe("tenant-1");
  });
});

