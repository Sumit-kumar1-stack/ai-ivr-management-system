import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { UserRole } from "@prisma/client";
import {
  isSuperAdminSelfApprovalOverrideEnabled,
  canBypassMakerCheckerForTesting,
} from "@/services/security/governance-override.service";

describe("Governance Override Service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isSuperAdminSelfApprovalOverrideEnabled", () => {
    it("returns true when development and flag is 'true'", () => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(isSuperAdminSelfApprovalOverrideEnabled()).toBe(true);
    });

    it("returns false when development and flag is 'false'", () => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "false";

      expect(isSuperAdminSelfApprovalOverrideEnabled()).toBe(false);
    });

    it("returns false when development and flag is unset", () => {
      (process.env as any).NODE_ENV = "development";
      delete process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL;

      expect(isSuperAdminSelfApprovalOverrideEnabled()).toBe(false);
    });

    it("FAIL-SAFE: strictly returns false in production even if flag is 'true'", () => {
      (process.env as any).NODE_ENV = "production";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(isSuperAdminSelfApprovalOverrideEnabled()).toBe(false);
    });
  });

  describe("canBypassMakerCheckerForTesting", () => {
    it("returns true ONLY for SUPER_ADMIN when flag is enabled in development", () => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(
        canBypassMakerCheckerForTesting({ role: UserRole.SUPER_ADMIN })
      ).toBe(true);
    });

    it("returns false for SUPER_ADMIN when flag is false", () => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "false";

      expect(
        canBypassMakerCheckerForTesting({ role: UserRole.SUPER_ADMIN })
      ).toBe(false);
    });

    it("returns false for ADMIN (Maker, Checker, Org Admin) even when flag is true", () => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(canBypassMakerCheckerForTesting({ role: UserRole.ADMIN })).toBe(
        false
      );
    });

    it("returns false for AGENT even when flag is true", () => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(canBypassMakerCheckerForTesting({ role: UserRole.AGENT })).toBe(
        false
      );
    });

    it("returns false for SUPER_ADMIN in production even when flag is true", () => {
      (process.env as any).NODE_ENV = "production";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(
        canBypassMakerCheckerForTesting({ role: UserRole.SUPER_ADMIN })
      ).toBe(false);
    });

    it("handles null or undefined actor safely", () => {
      (process.env as any).NODE_ENV = "development";
      process.env.ALLOW_SUPER_ADMIN_SELF_APPROVAL = "true";

      expect(canBypassMakerCheckerForTesting(null)).toBe(false);
      expect(canBypassMakerCheckerForTesting(undefined)).toBe(false);
      expect(canBypassMakerCheckerForTesting({})).toBe(false);
    });
  });
});
