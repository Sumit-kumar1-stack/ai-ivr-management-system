import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  deleteMany: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const transaction = {
    $queryRaw: mocks.queryRaw,
    communicationOutboundCapacityLease: {
      deleteMany: mocks.deleteMany,
      findUnique: mocks.findUnique,
      count: mocks.count,
      create: mocks.create,
    },
  };

  return {
    prisma: {
      $transaction: vi.fn(
        async (callback: (value: typeof transaction) => unknown) =>
          callback(transaction)
      ),
      communicationOutboundCapacityLease: {
        deleteMany: mocks.release,
      },
    },
  };
});

import {
  acquireOutboundCapacity,
  releaseOutboundCapacity,
  resolveEffectiveOutboundLimit,
  resolveOutboundCapacityPolicy,
} from "@/services/communication/communication-outbound-capacity.service";

const baseInput = {
  attemptId: "attempt-1",
  tenantId: "tenant-1",
  campaignId: "campaign-1",
  provider: "PLIVO",
  now: new Date("2026-08-29T10:00:00.000Z"),
  limits: {
    campaign: 4,
    tenant: 5,
    provider: 6,
    global: 7,
  },
};

describe("communication outbound capacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ lock_result: 1 }]);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue(null);
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "lease-1" });
    mocks.release.mockResolvedValue({ count: 1 });
  });

  it("uses the minimum configured limit and treats absent dimensions as unbounded", () => {
    expect(resolveEffectiveOutboundLimit({ campaign: 8, tenant: 4, provider: 6, global: 10 })).toBe(4);
    expect(resolveEffectiveOutboundLimit({ campaign: null, tenant: null, provider: null, global: null })).toBeNull();
  });

  it("resolves campaign, tenant, provider, and global policy without numeric fallbacks", () => {
    const policy = resolveOutboundCapacityPolicy({
      tier: "PREMIUM",
      campaignLimit: 7,
      provider: "plivo",
      environment: {
        NODE_ENV: "test",
        COMMUNICATION_OUTBOUND_PLIVO_CONCURRENCY: "5",
        COMMUNICATION_OUTBOUND_GLOBAL_CONCURRENCY: "9",
      },
    });

    expect(policy).toMatchObject({
      provider: "PLIVO",
      limits: { campaign: 7, tenant: 10, provider: 5, global: 9 },
      effectiveLimit: 5,
    });

    const absent = resolveOutboundCapacityPolicy({
      tier: "STANDARD",
      campaignLimit: null,
      provider: "mock",
      environment: { NODE_ENV: "test" },
    });
    expect(absent.limits).toEqual({ campaign: null, tenant: 2, provider: null, global: null });
  });

  it.each([
    ["campaign", [4]],
    ["tenant", [0, 5]],
    ["provider", [0, 0, 6]],
    ["global", [0, 0, 0, 7]],
  ] as const)("blocks when the %s limit is reached", async (dimension, counts) => {
    const remaining = [...counts];
    mocks.count.mockImplementation(async () => remaining.shift() ?? 0);
    const result = await acquireOutboundCapacity(baseInput);
    expect(result).toMatchObject({ acquired: false, blockedDimension: dimension });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("accepts available capacity under every dimension", async () => {
    const result = await acquireOutboundCapacity(baseInput);
    expect(result).toMatchObject({ acquired: true, reused: false, leaseId: "lease-1", effectiveLimit: 4 });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing attempt lease instead of double-acquiring", async () => {
    mocks.findUnique.mockResolvedValue({ id: "lease-existing" });
    const result = await acquireOutboundCapacity(baseInput);
    expect(result).toMatchObject({ acquired: true, reused: true, leaseId: "lease-existing" });
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("takes advisory locks for all four dimensions before counting", async () => {
    await acquireOutboundCapacity(baseInput);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(4);
    expect(mocks.queryRaw.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.count.mock.invocationCallOrder[0]
    );
  });

  it("releases the persisted lease idempotently", async () => {
    await releaseOutboundCapacity("attempt-1");
    await releaseOutboundCapacity("attempt-1");
    expect(mocks.release).toHaveBeenCalledTimes(2);
    expect(mocks.release).toHaveBeenCalledWith({ where: { attemptId: "attempt-1" } });
  });

  it("fails closed when the database lock/count path throws", async () => {
    mocks.queryRaw.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(acquireOutboundCapacity(baseInput)).rejects.toThrow("database unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
