import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ eval: vi.fn() }));
vi.mock("@/lib/redis", () => ({ redisConnection: { eval: mocks.eval } }));

import { enforceRateLimit } from "@/lib/abuse-control";

describe("rate-limit failure policy", () => {
  it("fails closed for protected operations when Redis is unavailable", async () => {
    mocks.eval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(enforceRateLimit({ scope: "privileged", limit: 1, windowMs: 1000, keyParts: ["user"], failurePolicy: "FAIL_CLOSED" })).resolves.toMatchObject({ allowed: false });
  });

  it("degrades only for explicitly low-risk requests", async () => {
    mocks.eval.mockRejectedValueOnce(new Error("redis unavailable"));
    await expect(enforceRateLimit({ scope: "read", limit: 1, windowMs: 1000, keyParts: ["user"] })).resolves.toMatchObject({ allowed: true });
  });
});
