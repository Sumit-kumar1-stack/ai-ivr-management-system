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
      create:
        vi.fn(),

      emitAsync:
        vi.fn(),

      add:
        vi.fn(),
    })
  );

vi.mock(
  "@/features/call-events",
  () => ({
    CallEventService: {
      create:
        mocks.create,
    },
  })
);

vi.mock(
  "@/core/events/event-bus",
  () => ({
    eventBus: {
      emitAsync:
        mocks.emitAsync,
    },
  })
);

vi.mock(
  "@/core/events/event-monitor.service",
  () => ({
    EventMonitor: {
      add:
        mocks.add,
    },
  })
);

import {
  AppEvent,
  EventPublisher,
} from "@/core/events";

describe(
  "audit event publisher",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        mocks.create.mockResolvedValue(
          {
            id:
              "call-event-1",
          }
        );

        mocks.emitAsync.mockResolvedValue(
          undefined
        );
      }
    );

    it(
      "sanitizes secrets from audit event payloads before persistence",
      async () => {
        await EventPublisher.publish(
          AppEvent.ACTION_REQUESTED,
          {
            callId:
              "call-1",

            campaignId:
              "campaign-1",

            actionCode:
              "SEND_INFORMATION",

            actorType:
              "SYSTEM",

            secret:
              "do-not-store",

            password:
              "top-secret",
          }
        );

        expect(
          mocks.create
        ).toHaveBeenCalledTimes(
          1
        );

        const [
          callId,
          type,
          message,
          payload,
        ] =
          mocks.create.mock.calls[0];

        expect(
          callId
        ).toBe(
          "call-1"
        );

        expect(
          type
        ).toBe(
          "ACTION_REQUESTED"
        );

        expect(
          message
        ).toBe(
          AppEvent.ACTION_REQUESTED
        );

        expect(
          JSON.stringify(
            payload
          )
        ).not.toContain(
          "do-not-store"
        );

        expect(
          JSON.stringify(
            payload
          )
        ).not.toContain(
          "top-secret"
        );
      }
    );
  }
);
