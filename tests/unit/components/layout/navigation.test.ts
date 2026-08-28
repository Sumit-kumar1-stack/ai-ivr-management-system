import { UserRole } from "@prisma/client";

import { describe, expect, it } from "vitest";

import { buildDashboardNavigation } from "@/components/layout/navigation";

describe("buildDashboardNavigation", () => {
  it("shows platform and developer navigation for super admins", () => {
    const groups = buildDashboardNavigation(UserRole.SUPER_ADMIN);
    const titles = groups.map(group => group.title);

    expect(titles).toContain("Administration");
    expect(titles).toContain("Developer");
    const hrefs = groups.flatMap(group => group.items.map(item => item.href));
    expect(hrefs).toContain("/developer/api-keys");
    expect(hrefs).toContain("/campaigns");
    expect(hrefs).toContain("/approvals");
  });

  it("shows the tenant workspace and campaign creation navigation for a creator", () => {
    const groups = buildDashboardNavigation(UserRole.ADMIN, [
      "CAMPAIGN_CREATE",
      "CAMPAIGN_EDIT",
      "CAMPAIGN_SUBMIT",
    ]);
    const titles = groups.map(group => group.title);
    const hrefs = groups.flatMap(group => group.items.map(item => item.href));

    expect(titles).toContain("Workspace");
    expect(hrefs).toContain("/campaigns");
    expect(hrefs).toContain("/ivr-flows");
    expect(hrefs).toContain("/ivr-builder");
    expect(hrefs).not.toContain("/approvals");
    expect(hrefs).not.toContain("/tenants");
    expect(hrefs).not.toContain("/developer/webhooks");
  });

  it("shows release review navigation without exposing the authoring builder to an approver", () => {
    const groups = buildDashboardNavigation(UserRole.ADMIN, [
      "CAMPAIGN_REVIEW",
      "CAMPAIGN_APPROVE",
      "CAMPAIGN_REJECT",
    ]);
    const hrefs = groups.flatMap(group => group.items.map(item => item.href));

    expect(hrefs).toContain("/campaigns");
    expect(hrefs).toContain("/approvals");
    expect(hrefs).toContain("/ivr-flows");
    expect(hrefs).not.toContain("/ivr-builder");
    expect(hrefs).not.toContain("/tenants");
  });

  it("keeps campaign-manager navigation focused on operating routes", () => {
    const groups = buildDashboardNavigation(UserRole.AGENT);
    const titles = groups.map(group => group.title);

    expect(titles).toEqual(["Campaigns"]);
    expect(groups.flatMap(group => group.items.map(item => item.href))).not.toContain("/developer");
  });
});
