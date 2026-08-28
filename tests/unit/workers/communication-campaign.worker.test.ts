import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  processor: null as null | ((job: unknown) => Promise<unknown>),
  executeAttempt: vi.fn(),
  runCampaign: vi.fn(),
  fallback: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
      mocks.processor = processor;
    }
    on = vi.fn();
    close = vi.fn();
  },
}));
vi.mock("@/lib/redis", () => ({ redisConnection: {} }));
vi.mock("@/lib/logger", () => ({
  createServerLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  normalizeError: vi.fn(),
}));
vi.mock("@/config/communication-plan", () => ({
  getCommunicationPlan: vi.fn(() => ({ tier: "STANDARD", limits: { campaignConcurrency: 2 } })),
}));
vi.mock("@/services/communication/communication-campaign-runner.service", () => ({
  runCommunicationCampaign: mocks.runCampaign,
}));
vi.mock("@/services/communication/communication-outbound-orchestrator.service", () => ({
  executeOutboundCampaignAttempt: mocks.executeAttempt,
}));
vi.mock("@/services/communication/communication-fallback.service", () => ({
  handleWhatsAppFailureFallback: mocks.fallback,
}));

import {
  closeCommunicationCampaignWorker,
  initializeCommunicationCampaignWorker,
} from "@/workers/communication-campaign.worker";

describe("communication campaign recipient worker", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.processor = null;
    await closeCommunicationCampaignWorker();
    mocks.executeAttempt.mockResolvedValue({ reasonCode: "SKIPPED_CAMPAIGN_NOT_RUNNABLE", dryRun: true });
    initializeCommunicationCampaignWorker();
  });

  it("passes only the identifier payload to the state-rechecking executor", async () => {
    const data = {
      jobVersion: 1,
      tenantId: "tenant-1",
      campaignId: "campaign-1",
      campaignRecipientId: "recipient-1",
      contactId: "contact-1",
      attemptNumber: 1,
      scheduledFor: "2026-08-29T10:00:00.000Z",
    };
    const updateProgress = vi.fn();
    const result = await mocks.processor?.({
      name: "run-communication-campaign-recipient",
      data,
      updateProgress,
    });
    expect(mocks.executeAttempt).toHaveBeenCalledWith(data);
    expect(result).toMatchObject({ reasonCode: "SKIPPED_CAMPAIGN_NOT_RUNNABLE" });
    expect(updateProgress).toHaveBeenCalledWith(100);
  });

  it("rejects malformed recipient payloads without invoking execution", async () => {
    const result = await mocks.processor?.({
      name: "run-communication-campaign-recipient",
      data: { tenantId: "", campaignId: "campaign-1", campaignRecipientId: "" },
      updateProgress: vi.fn(),
    });
    expect(mocks.executeAttempt).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skippedCount: 1, dryRun: true });
  });

  it("returns a safe dry-run result for unsupported jobs", async () => {
    const result = await mocks.processor?.({ name: "unknown", data: {}, updateProgress: vi.fn() });
    expect(result).toMatchObject({ communicationCampaignId: "unsupported", skippedCount: 1, dryRun: true });
  });
});
