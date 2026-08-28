import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(
  () => ({
    redisConnection: {
      eval: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
    },

    logger: {
      warn: vi.fn(),
    },
  })
);

vi.mock(
  "@/lib/redis",
  () => ({
    redisConnection:
      mocks.redisConnection,
  })
);

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(() => mocks.logger),

    normalizeError:
      vi.fn(
        (error: unknown) => ({
          message:
            error instanceof Error
              ? error.message
              : String(error),
        })
      ),
  })
);

import {
  enforceRateLimit,
  withIdempotentResponse,
} from "@/lib/abuse-control";

describe(
  "abuse-control",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();
      }
    );

    it(
      "blocks when the fixed-window limit is exceeded",
      async () => {
        mocks.redisConnection.eval.mockResolvedValue(
          [3, 1_500]
        );

        const result =
          await enforceRateLimit({
            scope: "launch",
            limit: 2,
            windowMs: 60_000,
            keyParts: [
              "tenant-1",
              "campaign-1",
            ],
          });

        expect(
          result.allowed
        ).toBe(false);
        expect(
          result.current
        ).toBe(3);
        expect(
          result.limit
        ).toBe(2);
        expect(
          result.retryAfterMs
        ).toBe(1_500);
      }
    );

    it(
      "stores and replays an idempotent response",
      async () => {
        mocks.redisConnection.get
          .mockResolvedValueOnce(
            null
          )
          .mockResolvedValueOnce(
            JSON.stringify({
              state: "DONE",
              response: {
                status: 200,
                body: {
                  ok: true,
                },
              },
            })
          );

        mocks.redisConnection.set
          .mockResolvedValueOnce("OK")
          .mockResolvedValueOnce("OK");

        const operation =
          vi.fn().mockResolvedValue({
            status: 200,
            body: {
              ok: true,
            },
          });

        const first =
          await withIdempotentResponse({
            scope: "call-start",
            keyParts: [
              "fingerprint-1",
            ],
            ttlMs: 60_000,
            operation,
          });

        const second =
          await withIdempotentResponse({
            scope: "call-start",
            keyParts: [
              "fingerprint-1",
            ],
            ttlMs: 60_000,
            operation,
          });

        expect(
          first.duplicate
        ).toBe(false);
        expect(
          first.response?.body
        ).toEqual({
          ok: true,
        });

        expect(
          second.duplicate
        ).toBe(true);
        expect(
          second.cached
        ).toBe(true);
        expect(
          second.response?.body
        ).toEqual({
          ok: true,
        });

        expect(
          operation
        ).toHaveBeenCalledTimes(1);
      }
    );
  }
);
