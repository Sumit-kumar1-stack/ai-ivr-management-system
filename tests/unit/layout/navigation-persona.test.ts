import { describe, it, expect } from "vitest";
import { UserRole } from "@prisma/client";
import { buildDashboardNavigation } from "@/components/layout/navigation";
import {
  MAKER_CAPABILITIES,
  CHECKER_CAPABILITIES,
  DEVELOPER_CAPABILITIES,
  ORGANIZATION_ADMIN_CAPABILITIES,
} from "@/features/users/user-campaign-capabilities";

describe("Dashboard Navigation Persona Visibility", () => {
  it("renders all navigation groups for SUPER_ADMIN", () => {
    const nav = buildDashboardNavigation(UserRole.SUPER_ADMIN);
    const titles = nav.map((g) => g.title);

    expect(titles).toContain("Workspace");
    expect(titles).toContain("Operations");
    expect(titles).toContain("AI & Voice");
    expect(titles).toContain("Governance");
    expect(titles).toContain("Administration");
    expect(titles).toContain("Developer");
  });

  it("renders correct navigation for ORGANIZATION_ADMIN", () => {
    const nav = buildDashboardNavigation(
      UserRole.ADMIN,
      ORGANIZATION_ADMIN_CAPABILITIES
    );
    const titles = nav.map((g) => g.title);

    expect(titles).toContain("Workspace");
    expect(titles).toContain("Operations");
    expect(titles).toContain("AI & Voice");
    expect(titles).toContain("Governance");
    expect(titles).toContain("Administration");
    expect(titles).toContain("Developer");

    const adminGroup = nav.find((g) => g.title === "Administration");
    const adminLabels = adminGroup?.items.map((i) => i.label);
    expect(adminLabels).toContain("Users");
    expect(adminLabels).toContain("Settings");
  });

  it("renders authoring and builder for MAKER, but NOT Governance, Developer, or Administration", () => {
    const nav = buildDashboardNavigation(UserRole.ADMIN, MAKER_CAPABILITIES);
    const titles = nav.map((g) => g.title);

    expect(titles).toContain("Workspace");
    expect(titles).toContain("Operations");
    expect(titles).toContain("AI & Voice");
    expect(titles).not.toContain("Governance");
    expect(titles).not.toContain("Developer");
    expect(titles).not.toContain("Administration");

    const aiGroup = nav.find((g) => g.title === "AI & Voice");
    const aiLabels = aiGroup?.items.map((i) => i.label);
    expect(aiLabels).toContain("IVR Builder");
    expect(aiLabels).toContain("IVR Flows");
  });

  it("renders Governance (Approvals) for CHECKER, but NOT Developer or Administration", () => {
    const nav = buildDashboardNavigation(UserRole.ADMIN, CHECKER_CAPABILITIES);
    const titles = nav.map((g) => g.title);

    expect(titles).toContain("Workspace");
    expect(titles).toContain("Operations");
    expect(titles).toContain("AI & Voice");
    expect(titles).toContain("Governance");
    expect(titles).not.toContain("Developer");
    expect(titles).not.toContain("Administration");

    const govGroup = nav.find((g) => g.title === "Governance");
    expect(govGroup?.items.map((i) => i.label)).toContain("Approvals");
  });

  it("renders Developer Portal for DEVELOPER, but NOT Governance or Administration", () => {
    const nav = buildDashboardNavigation(
      UserRole.ADMIN,
      DEVELOPER_CAPABILITIES
    );
    const titles = nav.map((g) => g.title);

    expect(titles).toContain("Workspace");
    expect(titles).toContain("Developer");
    expect(titles).not.toContain("Governance");
    expect(titles).not.toContain("Administration");

    const devGroup = nav.find((g) => g.title === "Developer");
    const devLabels = devGroup?.items.map((i) => i.label);
    expect(devLabels).toContain("API Keys");
    expect(devLabels).toContain("Webhooks");
    expect(devLabels).toContain("Docs");
  });

  it("renders minimal Operations for AGENT", () => {
    const nav = buildDashboardNavigation(UserRole.AGENT, []);
    const titles = nav.map((g) => g.title);

    expect(titles).toContain("Campaigns");
    expect(titles).not.toContain("Governance");
    expect(titles).not.toContain("Developer");
    expect(titles).not.toContain("Administration");
  });
});
