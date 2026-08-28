import { getDataRetentionPolicy, type DataRetentionPolicy } from "@/config/data-retention";
import { createServerLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const log = createServerLogger("data-retention");
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

type RetentionScopeName =
  | "recordingReferences"
  | "transcripts"
  | "conversationMessages";

type RetentionRow = {
  id: string;
  timestamp: Date;
};

export interface RetentionScopeResult {
  eligible: number;
  wouldProcess: number;
  processed: number;
  failed: number;
}

export interface DataRetentionRunResult {
  dryRun: boolean;
  cutoffs: Partial<Record<RetentionScopeName, string>>;
  eligible: number;
  wouldProcess: number;
  processed: number;
  failed: number;
  failedScopes: RetentionScopeName[];
  limitReached: boolean;
  skipped: boolean;
  byScope: Record<RetentionScopeName, RetentionScopeResult>;
}

export interface RunDataRetentionOptions {
  dryRun?: boolean;
  now?: Date;
  policy?: DataRetentionPolicy;
}

export interface DataRetentionSchedulerOptions {
  intervalMs?: number;
  runOnStart?: boolean;
}

interface RetentionScope {
  name: RetentionScopeName;
  days: number | null;
  countEligible: (before: Date) => Promise<number>;
  fetchBatch: (before: Date, take: number, cursor?: RetentionRow) => Promise<RetentionRow[]>;
  mutateBatch: (ids: string[]) => Promise<number>;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopping = false;

function emptyScopeResult(): RetentionScopeResult {
  return { eligible: 0, wouldProcess: 0, processed: 0, failed: 0 };
}

function createResult(dryRun: boolean): DataRetentionRunResult {
  return {
    dryRun,
    cutoffs: {},
    eligible: 0,
    wouldProcess: 0,
    processed: 0,
    failed: 0,
    failedScopes: [],
    limitReached: false,
    skipped: false,
    byScope: {
      recordingReferences: emptyScopeResult(),
      transcripts: emptyScopeResult(),
      conversationMessages: emptyScopeResult(),
    },
  };
}

function getCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function cursorWhere(timestampField: "completedAt" | "createdAt", cursor?: RetentionRow) {
  if (!cursor) {
    return undefined;
  }

  return {
    OR: [
      { [timestampField]: { gt: cursor.timestamp } },
      { [timestampField]: cursor.timestamp, id: { gt: cursor.id } },
    ],
  };
}

function createScopes(policy: DataRetentionPolicy): RetentionScope[] {
  return [
    {
      name: "recordingReferences",
      days: policy.recordingsDays,
      countEligible: before =>
        prisma.call.count({
          where: { completedAt: { lt: before }, recordingUrl: { not: null } },
        }),
      fetchBatch: async (before, take, cursor) => {
        const rows = await prisma.call.findMany({
          where: {
            AND: [
              { completedAt: { lt: before }, recordingUrl: { not: null } },
              ...(cursor ? [cursorWhere("completedAt", cursor)!] : []),
            ],
          },
          select: { id: true, completedAt: true },
          orderBy: [{ completedAt: "asc" }, { id: "asc" }],
          take,
        });
        return rows.flatMap(row => row.completedAt ? [{ id: row.id, timestamp: row.completedAt }] : []);
      },
      // This only clears the stored provider reference. It does not delete a remote recording binary.
      mutateBatch: async ids =>
        (await prisma.call.updateMany({
          where: { id: { in: ids }, recordingUrl: { not: null } },
          data: { recordingUrl: null },
        })).count,
    },
    {
      name: "transcripts",
      days: policy.transcriptsDays,
      countEligible: before =>
        prisma.call.count({
          where: { completedAt: { lt: before }, transcript: { not: null } },
        }),
      fetchBatch: async (before, take, cursor) => {
        const rows = await prisma.call.findMany({
          where: {
            AND: [
              { completedAt: { lt: before }, transcript: { not: null } },
              ...(cursor ? [cursorWhere("completedAt", cursor)!] : []),
            ],
          },
          select: { id: true, completedAt: true },
          orderBy: [{ completedAt: "asc" }, { id: "asc" }],
          take,
        });
        return rows.flatMap(row => row.completedAt ? [{ id: row.id, timestamp: row.completedAt }] : []);
      },
      mutateBatch: async ids =>
        (await prisma.call.updateMany({
          where: { id: { in: ids }, transcript: { not: null } },
          data: { transcript: null },
        })).count,
    },
    {
      name: "conversationMessages",
      days: policy.conversationMetadataDays,
      countEligible: before => prisma.conversationMessage.count({ where: { createdAt: { lt: before } } }),
      fetchBatch: async (before, take, cursor) => {
        const rows = await prisma.conversationMessage.findMany({
          where: {
            AND: [
              { createdAt: { lt: before } },
              ...(cursor ? [cursorWhere("createdAt", cursor)!] : []),
            ],
          },
          select: { id: true, createdAt: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
        });
        return rows.map(row => ({ id: row.id, timestamp: row.createdAt }));
      },
      mutateBatch: async ids =>
        (await prisma.conversationMessage.deleteMany({ where: { id: { in: ids } } })).count,
    },
  ];
}

/**
 * Runs bounded retention batches. Audit events are intentionally excluded because
 * they are immutable compliance records; AUDIT_EVENT_RETENTION_DAYS is retained
 * as policy metadata for a separately governed archival process.
 */
export async function runDataRetention(
  options: RunDataRetentionOptions = {}
): Promise<DataRetentionRunResult> {
  const dryRun = Boolean(options.dryRun);
  const now = options.now ?? new Date();
  const policy = options.policy ?? getDataRetentionPolicy();
  const result = createResult(dryRun);

  if (running || stopping) {
    result.skipped = true;
    return result;
  }

  running = true;
  const startedAt = Date.now();

  try {
    const scopes = createScopes(policy);
    const activeScopes = scopes.filter(scope => scope.days !== null);

    for (const scope of activeScopes) {
      const cutoff = getCutoff(now, scope.days!);
      result.cutoffs[scope.name] = cutoff.toISOString();
      const eligible = await scope.countEligible(cutoff);
      result.byScope[scope.name].eligible = eligible;
      result.eligible += eligible;
    }

    log.info(
      {
        event: "retention.run.started",
        dryRun,
        policy,
        cutoff: result.cutoffs,
        batchSize: policy.batchSize,
        maxPerRun: policy.maxRecordsPerRun,
        eligible: result.eligible,
      },
      "Retention run started"
    );

    let remaining = policy.maxRecordsPerRun;
    let batchNumber = 0;

    for (const scope of activeScopes) {
      if (remaining === 0) {
        break;
      }

      const before = getCutoff(now, scope.days!);
      let cursor: RetentionRow | undefined;

      while (remaining > 0) {
        const take = Math.min(policy.batchSize, remaining);
        const rows = await scope.fetchBatch(before, take, dryRun ? cursor : undefined);

        if (rows.length === 0) {
          break;
        }

        batchNumber += 1;
        const ids = rows.map(row => row.id);
        result.wouldProcess += ids.length;
        result.byScope[scope.name].wouldProcess += ids.length;
        remaining -= ids.length;

        if (dryRun) {
          cursor = rows.at(-1);
          log.info(
            {
              event: "retention.batch.completed",
              dryRun,
              batchNumber,
              eligible: ids.length,
              wouldProcess: ids.length,
              processed: 0,
              failed: 0,
            },
            "Retention dry-run batch completed"
          );
          continue;
        }

        try {
          const processed = await scope.mutateBatch(ids);
          result.processed += processed;
          result.byScope[scope.name].processed += processed;

          log.info(
            {
              event: "retention.batch.completed",
              dryRun,
              batchNumber,
              eligible: ids.length,
              wouldProcess: ids.length,
              processed,
              failed: 0,
            },
            "Retention batch completed"
          );
        } catch {
          result.failed += ids.length;
          result.byScope[scope.name].failed += ids.length;
          result.failedScopes.push(scope.name);

          log.error(
            {
              event: "retention.run.failed",
              dryRun,
              batchNumber,
              failed: ids.length,
              durationMs: Date.now() - startedAt,
            },
            "Retention batch failed"
          );

          // A failed batch is never retried in this execution. A future scheduled
          // run can safely retry the unchanged records.
          break;
        }
      }
    }

    result.limitReached = result.eligible >= policy.maxRecordsPerRun && result.wouldProcess >= policy.maxRecordsPerRun;

    log.info(
      {
        event: "retention.run.completed",
        dryRun,
        policy,
        cutoff: result.cutoffs,
        batchSize: policy.batchSize,
        maxPerRun: policy.maxRecordsPerRun,
        eligible: result.eligible,
        wouldProcess: result.wouldProcess,
        processed: result.processed,
        failed: result.failed,
        limitReached: result.limitReached,
        durationMs: Date.now() - startedAt,
      },
      "Retention run completed"
    );

    return result;
  } finally {
    running = false;
  }
}

function runScheduledRetention(): void {
  if (stopping || running) {
    return;
  }

  void runDataRetention().catch(() => {
    log.error(
      { event: "retention.run.failed" },
      "Scheduled retention run failed"
    );
  });
}

export function initializeDataRetention(options: DataRetentionSchedulerOptions = {}): void {
  if (timer) {
    return;
  }

  stopping = false;
  if (options.runOnStart !== false) {
    runScheduledRetention();
  }

  timer = setInterval(runScheduledRetention, options.intervalMs ?? RETENTION_INTERVAL_MS);
  timer.unref?.();
}

export function closeDataRetention(): void {
  // Mark stopping before clearing the timer so an already-queued tick cannot start a run.
  stopping = true;
  if (timer) {
    clearInterval(timer);
  }
  timer = null;
}

export function isDataRetentionRunning(): boolean {
  return running;
}
