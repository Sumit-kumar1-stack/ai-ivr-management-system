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
      }
    );
  }
);
