import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
  getJob: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    add = mocks.add;
    close = mocks.close;
    getJob = mocks.getJob;
  },
}));

vi.mock("@/lib/redis", () => ({
  redisConnection: {},
}));

vi.mock("@/services/queues/queue-diagnostics.types", () => ({
  readQueueDiagnosticCounts: vi.fn(),
}));

import {
  buildCommunicationRecipientAttemptJobId,
  CommunicationCampaignQueueService,
} from "@/services/communication/communication-campaign-queue.service";

const recipientJob = {
  jobVersion: 1 as const,
  tenantId: "tenant-1",
  campaignId: "campaign-1",
  campaignRecipientId: "recipient-1",
  contactId: "contact-1",
  attemptNumber: 1,
  scheduledFor: "2026-08-29T12:00:00.000Z",
};

describe("communication campaign recipient queue identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await CommunicationCampaignQueueService.close();
  });

  it("builds a deterministic BullMQ-safe custom job ID", () => {
    const first = buildCommunicationRecipientAttemptJobId(recipientJob);
    const second = buildCommunicationRecipientAttemptJobId({ ...recipientJob });

    expect(first).toBe("outbound-call-campaign-1-recipient-1-1");
    expect(first).not.toContain(":");
    expect(second).toBe(first);
  });

  it("gives different logical recipient attempts different IDs", () => {
    const original = buildCommunicationRecipientAttemptJobId(recipientJob);
    const differentRecipient = buildCommunicationRecipientAttemptJobId({
      ...recipientJob,
      campaignRecipientId: "recipient-2",
    });
    const differentAttempt = buildCommunicationRecipientAttemptJobId({
      ...recipientJob,
      attemptNumber: 2,
    });

    expect(new Set([original, differentRecipient, differentAttempt]).size).toBe(3);
  });

  it("preserves duplicate enqueue suppression for the deterministic ID", async () => {
    let storedJob:
      | { id: string; getState: () => Promise<string> }
      | undefined;

    mocks.getJob.mockImplementation(async (jobId: string) =>
      storedJob?.id === jobId ? storedJob : undefined
    );
    mocks.add.mockImplementation(async (_name, _data, options) => {
      storedJob = {
        id: options.jobId,
        getState: async () => "waiting",
      };
      return storedJob;
    });

    const first =
      await CommunicationCampaignQueueService.enqueueRecipientAttempt(
        recipientJob
      );
    const second =
      await CommunicationCampaignQueueService.enqueueRecipientAttempt(
        recipientJob
      );

    expect(first.id).toBe("outbound-call-campaign-1-recipient-1-1");
    expect(second).toBe(first);
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.getJob).toHaveBeenNthCalledWith(
      1,
      "outbound-call-campaign-1-recipient-1-1"
    );
    expect(mocks.getJob).toHaveBeenNthCalledWith(
      2,
      "outbound-call-campaign-1-recipient-1-1"
    );
  });
});
