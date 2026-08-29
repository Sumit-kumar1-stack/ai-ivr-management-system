import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueConstructor: vi.fn(),
  getJobCounts: vi.fn(),
  add: vi.fn(),
  getJob: vi.fn(),
  getJobs: vi.fn(),
  close: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    constructor(...args: unknown[]) {
      mocks.queueConstructor(...args);
    }

    getJobCounts = mocks.getJobCounts;
    add = mocks.add;
    getJob = mocks.getJob;
    getJobs = mocks.getJobs;
    close = mocks.close;
  },
}));

vi.mock("@/lib/redis", () => ({
  redisConnection: { status: "wait" },
}));

vi.mock("@/lib/logger", () => ({
  createServerLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  normalizeError: vi.fn(),
}));

describe("queue diagnostics service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getJobCounts.mockResolvedValue({
      waiting: 1,
      active: 2,
      delayed: 3,
      prioritized: 4,
      completed: 99,
    });
  });

  it("reads only the four allowed counts from each existing queue", async () => {
    const { getQueueDiagnostics } = await import(
      "@/services/queues/queue-diagnostics.service"
    );

    const result = await getQueueDiagnostics();

    expect(mocks.queueConstructor.mock.calls.map(call => call[0])).toEqual([
      "campaign-processing",
      "communication-campaign-processing",
      "call-retry-processing",
    ]);
    expect(mocks.getJobCounts).toHaveBeenCalledTimes(3);

    for (const call of mocks.getJobCounts.mock.calls) {
      expect(call).toEqual([
        "waiting",
        "active",
        "delayed",
        "prioritized",
      ]);
    }

    expect(result).toEqual([
      {
        name: "campaign-processing",
        counts: { waiting: 1, active: 2, delayed: 3, prioritized: 4 },
      },
      {
        name: "communication-campaign-processing",
        counts: { waiting: 1, active: 2, delayed: 3, prioritized: 4 },
      },
      {
        name: "call-retry-processing",
        counts: { waiting: 1, active: 2, delayed: 3, prioritized: 4 },
      },
    ]);
  });

  it("does not call any queue mutation method", async () => {
    const { getQueueDiagnostics } = await import(
      "@/services/queues/queue-diagnostics.service"
    );

    await getQueueDiagnostics();

    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.getJob).not.toHaveBeenCalled();
    expect(mocks.getJobs).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });
});
