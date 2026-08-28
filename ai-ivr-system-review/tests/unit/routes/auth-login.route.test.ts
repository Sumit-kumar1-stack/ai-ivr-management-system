import {
  NextRequest,
} from "next/server";

import {
  AccountStatus,
  TenantStatus,
  UserRole,
} from "@prisma/client";

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
      ensureRateLimit:
        vi.fn(),
      createRateLimitResponse:
        vi.fn(),
      findUnique:
        vi.fn(),
      update:
        vi.fn(),
      comparePassword:
        vi.fn(),
      signToken:
        vi.fn(),
      extractAuditRequestContext:
        vi.fn(),
      recordAuditEvent:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/abuse-control",
  () => ({
    ensureRateLimit:
      mocks.ensureRateLimit,
    createRateLimitResponse:
      mocks.createRateLimitResponse,
    readClientAddress:
      () => "127.0.0.1",
  })
);

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      user: {
        findUnique:
          mocks.findUnique,
        update:
          mocks.update,
      },
    },
  })
);

vi.mock(
  "@/lib/hash",
  () => ({
    comparePassword:
      mocks.comparePassword,
  })
);

vi.mock(
  "@/lib/jwt",
  () => ({
    signToken:
      mocks.signToken,
  })
);

vi.mock(
  "@/services/audit/audit-context",
  () => ({
    extractAuditRequestContext:
      mocks.extractAuditRequestContext,
  })
);

vi.mock(
  "@/services/audit/audit-event.service",
  () => ({
    recordAuditEvent:
      mocks.recordAuditEvent,
  })
);

import {
  POST,
} from "@/app/api/auth/login/route";

const baseUser = {
  id: "user-1",
  email: "admin@ivr.com",
  password: "hashed-password",
  role: UserRole.ADMIN,
  fullName: "Admin User",
  isActive: true,
  accountStatus: AccountStatus.ACTIVE,
  tenantId: "tenant-1",
  tenant: {
    id: "tenant-1",
    name: "Demo Tenant",
    status: TenantStatus.ACTIVE,
  },
};

function createRequest(
  email: string,
  password: string
) {
  return new NextRequest(
    "https://example.com/api/auth/login",
    {
      method: "POST",
      headers: {
        "content-type":
          "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    }
  );
}

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureRateLimit.mockResolvedValue(undefined);
    mocks.createRateLimitResponse.mockReturnValue(null);
    mocks.extractAuditRequestContext.mockReturnValue({
      ipAddress: "127.0.0.1",
      correlationId: "corr-1",
    });
    mocks.signToken.mockReturnValue("signed-token");
    mocks.comparePassword.mockResolvedValue(true);
    mocks.update.mockResolvedValue({});
    mocks.findUnique.mockResolvedValue(baseUser);
    mocks.recordAuditEvent.mockResolvedValue(undefined);
  });

  it("accepts a valid login and sets an auth cookie", async () => {
    const response = await POST(
      createRequest("admin@ivr.com", "Admin@123")
    );

    expect(response.status).toBe(200);
    expect(mocks.signToken).toHaveBeenCalledWith({
      userId: "user-1",
      role: UserRole.ADMIN,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_SUCCESS",
        outcome: "SUCCEEDED",
      })
    );

    const setCookie =
      response.headers.get("set-cookie");

    expect(setCookie).toContain("token=signed-token");
  });

  it("rejects an invalid password", async () => {
    mocks.comparePassword.mockResolvedValue(false);

    const response = await POST(
      createRequest("admin@ivr.com", "wrong-password")
    );

    expect(response.status).toBe(401);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILURE",
        outcome: "FAILED",
      })
    );
  });

  it("rejects deleted users without auditing a login success", async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await POST(
      createRequest("deleted@ivr.com", "Admin@123")
    );

    expect(response.status).toBe(401);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects suspended tenants", async () => {
    mocks.findUnique.mockResolvedValue({
      ...baseUser,
      tenant: {
        ...baseUser.tenant,
        status: TenantStatus.SUSPENDED,
      },
    });

    const response = await POST(
      createRequest("admin@ivr.com", "Admin@123")
    );

    expect(response.status).toBe(401);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILURE",
        outcome: "FAILED",
      })
    );
  });
});

