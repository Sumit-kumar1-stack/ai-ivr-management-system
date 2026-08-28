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
      callEvent: {
        findMany:
          vi.fn(),
      },
    })
  );

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      callEvent:
        mocks.callEvent,
    },
  })
);

import {
  CallEventRepository,
} from "@/features/call-events/call-event.repository";

describe(
  "call event repository",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      }
    );

    it(
      "scopes latest audit reads to the owning user",
      async () => {
        mocks.callEvent.findMany.mockResolvedValue(
          []
        );

        await CallEventRepository.getLatest(
          25,
          "tenant-1"
        );

        expect(
          mocks.callEvent.findMany
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              call: {
                campaign: {
                  ownerUserId:
                    "tenant-1",
                },
              },
            },
            take: 25,
          })
        );
      }
    );
  }
);
