import { describe, it, expect } from "vitest";
import { UserRole } from "@prisma/client";
import {
  resolveAccessProfile,
  getDefaultCampaignCapabilitiesForRole,
  getCapabilitiesForAccessProfile,
  MAKER_CAPABILITIES,
  CHECKER_CAPABILITIES,
  DEVELOPER_CAPABILITIES,
  ORGANIZATION_ADMIN_CAPABILITIES,
} from "@/features/users/user-campaign-capabilities";
import { CAMPAIGN_CAPABILITIES } from "@/services/communication/campaign-capabilities";

describe("User Persona & Access Profile Resolution", () => {
  describe("resolveAccessProfile", () => {
    it("resolves SUPER_ADMIN role to SUPER_ADMIN profile", () => {
      expect(resolveAccessProfile(UserRole.SUPER_ADMIN, [])).toBe("SUPER_ADMIN");
      expect(
        resolveAccessProfile(UserRole.SUPER_ADMIN, [...CAMPAIGN_CAPABILITIES])
      ).toBe("SUPER_ADMIN");
    });

    it("resolves AGENT role to AGENT profile", () => {
      expect(resolveAccessProfile(UserRole.AGENT, [])).toBe("AGENT");
    });

    it("resolves exact MAKER capabilities to MAKER profile", () => {
      expect(resolveAccessProfile(UserRole.ADMIN, MAKER_CAPABILITIES)).toBe(
        "MAKER"
      );
    });

    it("resolves exact CHECKER capabilities to CHECKER profile", () => {
      expect(resolveAccessProfile(UserRole.ADMIN, CHECKER_CAPABILITIES)).toBe(
        "CHECKER"
      );
    });

    it("resolves exact DEVELOPER capabilities to DEVELOPER profile", () => {
      expect(resolveAccessProfile(UserRole.ADMIN, DEVELOPER_CAPABILITIES)).toBe(
        "DEVELOPER"
      );
    });

    it("resolves ORGANIZATION_ADMIN capabilities to ORGANIZATION_ADMIN profile", () => {
      expect(
        resolveAccessProfile(UserRole.ADMIN, ORGANIZATION_ADMIN_CAPABILITIES)
      ).toBe("ORGANIZATION_ADMIN");
      expect(
        resolveAccessProfile(UserRole.ADMIN, [...CAMPAIGN_CAPABILITIES])
      ).toBe("ORGANIZATION_ADMIN");
    });

    it("resolves non-standard capability combinations to CUSTOM profile", () => {
      expect(
        resolveAccessProfile(UserRole.ADMIN, ["CAMPAIGN_CREATE", "DEVELOPER_PORTAL_ACCESS"])
      ).toBe("CUSTOM");
      expect(resolveAccessProfile(UserRole.ADMIN, [])).toBe("CUSTOM");
    });
  });

  describe("getDefaultCampaignCapabilitiesForRole", () => {
    it("gives ADMIN default MAKER capabilities", () => {
      expect(getDefaultCampaignCapabilitiesForRole(UserRole.ADMIN)).toEqual([
        ...MAKER_CAPABILITIES,
      ]);
    });

    it("gives AGENT empty capabilities by default (removes accidental governance approval)", () => {
      expect(getDefaultCampaignCapabilitiesForRole(UserRole.AGENT)).toEqual([]);
    });

    it("gives SUPER_ADMIN all capabilities", () => {
      expect(
        getDefaultCampaignCapabilitiesForRole(UserRole.SUPER_ADMIN)
      ).toEqual([...CAMPAIGN_CAPABILITIES]);
    });
  });

  describe("getCapabilitiesForAccessProfile", () => {
    it("returns correct capability arrays for all profiles", () => {
      expect(getCapabilitiesForAccessProfile("ORGANIZATION_ADMIN")).toEqual([
        ...ORGANIZATION_ADMIN_CAPABILITIES,
      ]);
      expect(getCapabilitiesForAccessProfile("MAKER")).toEqual([
        ...MAKER_CAPABILITIES,
      ]);
      expect(getCapabilitiesForAccessProfile("CHECKER")).toEqual([
        ...CHECKER_CAPABILITIES,
      ]);
      expect(getCapabilitiesForAccessProfile("DEVELOPER")).toEqual([
        ...DEVELOPER_CAPABILITIES,
      ]);
      expect(getCapabilitiesForAccessProfile("SUPER_ADMIN")).toEqual([
        ...CAMPAIGN_CAPABILITIES,
      ]);
      expect(getCapabilitiesForAccessProfile("AGENT")).toEqual([]);
      expect(getCapabilitiesForAccessProfile("CUSTOM")).toEqual([]);
    });
  });
});
