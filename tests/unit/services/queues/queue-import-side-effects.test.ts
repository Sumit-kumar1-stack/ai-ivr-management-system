import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

//--------------------------------------------------
// Hoisted Mocks
//--------------------------------------------------

const mocks =
  vi.hoisted(
    () => ({
      queueConstructor:
        vi.fn(),

      add:
        vi.fn(),

      getJob:
        vi.fn(),

      getJobs:
        vi.fn(),

      close:
        vi.fn(),

      logger: {
        info:
          vi.fn(),

        warn:
          vi.fn(),

        error:
          vi.fn(),

        debug:
          vi.fn(),
      },
    })
  );

//--------------------------------------------------
// BullMQ
//--------------------------------------------------

vi.mock(
  "bullmq",
  () => ({
    Queue:
      class MockQueue {
        constructor(
          ...args:
            unknown[]
        ) {
          mocks
            .queueConstructor(
              ...args
            );
        }

        add =
          mocks.add;

        getJob =
          mocks.getJob;

        getJobs =
          mocks.getJobs;

        close =
          mocks.close;
      },
  })
);

//--------------------------------------------------
// Redis
//--------------------------------------------------

vi.mock(
  "@/lib/redis",
  () => ({
    redisConnection: {
      status:
        "wait",
    },
  })
);

//--------------------------------------------------
// Logger
//--------------------------------------------------

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    normalizeError:
      vi.fn(
        (
          error:
            unknown
        ) => ({
          message:
            error instanceof
              Error
              ? error.message
              : String(
                  error
                ),
        })
      ),
  })
);

//--------------------------------------------------
// Setup
//--------------------------------------------------

beforeEach(
  () => {
    vi.resetModules();

    mocks
      .queueConstructor
      .mockClear();

    mocks
      .add
      .mockReset();

    mocks
      .getJob
      .mockReset();

    mocks
      .getJobs
      .mockReset();

    mocks
      .close
      .mockReset();

    mocks.add.mockResolvedValue({
      id:
        "job-1",
    });

    mocks
      .getJob
      .mockResolvedValue(
        undefined
      );

    mocks
      .getJobs
      .mockResolvedValue(
        []
      );

    mocks
      .close
      .mockResolvedValue(
        undefined
      );
  }
);

//--------------------------------------------------
// Legacy Campaign Queue
//--------------------------------------------------

