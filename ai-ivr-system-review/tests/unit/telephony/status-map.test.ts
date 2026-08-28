import {
  CallStatus,
} from "@prisma/client";

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  mapProviderStatus,
} from "@/providers/telephony/status-map";

describe(
  "mapProviderStatus",
  () => {
    afterEach(
      () => {
        vi.restoreAllMocks();
      }
    );

    //------------------------------------------------
    // Queued
    //------------------------------------------------

    it.each([
      "queued",
      "initiated",
    ])(
      "maps %s to QUEUED",
      providerStatus => {
        expect(
          mapProviderStatus(
            providerStatus
          )
        ).toBe(
          CallStatus.QUEUED
        );
      }
    );

    //------------------------------------------------
    // Ringing
    //------------------------------------------------

    it(
      "maps ringing to RINGING",
      () => {
        expect(
          mapProviderStatus(
            "ringing"
          )
        ).toBe(
          CallStatus.RINGING
        );
      }
    );

    //------------------------------------------------
    // Answered
    //------------------------------------------------

    it.each([
      "answered",
      "in-progress",
    ])(
      "maps %s to ANSWERED",
      providerStatus => {
        expect(
          mapProviderStatus(
            providerStatus
          )
        ).toBe(
          CallStatus.ANSWERED
        );
      }
    );

    //------------------------------------------------
    // Completed
    //------------------------------------------------

    it(
      "maps completed to COMPLETED",
      () => {
        expect(
          mapProviderStatus(
            "completed"
          )
        ).toBe(
          CallStatus.COMPLETED
        );
      }
    );

    //------------------------------------------------
    // Failure Statuses
    //------------------------------------------------

    it(
      "maps busy to BUSY",
      () => {
        expect(
          mapProviderStatus(
            "busy"
          )
        ).toBe(
          CallStatus.BUSY
        );
      }
    );

    it(
      "maps no-answer to NO_ANSWER",
      () => {
        expect(
          mapProviderStatus(
            "no-answer"
          )
        ).toBe(
          CallStatus.NO_ANSWER
        );
      }
    );

    it(
      "maps failed to FAILED",
      () => {
        expect(
          mapProviderStatus(
            "failed"
          )
        ).toBe(
          CallStatus.FAILED
        );
      }
    );

    //------------------------------------------------
    // Cancelled Spellings
    //------------------------------------------------

    it.each([
      "canceled",
      "cancelled",
    ])(
      "maps %s to CANCELED",
      providerStatus => {
        expect(
          mapProviderStatus(
            providerStatus
          )
        ).toBe(
          CallStatus.CANCELED
        );
      }
    );

    //------------------------------------------------
    // Input Normalization
    //------------------------------------------------

    it(
      "normalizes spaces and uppercase text",
      () => {
        expect(
          mapProviderStatus(
            "  COMPLETED  "
          )
        ).toBe(
          CallStatus.COMPLETED
        );
      }
    );

    it(
      "normalizes mixed-case provider statuses",
      () => {
        expect(
          mapProviderStatus(
            "In-Progress"
          )
        ).toBe(
          CallStatus.ANSWERED
        );
      }
    );

    //------------------------------------------------
    // Unknown Status
    //------------------------------------------------

    it(
      "maps an unknown provider status to FAILED",
      () => {
        const warning =
          vi.spyOn(
            console,
            "warn"
          ).mockImplementation(
            () => undefined
          );

        const result =
          mapProviderStatus(
            "provider-unknown-status"
          );

        expect(
          result
        ).toBe(
          CallStatus.FAILED
        );

        expect(
          warning
        ).toHaveBeenCalledWith(
          "Unknown provider call status",
          {
            status:
              "provider-unknown-status",
          }
        );
      }
    );

    it(
      "maps an empty status to FAILED and logs a warning",
      () => {
        const warning =
          vi.spyOn(
            console,
            "warn"
          ).mockImplementation(
            () => undefined
          );

        const result =
          mapProviderStatus(
            "   "
          );

        expect(
          result
        ).toBe(
          CallStatus.FAILED
        );

        expect(
          warning
        ).toHaveBeenCalledOnce();
      }
    );
  }
);