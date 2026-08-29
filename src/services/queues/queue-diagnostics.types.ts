import type { Queue } from "bullmq";

export const QUEUE_DIAGNOSTIC_JOB_TYPES = [
  "waiting",
  "active",
  "delayed",
  "prioritized",
] as const;

export interface QueueDiagnosticCounts {
  waiting: number;
  active: number;
  delayed: number;
  prioritized: number;
}

export async function readQueueDiagnosticCounts(
  queue: Pick<Queue, "getJobCounts">
): Promise<QueueDiagnosticCounts> {
  const counts = await queue.getJobCounts(...QUEUE_DIAGNOSTIC_JOB_TYPES);

  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    prioritized: counts.prioritized ?? 0,
  };
}
