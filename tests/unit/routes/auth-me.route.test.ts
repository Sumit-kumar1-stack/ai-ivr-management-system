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
      requireUser:
        vi.fn(),
      createAuthErrorResponse:
        vi.fn(),
    })
  );

vi.mock(
  "@/lib/auth",
  () => ({
    requireUser:
      mocks.requireUser,
  })
);

vi.mock(
  "@/lib/auth-response",
  () => ({
    createAuthErrorResponse:
      mocks.createAuthErrorResponse,
  })
);

import {
  GET,
} from "@/app/api/auth/me/route";

describe(
  "/api/auth/me route",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks.createAuthErrorResponse.mockReturnValue(
          null
        );

        mocks.requireUser.mockResolvedValue({
          id: "user-1",
          email: "admin@ivr.com",
          role: UserRole.ADMIN,
          campaignCapabilities: [
            "CAMPAIGN_CREATE",
            "CAMPAIGN_EDIT",
          ],
          fullName: "Admin User",
          phone: null,
          avatar: null,
          tenantId: "tenant-1",
          tenantName: "Demo Tenant",
          tenantStatus: TenantStatus.ACTIVE,
          accountStatus:
            AccountStatus.ACTIVE,
          isActive: true,
        });
      }
    );

    it(
      "returns the authenticated user's campaign capabilities",
      async () => {
        const response =
          await GET();

        expect(
          response.status
        ).toBe(
          200
        );

        const payload =
          await response.json() as {
            campaignCapabilities?: string[];
            email?: string;
            role?: string;
            tenantId?: string | null;
          };

        expect(
          payload
        ).toMatchObject({
          email:
            "admin@ivr.com",
          role:
            UserRole.ADMIN,
          tenantId:
            "tenant-1",
          campaignCapabilities: [
            "CAMPAIGN_CREATE",
            "CAMPAIGN_EDIT",
          ],
        });

        expect(payload).not.toHaveProperty("password");
      }
    );

    it("returns the creator capability shape without checker permissions", async () => {
      mocks.requireUser.mockResolvedValueOnce({
        id: "creator-1",
        email: "creator@ivr.com",
        role: UserRole.ADMIN,
        campaignCapabilities: ["CAMPAIGN_CREATE", "CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT"],
        fullName: "Campaign Creator",
        phone: null,
        avatar: null,
        tenantId: "tenant-1",
        tenantName: "Demo Tenant",
        tenantStatus: TenantStatus.ACTIVE,
        accountStatus: AccountStatus.ACTIVE,
        isActive: true,
      });

      const payload = await (await GET()).json() as { role: UserRole; tenantId: string | null; campaignCapabilities: string[] };

      expect(payload).toMatchObject({
        role: UserRole.ADMIN,
        tenantId: "tenant-1",
        campaignCapabilities: ["CAMPAIGN_CREATE", "CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT"],
      });
      expect(payload.campaignCapabilities).not.toContain("CAMPAIGN_APPROVE");
      expect(payload).not.toHaveProperty("password");
    });

    it("returns the checker and super-admin role shapes without password data", async () => {
      mocks.requireUser.mockResolvedValueOnce({
        id: "approver-1",
        email: "approver@ivr.com",
        role: UserRole.ADMIN,
        campaignCapabilities: ["CAMPAIGN_REVIEW", "CAMPAIGN_APPROVE", "CAMPAIGN_REJECT"],
        fullName: "Campaign Approver",
        phone: null,
        avatar: null,
        tenantId: "tenant-1",
        tenantName: "Demo Tenant",
        tenantStatus: TenantStatus.ACTIVE,
        accountStatus: AccountStatus.ACTIVE,
        isActive: true,
      });

      const approver = await (await GET()).json() as { role: UserRole; tenantId: string | null; campaignCapabilities: string[] };
      expect(approver).toMatchObject({
        role: UserRole.ADMIN,
        tenantId: "tenant-1",
        campaignCapabilities: ["CAMPAIGN_REVIEW", "CAMPAIGN_APPROVE", "CAMPAIGN_REJECT"],
      });

      mocks.requireUser.mockResolvedValueOnce({
        id: "admin-1",
        email: "admin@ivr.com",
        role: UserRole.SUPER_ADMIN,
        campaignCapabilities: ["CAMPAIGN_CREATE", "CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT", "CAMPAIGN_LAUNCH", "CAMPAIGN_DELETE", "IVR_PUBLISH"],
        fullName: "Super Admin",
        phone: null,
        avatar: null,
        tenantId: "tenant-1",
        tenantName: "Demo Tenant",
        tenantStatus: TenantStatus.ACTIVE,
        accountStatus: AccountStatus.ACTIVE,
        isActive: true,
      });

      const superAdmin = await (await GET()).json() as { role: UserRole; campaignCapabilities: string[] };
      expect(superAdmin.role).toBe(UserRole.SUPER_ADMIN);
      expect(superAdmin.campaignCapabilities).toContain("CAMPAIGN_LAUNCH");
      expect(superAdmin.campaignCapabilities).toContain("IVR_PUBLISH");
      expect(superAdmin).not.toHaveProperty("password");
    });
  }
);
