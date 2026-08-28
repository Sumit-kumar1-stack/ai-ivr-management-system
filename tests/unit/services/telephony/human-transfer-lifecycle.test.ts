import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(
    () => ({
      redis: {
        set:
          vi.fn(),

        get:
          vi.fn(),

        del:
          vi.fn(),
      },

      eventPublisher: {
        publish:
          vi.fn(),
      },
    })
  );

vi.mock(
  "@/lib/redis",
  () => ({
    redisConnection:
      mocks.redis,
  })
);

vi.mock(
  "@/core/events",
  () => ({
    AppEvent: {
      HUMAN_TRANSFER:
        "audit.human_transfer",
    },

    EventPublisher:
      mocks.eventPublisher,
  })
);

import {
  markHumanTransferRequested,
} from "@/services/telephony/human-transfer-lifecycle.service";

describe(
  "human transfer lifecycle audit",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks.redis.set.mockResolvedValue(
          "OK"
        );
      }
    );

    it(
      "emits an audit event when a transfer is requested",
      async () => {
        const state =
          await markHumanTransferRequested(
            "call-1"
          );

        expect(
          state.status
        ).toBe(
          "REQUESTED"
        );

        expect(
          mocks.eventPublisher.publish
        ).toHaveBeenCalledWith(
          "audit.human_transfer",
          expect.objectContaining({
            callId:
              "call-1",

            transferStatus:
              "REQUESTED",
          })
        );
      }
    );
  }
);
