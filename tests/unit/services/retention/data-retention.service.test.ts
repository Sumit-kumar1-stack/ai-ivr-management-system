import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callCount: vi.fn(),
  callFindMany: vi.fn(),
  callUpdateMany: vi.fn(),
  messageCount: vi.fn(),
  messageFindMany: vi.fn(),
  messageDeleteMany: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    call: {
      count: mocks.callCount,
      findMany: mocks.callFindMany,
      updateMany: mocks.callUpdateMany,
    },
    conversationMessage: {
      count: mocks.messageCount,
      findMany: mocks.messageFindMany,
      deleteMany: mocks.messageDeleteMany,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  createServerLogger: () => ({ info: mocks.info, error: mocks.error }),
  normalizeError: (error: unknown) => ({ name: error instanceof Error ? error.name : "Error" }),
}));

import type { DataRetentionPolicy } from "@/config/data-retention";
import {
  closeDataRetention,
  initializeDataRetention,
  runDataRetention,
} from "@/services/retention/data-retention.service";

type CallRow = {
  id: string;
  completedAt: Date;
  recordingUrl: string | null;
  transcript: string | null;
};

let calls: CallRow[];
let failNextUpdate = false;

const fixedNow = new Date("2026-08-25T12:00:00.000Z");

function policy(overrides: Partial<DataRetentionPolicy> = {}): DataRetentionPolicy {
  return {
    recordingsDays: 30,
    transcriptsDays: null,
    conversationMetadataDays: null,
    auditEventsDays: null,
    batchSize: 2,
    maxRecordsPerRun: 10,
    ...overrides,
  };
}

function recording(id: string, completedAt: Date): CallRow {
  return { id, completedAt, recordingUrl: `provider-reference-${id}`, transcript: null };
}

function eligibleCalls(args: { where: { AND: Array<Record<string, unknown>> }; take: number }) {
  const [criteria, cursor] = args.where.AND;
  const field = "recordingUrl" in criteria ? "recordingUrl" : "transcript";
  const cutoff = (criteria.completedAt as { lt: Date }).lt;
  let rows = calls.filter(row => row.completedAt < cutoff && row[field] !== null);

  if (cursor) {
    const [greaterThan, equalTimestamp] = cursor.OR as Array<Record<string, unknown>>;
    const timestamp = (greaterThan.completedAt as { gt: Date }).gt;
    const equal = (equalTimestamp.completedAt as Date).getTime();
    const afterId = (equalTimestamp.id as { gt: string }).gt;
    rows = rows.filter(row => row.completedAt > timestamp || (row.completedAt.getTime() === equal && row.id > afterId));
  }

  return rows
    .sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime() || left.id.localeCompare(right.id))
    .slice(0, args.take)
    .map(row => ({ id: row.id, completedAt: row.completedAt }));
}

beforeEach(() => {
  calls = [];
  failNextUpdate = false;
  vi.clearAllMocks();

  mocks.callCount.mockImplementation(async ({ where }) => {
    const field = "recordingUrl" in where ? "recordingUrl" : "transcript";
    const cutoff = where.completedAt.lt as Date;
    return calls.filter(row => row.completedAt < cutoff && row[field] !== null).length;
  });
  mocks.callFindMany.mockImplementation(eligibleCalls);
  mocks.callUpdateMany.mockImplementation(async ({ where, data }) => {
    if (failNextUpdate) {
      failNextUpdate = false;
      throw new Error("database unavailable");
    }

    const field = "recordingUrl" in data ? "recordingUrl" : "transcript";
    let count = 0;
    for (const row of calls) {
      if (where.id.in.includes(row.id) && row[field] !== null) {
        row[field] = null;
        count += 1;
      }
    }
    return { count };
  });
  mocks.messageCount.mockResolvedValue(0);
  mocks.messageFindMany.mockResolvedValue([]);
  mocks.messageDeleteMany.mockResolvedValue({ count: 0 });
  initializeDataRetention({ intervalMs: 60_000, runOnStart: false });
});

afterEach(() => {
  closeDataRetention();
  vi.useRealTimers();
});

