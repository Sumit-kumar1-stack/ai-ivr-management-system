import { UserRole } from "@prisma/client";

import { describe, expect, it } from "vitest";

import { buildDashboardNavigation } from "@/components/layout/navigation";

describe("buildDashboardNavigation", () => {
  it("shows platform and developer navigation for super admins", () => {
    const groups = buildDashboardNavigation(UserRole.SUPER_ADMIN);
    const titles = groups.map(group => group.title);

    expect(titles).toContain("Platform");
    expect(titles).toContain("Developer");
    expect(groups.flatMap(group => group.items.map(item => item.href))).toContain("/developer/api-keys");
  });

  it("shows developer navigation for tenant admins", () => {
    const groups = buildDashboardNavigation(UserRole.ADMIN);
    const titles = groups.map(group => group.title);

    expect(titles).toContain("Workspace");
    expect(titles).toContain("Developer");
    expect(groups.flatMap(group => group.items.map(item => item.href))).toContain("/developer/webhooks");
  });

  it("keeps campaign-manager navigation focused on operating routes", () => {
    const groups = buildDashboardNavigation(UserRole.AGENT);
    const titles = groups.map(group => group.title);

    expect(titles).toEqual(["Campaigns"]);
    expect(groups.flatMap(group => group.items.map(item => item.href))).not.toContain("/developer");
  });
});

