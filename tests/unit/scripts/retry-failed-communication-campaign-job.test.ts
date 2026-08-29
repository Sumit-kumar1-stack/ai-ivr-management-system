import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recoverFailedCommunicationCampaignJob,
  type FailedCommunicationJob,
  type RecoveryCampaignSnapshot,
} from "../../../scripts/lib/retry-failed-communication-campaign-job";

const JOB_ID = "communication-campaign-1";
const CAMPAIGN_ID = "campaign-1";

function campaign(
  overrides: Partial<RecoveryCampaignSnapshot> = {}
): RecoveryCampaignSnapshot {
  return {
    id: CAMPAIGN_ID,
    status: "RUNNING",
    approvalStatus: "APPROVED",
    outboundAttempts: [
      {
        id: "attempt-1",
        providerRequestId: null,
        providerCallId: null,
        call: null,
      },
    ],
    calls: [],
    ...overrides,
  };
}

describe("failed communication campaign job recovery", () => {
  const retry = vi.fn<() => Promise<void>>();
  const remove = vi.fn();
  const add = vi.fn();
  const enqueue = vi.fn();
  let state = "failed";
  let job: FailedCommunicationJob & { remove: typeof remove };
  let loadCampaign: ReturnType<
    typeof vi.fn<
      (campaignId: string) => Promise<RecoveryCampaignSnapshot | null>
    >
  >;
  let getJob: ReturnType<typeof vi.fn>;
  let listJobs: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = "failed";
    job = {
      id: JOB_ID,
      name: "run-communication-campaign",
      data: { communicationCampaignId: CAMPAIGN_ID },
      getState: vi.fn(async () => state),
      retry: retry.mockImplementation(async () => {
        state = "waiting";
      }),
      remove,
    };
    loadCampaign = vi.fn(async () => campaign());
    getJob = vi.fn(async () => job);
    listJobs = vi.fn(async () => [job]);
  });

  function run(
    execute = false,
    confirmed = false
  ) {
    return recoverFailedCommunicationCampaignJob(
      {
        queueName: "communication-campaign-processing",
        jobId: JOB_ID,
        campaignId: CAMPAIGN_ID,
        expectedQueueName: "communication-campaign-processing",
        expectedJobName: "run-communication-campaign",
        execute,
        confirmed,
      },
      {
        queue: { getJob, listJobs, add } as never,
        loadCampaign,
        report: vi.fn(),
      }
    );
  }

  it("blocks when the job is missing", async () => {
    getJob.mockResolvedValueOnce(undefined);
    await expect(run()).rejects.toThrow("does not exist");
  });

  it("blocks when the job is not failed", async () => {
    state = "waiting";
    await expect(run()).rejects.toThrow("job state must be failed");
  });

  it("blocks when the embedded campaign ID is wrong", async () => {
    job.data = { communicationCampaignId: "campaign-2" };
    await expect(run()).rejects.toThrow("embedded communication campaign ID");
  });

  it("blocks when providerRequestId exists", async () => {
    loadCampaign.mockResolvedValueOnce(
      campaign({
        outboundAttempts: [
          {
            id: "attempt-1",
            providerRequestId: "request-1",
            providerCallId: null,
            call: null,
          },
        ],
      })
    );
    await expect(run()).rejects.toThrow("providerRequestId evidence");
  });

  it("blocks when providerCallId exists", async () => {
    loadCampaign.mockResolvedValueOnce(
      campaign({
        outboundAttempts: [
          {
            id: "attempt-1",
            providerRequestId: null,
            providerCallId: "call-uuid-1",
            call: null,
          },
        ],
      })
    );
    await expect(run()).rejects.toThrow("providerCallId evidence");
  });

  it("blocks when a Call already exists", async () => {
    loadCampaign.mockResolvedValueOnce(
      campaign({ calls: [{ id: "call-1", providerCallId: null }] })
    );
    await expect(run()).rejects.toThrow("already exists for the campaign");
  });

  it("defaults to dry-run behavior and does not retry", async () => {
    const result = await run();
    expect(result.mode).toBe("DRY_RUN");
    expect(retry).not.toHaveBeenCalled();
  });

  it("retries the same job exactly once without add, enqueue, or remove", async () => {
    const result = await run(true, true);
    expect(result).toMatchObject({
      mode: "EXECUTED",
      jobId: JOB_ID,
      stateAfter: "waiting",
    });
    expect(retry).toHaveBeenCalledOnce();
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(add).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