describe("data retention", () => {
  it("performs zero mutation during a dry run and reports wouldProcess", async () => {
    calls = Array.from({ length: 4 }, (_, index) => recording(`${index}`, new Date("2026-07-01T00:00:00.000Z")));

    const result = await runDataRetention({ dryRun: true, now: fixedNow, policy: policy({ batchSize: 2, maxRecordsPerRun: 3 }) });

    expect(result).toMatchObject({ dryRun: true, eligible: 4, wouldProcess: 3, processed: 0, failed: 0, limitReached: true });
    expect(mocks.callUpdateMany).not.toHaveBeenCalled();
    expect(calls.every(row => row.recordingUrl !== null)).toBe(true);
  });

  it("mutates a dataset smaller than one batch", async () => {
    calls = [recording("one", new Date("2026-07-01T00:00:00.000Z"))];

    const result = await runDataRetention({ now: fixedNow, policy: policy({ batchSize: 2 }) });

    expect(result.processed).toBe(1);
    expect(mocks.callUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("processes exactly one batch", async () => {
    calls = ["one", "two"].map(id => recording(id, new Date("2026-07-01T00:00:00.000Z")));

    const result = await runDataRetention({ now: fixedNow, policy: policy({ batchSize: 2 }) });

    expect(result.processed).toBe(2);
    expect(mocks.callUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("iterates across multiple full batches and a final partial batch", async () => {
    calls = Array.from({ length: 5 }, (_, index) => recording(`${index}`, new Date(`2026-07-0${index + 1}T00:00:00.000Z`)));

    const result = await runDataRetention({ now: fixedNow, policy: policy({ batchSize: 2, maxRecordsPerRun: 10 }) });

    expect(result.processed).toBe(5);
    expect(mocks.callUpdateMany).toHaveBeenCalledTimes(3);
    expect(mocks.callUpdateMany.mock.calls.map(([args]) => args.where.id.in.length)).toEqual([2, 2, 1]);
  });

  it("enforces the global per-run maximum and the next invocation resumes remaining records", async () => {
    calls = Array.from({ length: 6 }, (_, index) => recording(`${index}`, new Date("2026-07-01T00:00:00.000Z")));
    const runPolicy = policy({ batchSize: 2, maxRecordsPerRun: 5 });

    const first = await runDataRetention({ now: fixedNow, policy: runPolicy });
    const second = await runDataRetention({ now: fixedNow, policy: runPolicy });

    expect(first).toMatchObject({ processed: 5, wouldProcess: 5, limitReached: true });
    expect(second).toMatchObject({ processed: 1, limitReached: false });
    expect(calls.filter(row => row.recordingUrl !== null)).toHaveLength(0);
  });

  it("uses strict timestamp < cutoff eligibility", async () => {
    const cutoff = new Date("2026-07-26T12:00:00.000Z");
    calls = [
      recording("before", new Date(cutoff.getTime() - 1)),
      recording("exact", cutoff),
      recording("after", new Date(cutoff.getTime() + 1)),
    ];

    const result = await runDataRetention({ now: fixedNow, policy: policy() });

    expect(result.processed).toBe(1);
    expect(calls.find(row => row.id === "before")?.recordingUrl).toBeNull();
    expect(calls.find(row => row.id === "exact")?.recordingUrl).not.toBeNull();
    expect(calls.find(row => row.id === "after")?.recordingUrl).not.toBeNull();
  });

  it("is idempotent and safely ignores already-null recording references", async () => {
    calls = [
      recording("expired", new Date("2026-07-01T00:00:00.000Z")),
      { id: "null", completedAt: new Date("2026-07-01T00:00:00.000Z"), recordingUrl: null, transcript: null },
    ];

    const first = await runDataRetention({ now: fixedNow, policy: policy() });
    const second = await runDataRetention({ now: fixedNow, policy: policy() });

    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
    expect(second.failed).toBe(0);
  });

  it("reports a failed batch without counting it as processed and retries it next run", async () => {
    calls = [recording("one", new Date("2026-07-01T00:00:00.000Z")), recording("two", new Date("2026-07-02T00:00:00.000Z"))];
    failNextUpdate = true;

    const failed = await runDataRetention({ now: fixedNow, policy: policy() });
    const retried = await runDataRetention({ now: fixedNow, policy: policy() });

    expect(failed).toMatchObject({ processed: 0, failed: 2 });
    expect(retried).toMatchObject({ processed: 2, failed: 0 });
  });

  it("leaves immutable audit events excluded from mutation", async () => {
    const result = await runDataRetention({ now: fixedNow, policy: policy({ auditEventsDays: 1 }) });

    expect(result.byScope).not.toHaveProperty("auditEvents");
  });

  it("returns an empty successful result when no records are eligible", async () => {
    const result = await runDataRetention({ now: fixedNow, policy: policy() });

    expect(result).toMatchObject({ eligible: 0, wouldProcess: 0, processed: 0, failed: 0, limitReached: false });
    expect(mocks.callUpdateMany).not.toHaveBeenCalled();
  });

  it("clears transcript fields in bounded batches", async () => {
    calls = [
      { id: "one", completedAt: new Date("2026-07-01T00:00:00.000Z"), recordingUrl: null, transcript: "private transcript" },
      { id: "two", completedAt: new Date("2026-07-02T00:00:00.000Z"), recordingUrl: null, transcript: "private transcript" },
    ];

    const result = await runDataRetention({ now: fixedNow, policy: policy({ recordingsDays: null, transcriptsDays: 30, batchSize: 1 }) });

    expect(result.byScope.transcripts.processed).toBe(2);
    expect(calls.every(row => row.transcript === null)).toBe(true);
  });

  it("does not schedule another run after retention shutdown", async () => {
    vi.useFakeTimers();
    const previousRetentionDays = process.env.RECORDING_RETENTION_DAYS;
    process.env.RECORDING_RETENTION_DAYS = "30";
    closeDataRetention();
    initializeDataRetention({ intervalMs: 10, runOnStart: false });
    closeDataRetention();

    await vi.advanceTimersByTimeAsync(30);

    expect(mocks.callCount).not.toHaveBeenCalled();
    if (previousRetentionDays === undefined) delete process.env.RECORDING_RETENTION_DAYS;
    else process.env.RECORDING_RETENTION_DAYS = previousRetentionDays;
  });

  it("does not overlap a timer run with an active retention execution", async () => {
    vi.useFakeTimers();
    const previousRetentionDays = process.env.RECORDING_RETENTION_DAYS;
    process.env.RECORDING_RETENTION_DAYS = "30";
    let releaseCount: (() => void) | undefined;
    mocks.callCount.mockImplementationOnce(() => new Promise<number>(resolve => { releaseCount = () => resolve(0); }));

    closeDataRetention();
    initializeDataRetention({ intervalMs: 10, runOnStart: true });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);

    expect(mocks.callCount).toHaveBeenCalledTimes(1);
    releaseCount?.();
    await vi.advanceTimersByTimeAsync(0);
    if (previousRetentionDays === undefined) delete process.env.RECORDING_RETENTION_DAYS;
    else process.env.RECORDING_RETENTION_DAYS = previousRetentionDays;
  });

  it("uses stable ordered batches for dry runs without mutating any rows", async () => {
    calls = Array.from({ length: 5 }, (_, index) => recording(`${index}`, new Date("2026-07-01T00:00:00.000Z")));

    const result = await runDataRetention({ dryRun: true, now: fixedNow, policy: policy({ batchSize: 2, maxRecordsPerRun: 5 }) });

    expect(result.wouldProcess).toBe(5);
    expect(mocks.callFindMany).toHaveBeenCalledTimes(3);
    expect(mocks.callUpdateMany).not.toHaveBeenCalled();
  });

  it("emits only safe structured lifecycle metadata", async () => {
    calls = [recording("one", new Date("2026-07-01T00:00:00.000Z"))];

    await runDataRetention({ now: fixedNow, policy: policy() });

    expect(mocks.info.mock.calls.map(([context]) => context.event)).toEqual(expect.arrayContaining([
      "retention.run.started",
      "retention.batch.completed",
      "retention.run.completed",
    ]));
  });
});
