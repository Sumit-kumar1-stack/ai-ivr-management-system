import {
  getIntegerEnv,
  getOptionalEnv,
} from "@/config/env";

export interface DataRetentionPolicy {
  recordingsDays: number | null;
  transcriptsDays: number | null;
  conversationMetadataDays: number | null;
  auditEventsDays: number | null;
  batchSize: number;
  maxRecordsPerRun: number;
}

export interface DataRetentionDeletionJob {
  tenantId: string;
  scope: "RECORDINGS" | "TRANSCRIPTS" | "CONVERSATION_METADATA" | "AUDIT_EVENTS";
  before: Date;
  reason: string;
  requestedBy: "SYSTEM" | "ADMIN" | "AUDITOR";
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_MAX_RECORDS_PER_RUN = 5_000;
const MAX_BATCH_SIZE = 1_000;
const MAX_RECORDS_PER_RUN = 100_000;

function readRetentionDays(name: string): number | null {
  const value = getIntegerEnv(name, -1, -1);
  return value < 0 ? null : value;
}

function readBoundedPositiveInteger(
  name: string,
  fallback: number,
  maximum: number
): number {
  const value = getOptionalEnv(name);

  if (!value) {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    throw new Error(`${name} must be less than or equal to ${maximum}`);
  }

  return parsed;
}

export function getDataRetentionPolicy(): DataRetentionPolicy {
  // RETENTION_DELETION_BATCH_SIZE remains a temporary compatibility fallback
  // for existing deployments. New deployments must use RETENTION_BATCH_SIZE.
  const batchSize = getOptionalEnv("RETENTION_BATCH_SIZE")
    ? readBoundedPositiveInteger("RETENTION_BATCH_SIZE", DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE)
    : readBoundedPositiveInteger("RETENTION_DELETION_BATCH_SIZE", DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE);
  const maxRecordsPerRun = readBoundedPositiveInteger(
    "RETENTION_MAX_RECORDS_PER_RUN",
    DEFAULT_MAX_RECORDS_PER_RUN,
    MAX_RECORDS_PER_RUN
  );

  if (batchSize > maxRecordsPerRun) {
    throw new Error("RETENTION_BATCH_SIZE must be less than or equal to RETENTION_MAX_RECORDS_PER_RUN");
  }

  return {
    recordingsDays: readRetentionDays("RECORDING_RETENTION_DAYS"),
    transcriptsDays: readRetentionDays("TRANSCRIPT_RETENTION_DAYS"),
    conversationMetadataDays: readRetentionDays("CONVERSATION_METADATA_RETENTION_DAYS"),
    auditEventsDays: readRetentionDays("AUDIT_EVENT_RETENTION_DAYS"),
    batchSize,
    maxRecordsPerRun,
  };
}
