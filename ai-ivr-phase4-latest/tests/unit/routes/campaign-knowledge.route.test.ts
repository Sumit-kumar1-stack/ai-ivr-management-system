import { describe, expect, it } from "vitest";

import { PATCH } from "@/app/api/campaigns/[id]/knowledge/route";

describe("legacy campaign knowledge route", () => {
  it("returns a deprecation response", async () => {
    const response = await PATCH();

    expect(response.status).toBe(410);
  });
});
