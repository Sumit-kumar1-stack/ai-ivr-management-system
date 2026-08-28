import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("development seed governance model", () => {
  const seedSource = readFileSync(resolve(process.cwd(), "prisma/seed.ts"), "utf8");

  it("seeds only Super Admin, Creator, and Approver operational identities", () => {
    expect(seedSource).toContain('email: "admin@ivr.com"');
    expect(seedSource).toContain('email: "creator@ivr.com"');
    expect(seedSource).toContain('email: "approver@ivr.com"');
    expect(seedSource).not.toContain("publisher@ivr.com");
    expect(seedSource).not.toContain("IVR Publisher");
  });

  it("assigns campaign launch to Creator and IVR publish/delete to Approver", () => {
    const creatorBlock = seedSource.slice(seedSource.indexOf('email: "creator@ivr.com"'), seedSource.indexOf('email: "approver@ivr.com"'));
    const approverBlock = seedSource.slice(seedSource.indexOf('email: "approver@ivr.com"'), seedSource.indexOf('console.log("Development users seeded.")'));

    expect(creatorBlock).toContain('"CAMPAIGN_LAUNCH"');
    expect(creatorBlock).not.toContain('"IVR_PUBLISH"');
    expect(approverBlock).toContain('"IVR_PUBLISH"');
    expect(approverBlock).toContain('"CAMPAIGN_DELETE"');
    expect(approverBlock).not.toContain('"CAMPAIGN_LAUNCH"');
  });
});
