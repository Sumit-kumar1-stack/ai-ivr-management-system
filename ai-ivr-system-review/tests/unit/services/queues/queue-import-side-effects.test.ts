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