describe(
  "Campaign queue import side effects",
  () => {
    it(
      "does not construct BullMQ Queue merely by importing the module",
      async () => {
        await import(
          "@/services/campaigns/campaign-queue.service"
        );

        expect(
          mocks
            .queueConstructor
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "constructs exactly one queue on first real operation",
      async () => {
        const {
          CampaignQueueService,
        } =
          await import(
            "@/services/campaigns/campaign-queue.service"
          );

        await CampaignQueueService
          .getJob(
            "run-1"
          );

        await CampaignQueueService
          .getJob(
            "run-2"
          );

        expect(
          mocks
            .queueConstructor
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    it(
      "does not create a queue when close is called before use",
      async () => {
        const {
          CampaignQueueService,
        } =
          await import(
            "@/services/campaigns/campaign-queue.service"
          );

        await CampaignQueueService
          .close();

        expect(
          mocks
            .queueConstructor
        ).not.toHaveBeenCalled();

        expect(
          mocks.close
        ).not.toHaveBeenCalled();
      }
    );
  }
);

//--------------------------------------------------
// Communication Queue
//--------------------------------------------------

describe(
  "Communication queue import side effects",
  () => {
    it(
      "does not construct BullMQ Queue merely by importing the module",
      async () => {
        await import(
          "@/services/communication/communication-campaign-queue.service"
        );

        expect(
          mocks
            .queueConstructor
        ).not.toHaveBeenCalled();
      }
    );

    it(
      "constructs exactly one queue when campaign and fallback jobs are enqueued",
      async () => {
        const {
          CommunicationCampaignQueueService,
        } =
          await import(
            "@/services/communication/communication-campaign-queue.service"
          );

        await CommunicationCampaignQueueService
          .enqueue(
            {
              communicationCampaignId:
                "communication-1",
            }
          );

        await CommunicationCampaignQueueService
          .enqueueWhatsAppSmsFallback(
            "message-1"
          );

        expect(
          mocks
            .queueConstructor
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks.add
        ).toHaveBeenCalledTimes(
          2
        );
      }
    );

    it(
      "deduplicates repeated launch and scheduler ticks by campaign job id",
      async () => {
        const existing = {
          getState: vi.fn().mockResolvedValue("delayed"),
          remove: vi.fn(),
        };
        mocks.getJob
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(existing);

        const {
          CommunicationCampaignQueueService,
        } = await import(
          "@/services/communication/communication-campaign-queue.service"
        );

        await CommunicationCampaignQueueService.enqueue(
          { communicationCampaignId: "campaign-1" },
          60_000
        );
        await CommunicationCampaignQueueService.enqueue(
          { communicationCampaignId: "campaign-1" },
          60_000
        );

        expect(mocks.getJob).toHaveBeenNthCalledWith(1, "communication-campaign-1");
        expect(mocks.getJob).toHaveBeenNthCalledWith(2, "communication-campaign-1");
        expect(mocks.add).toHaveBeenCalledTimes(1);
        expect(mocks.add).toHaveBeenCalledWith(
          "run-communication-campaign",
          { communicationCampaignId: "campaign-1" },
          expect.objectContaining({ jobId: "communication-campaign-1" })
        );
      }
    );

    it(
      "enqueues recipient attempts with deterministic job ids",
      async () => {
        const {
          CommunicationCampaignQueueService,
        } =
          await import(
            "@/services/communication/communication-campaign-queue.service"
          );

        await CommunicationCampaignQueueService
          .enqueueRecipientAttempt(
            {
              jobVersion:
                1,

              tenantId:
                "tenant-1",

              campaignId:
                "campaign-1",

              campaignRecipientId:
                "recipient-1",

              contactId:
                "contact-1",

              attemptNumber:
                1,

              scheduledFor:
                "2026-08-29T10:00:00.000Z",
            }
          );

        expect(
          mocks.queueConstructor
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          mocks.add
        ).toHaveBeenCalledWith(
          "run-communication-campaign-recipient",
          expect.objectContaining({
            campaignId:
              "campaign-1",
          }),
          expect.objectContaining({
            jobId:
              "outbound-call:campaign-1:recipient-1:1",
          })
        );
      }
    );

    it(
      "uses the minimal secret-safe recipient payload",
      async () => {
        const {
          CommunicationCampaignQueueService,
        } = await import(
          "@/services/communication/communication-campaign-queue.service"
        );

        await CommunicationCampaignQueueService.enqueueRecipientAttempt({
          jobVersion: 1,
          tenantId: "tenant-1",
          campaignId: "campaign-1",
          campaignRecipientId: "recipient-1",
          contactId: "contact-1",
          attemptNumber: 2,
          scheduledFor: "2026-08-29T10:05:00.000Z",
        });

        const payload = mocks.add.mock.calls[0][1];
        expect(Object.keys(payload).sort()).toEqual([
          "attemptNumber",
          "campaignId",
          "campaignRecipientId",
          "contactId",
          "jobVersion",
          "scheduledFor",
          "tenantId",
        ]);

        const serialized = JSON.stringify(payload);
        for (const forbidden of [
          "PLIVO_AUTH_TOKEN",
          "PLIVO_AUTH_ID",
          "TWILIO_AUTH_TOKEN",
          "EXOTEL_API_TOKEN",
          "TELNYX_API_KEY",
          "DATABASE_URL",
          "REDIS_URL",
          "knowledgeDocumentIds",
          "nodes",
          "edges",
          "phone",
          "email",
          "address",
        ]) {
          expect(serialized).not.toContain(forbidden);
        }
      }
    );

    it(
      "returns an existing active attempt job instead of adding a duplicate",
      async () => {
        const existing = {
          getState: vi.fn().mockResolvedValue("waiting"),
          remove: vi.fn(),
        };
        mocks.getJob
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(existing);

        const {
          CommunicationCampaignQueueService,
        } = await import(
          "@/services/communication/communication-campaign-queue.service"
        );

        const data = {
          jobVersion: 1 as const,
          tenantId: "tenant-1",
          campaignId: "campaign-1",
          campaignRecipientId: "recipient-1",
          contactId: "contact-1",
          attemptNumber: 1,
          scheduledFor: "2026-08-29T10:00:00.000Z",
        };

        await CommunicationCampaignQueueService.enqueueRecipientAttempt(data);
        await CommunicationCampaignQueueService.enqueueRecipientAttempt(data);
        expect(mocks.getJob).toHaveBeenNthCalledWith(1, "outbound-call:campaign-1:recipient-1:1");
        expect(mocks.getJob).toHaveBeenNthCalledWith(2, "outbound-call:campaign-1:recipient-1:1");
        expect(mocks.add).toHaveBeenCalledTimes(1);
      }
    );

    it(
      "does not create a queue when close is called before use",
      async () => {
        const {
          CommunicationCampaignQueueService,
        } =
          await import(
            "@/services/communication/communication-campaign-queue.service"
          );

        await CommunicationCampaignQueueService
          .close();

        expect(
          mocks
            .queueConstructor
        ).not.toHaveBeenCalled();

        expect(
          mocks.close
        ).not.toHaveBeenCalled();
      }
    );
  }
);
