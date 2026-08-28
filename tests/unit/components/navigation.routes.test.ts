import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import { buildDashboardNavigation } from "@/components/layout/navigation";
import { OMNIBANK_NAVIGATION } from "@/components/omnibank/omnibank-shell";

function discoverPageRoutes(directory = join(process.cwd(), "src", "app")): Set<string> {
  const routes = new Set<string>();
  const visit = (current: string) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else if (entry === "page.tsx") {
        const segments = relative(join(process.cwd(), "src", "app"), current)
          .split(sep)
          .filter(segment => segment && !/^\(.*\)$/.test(segment));
        if (!segments.some(segment => /^\[.*\]$/.test(segment))) routes.add(`/${segments.join("/")}`.replace(/\/$/, "") || "/");
      }
    }
  };
  visit(directory);
  return routes;
}

function isRouteDestination(href: string, routes: Set<string>): boolean {
  return href.startsWith("http") || href.startsWith("#") || routes.has(href);
}

describe("dashboard navigation", () => {
  it("does not expose the removed dead admin routes", () => {
    const hrefs = buildDashboardNavigation(UserRole.ADMIN).flatMap(group => group.items.map(item => item.href));
    expect(hrefs).not.toEqual(expect.arrayContaining(["/team", "/integrations", "/billing"]));
  });

  it("resolves every visible role-aware and OmniBank navigation item to a real route", () => {
    const routes = discoverPageRoutes();
    const roleConfigurations: Array<[UserRole, readonly string[] | undefined]> = [
      [UserRole.SUPER_ADMIN, undefined],
      [UserRole.ADMIN, ["CAMPAIGN_CREATE", "CAMPAIGN_EDIT", "CAMPAIGN_SUBMIT"]],
      [UserRole.ADMIN, ["CAMPAIGN_REVIEW", "CAMPAIGN_APPROVE", "CAMPAIGN_REJECT"]],
      [UserRole.AGENT, undefined],
    ];
    const hrefs = [
      ...roleConfigurations.flatMap(([role, capabilities]) => buildDashboardNavigation(role, capabilities as never).flatMap(group => group.items.map(item => item.href))),
      ...OMNIBANK_NAVIGATION.map(item => item.href),
    ];

    expect(hrefs).not.toContain("#");
    for (const href of hrefs) expect(isRouteDestination(href, routes), `${href} must have a page or be an intentional redirect/external URL`).toBe(true);
  });
});
