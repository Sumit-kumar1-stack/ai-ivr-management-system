export const RECOVERY_JOB_STATES = [
  "active",
  "completed",
  "delayed",
  "failed",
  "paused",
  "prioritized",
  "waiting",
  "waiting-children",
] as const;

export interface FailedCommunicationJob {
  id?: string;
  name: string;
  data: unknown;
  getState(): Promise<string>;
  retry(): Promise<void>;
}

export interface RecoveryQueueReader {
  getJob(jobId: string): Promise<FailedCommunicationJob | undefined>;
  listJobs(): Promise<FailedCommunicationJob[]>;
}

export interface RecoveryCampaignSnapshot {
  id: string;
  status: string;
  approvalStatus: string;
  outboundAttempts: Array<{
    id: string;
    providerRequestId: string | null;
    providerCallId: string | null;
    call: {
      id: string;
      providerCallId: string | null;
    } | null;
  }>;
  calls: Array<{
    id: string;
    providerCallId: string | null;
  }>;
}

export interface FailedJobRecoveryOptions {
  queueName: string;
  jobId: string;
  campaignId: string;
  expectedQueueName: string;
  expectedJobName: string;
  execute: boolean;
  confirmed: boolean;
}

export interface FailedJobRecoveryDependencies {
  queue: RecoveryQueueReader;
  loadCampaign(
    campaignId: string
  ): Promise<RecoveryCampaignSnapshot | null>;
  report(lines: string[]): void;
}

export interface FailedJobRecoveryResult {
  mode: "DRY_RUN" | "EXECUTED";
  jobId: string;
  stateBefore: "failed";
  stateAfter: string | null;
}

function fail(message: string): never {
  throw new Error(`Recovery blocked: ${message}`);
}

function embeddedCampaignId(data: unknown): string | null {
  if (
    typeof data !== "object" ||
    data === null ||
    !("communicationCampaignId" in data)
  ) {
    return null;
  }

  const value = data.communicationCampaignId;

  return typeof value === "string" ? value : null;
}

function matchingOuterJobs(
  jobs: FailedCommunicationJob[],
  expectedJobName: string,
  campaignId: string
): FailedCommunicationJob[] {
  return jobs.filter(
    job =>
      job.name === expectedJobName &&
      embeddedCampaignId(job.data) === campaignId
  );
}

function assertSingleOuterJob(
  jobs: FailedCommunicationJob[],
  expectedJobName: string,
  campaignId: string,
  jobId: string
): void {
  const matches = matchingOuterJobs(jobs, expectedJobName, campaignId);

  if (matches.length !== 1 || matches[0]?.id !== jobId) {
    fail(
      `expected exactly one outer job for campaign ${campaignId}, with ID ${jobId}`
    );
  }
}

function assertNoProviderEvidence(
  campaign: RecoveryCampaignSnapshot
): void {
  const requestEvidence = campaign.outboundAttempts.find(
    attempt => attempt.providerRequestId !== null
  );

  if (requestEvidence) {
    fail(
      `outbound attempt ${requestEvidence.id} has providerRequestId evidence`
    );
  }

  const providerCallEvidence = campaign.outboundAttempts.find(
    attempt => attempt.providerCallId !== null
  );

  if (providerCallEvidence) {
    fail(
      `outbound attempt ${providerCallEvidence.id} has providerCallId evidence`
    );
  }

  const linkedCall = campaign.outboundAttempts.find(
    attempt => attempt.call !== null
  );

  if (linkedCall?.call) {
    fail(
      `Call ${linkedCall.call.id} already exists for outbound attempt ${linkedCall.id}`
    );
  }

  if (campaign.calls.length > 0) {
    fail(`Call ${campaign.calls[0]?.id} already exists for the campaign`);
  }
}

export async function recoverFailedCommunicationCampaignJob(
  options: FailedJobRecoveryOptions,
  dependencies: FailedJobRecoveryDependencies
): Promise<FailedJobRecoveryResult> {
  if (!options.queueName || !options.jobId || !options.campaignId) {
    fail("queue, job, and campaign identifiers are all required");
  }

  if (options.queueName !== options.expectedQueueName) {
    fail(`queue must be ${options.expectedQueueName}`);
  }

  if (options.execute && !options.confirmed) {
    fail("--execute requires --confirm-f3-retry");
  }

  const job = await dependencies.queue.getJob(options.jobId);

  if (!job) {
    fail(`job ${options.jobId} does not exist`);
  }

  if (job.id !== options.jobId) {
    fail(`loaded job ID does not exactly match ${options.jobId}`);
  }

  if (job.name !== options.expectedJobName) {
    fail(`job name must be ${options.expectedJobName}`);
  }

  if (embeddedCampaignId(job.data) !== options.campaignId) {
    fail("embedded communication campaign ID does not match");
  }

  const stateBefore = await job.getState();

  if (stateBefore !== "failed") {
    fail(`job state must be failed; received ${stateBefore}`);
  }

  const campaign = await dependencies.loadCampaign(options.campaignId);

  if (!campaign || campaign.id !== options.campaignId) {
    fail(`campaign ${options.campaignId} does not exist`);
  }

  if (campaign.status !== "RUNNING") {
    fail(`campaign lifecycle must be RUNNING; received ${campaign.status}`);
  }

  if (campaign.approvalStatus !== "APPROVED") {
    fail(
      `campaign approval must be APPROVED; received ${campaign.approvalStatus}`
    );
  }

  assertNoProviderEvidence(campaign);

  const jobsBefore = await dependencies.queue.listJobs();
  assertSingleOuterJob(
    jobsBefore,
    options.expectedJobName,
    options.campaignId,
    options.jobId
  );

  dependencies.report([
    `Mode: ${options.execute ? "EXECUTE" : "DRY_RUN"}`,
    `Queue: ${options.queueName}`,
    `Job: ${options.jobId}`,
    `Campaign: ${options.campaignId}`,
    `Job state: ${stateBefore}`,
    `Campaign lifecycle: ${campaign.status}`,
    `Approval: ${campaign.approvalStatus}`,
    `Outbound attempts checked: ${campaign.outboundAttempts.length}`,
    "Provider-call evidence: NONE",
  ]);

  if (!options.execute) {
    return {
      mode: "DRY_RUN",
      jobId: options.jobId,
      stateBefore: "failed",
      stateAfter: null,
    };
  }

  await job.retry();

  const retriedJob = await dependencies.queue.getJob(options.jobId);

  if (!retriedJob || retriedJob.id !== options.jobId) {
    fail("the same job ID was not present after retry");
  }

  const stateAfter = await retriedJob.getState();

  if (stateAfter === "failed") {
    fail("job remained in the failed state after retry");
  }

  const jobsAfter = await dependencies.queue.listJobs();
  assertSingleOuterJob(
    jobsAfter,
    options.expectedJobName,
    options.campaignId,
    options.jobId
  );

  return {
    mode: "EXECUTED",
    jobId: options.jobId,
    stateBefore: "failed",
    stateAfter,
  };
}
