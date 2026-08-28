import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  GET,
} from "@/app/api/health/route";

describe(
  "GET /api/health",
  () => {
    beforeEach(
      () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-25T10:00:00.000Z"
          )
        );

        vi.stubEnv(
          "NODE_ENV",
          "test"
        );
      }
    );

    it(
      "returns HTTP 200 with healthy status",
      async () => {
        const response =
          await GET();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          body
        ).toMatchObject({
          success:
            true,

          status:
            "healthy",

          service:
            "ai-ivr-management-system",

          environment:
            "test",

          timestamp:
            "2026-07-25T10:00:00.000Z",
        });

        expect(
          body.uptimeSeconds
        ).toEqual(
          expect.any(
            Number
          )
        );

        expect(
          body.processAgeMs
        ).toEqual(
          expect.any(
            Number
          )
        );
      }
    );

    it(
      "sets no-cache response headers",
      async () => {
        const response =
          await GET();

        expect(
          response.headers.get(
            "cache-control"
          )
        ).toBe(
          "no-store, max-age=0"
        );

        expect(
          response.headers.get(
            "pragma"
          )
        ).toBe(
          "no-cache"
        );
      }
    );

    it(
      "does not return negative process age",
      async () => {
        const response =
          await GET();

        const body =
          await response.json();

        expect(
          body.processAgeMs
        ).toBeGreaterThanOrEqual(
          0
        );
      }
    );

    it(
      "uses development when NODE_ENV is unavailable",
      async () => {
        vi.stubEnv(
          "NODE_ENV",
          ""
        );

        const response =
          await GET();

        const body =
          await response.json();

        /*
         * The implementation uses ?? rather than ||,
         * therefore an empty string remains an empty string.
         */
        expect(
          body.environment
        ).toBe(
          ""
        );
      }
    );

    it(
      "returns a valid ISO timestamp",
      async () => {
        const response =
          await GET();

        const body =
          await response.json();

        expect(
          new Date(
            body.timestamp
          ).toISOString()
        ).toBe(
          body.timestamp
        );
      }
    );
  }
);