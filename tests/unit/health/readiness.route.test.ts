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
    () => {
      const logger = {
        debug:
          vi.fn(),

        info:
          vi.fn(),

        warn:
          vi.fn(),

        error:
          vi.fn(),
      };

      return {
        queryRaw:
          vi.fn(),

        redisPing:
          vi.fn(),

        logger,

        getDurationMs:
          vi.fn(),

        normalizeError:
          vi.fn(),

        checkIntegrationConfiguration:
          vi.fn(),

        isIntegrationConfigurationReady:
          vi.fn(),
      };
    }
  );

//--------------------------------------------------
// Shared Configuration Fixture
//--------------------------------------------------

const HEALTHY_CONFIGURATION = {
  application: {
    healthy:
      true,

    message:
      "Application configuration is valid",
  },

  redisConfiguration: {
    healthy:
      true,

    message:
      "Redis configuration is valid",
  },

  twilioConfiguration: {
    healthy:
      true,

    message:
      "Twilio configuration is valid",
  },

  aiConfiguration: {
    healthy:
      true,

    message:
      "Gemini and Deepgram configuration is valid",
  },
};

//--------------------------------------------------
// Module Mocks
//--------------------------------------------------

vi.mock(
  "@/config/readiness",
  () => ({
    checkIntegrationConfiguration:
      mocks.checkIntegrationConfiguration,

    isIntegrationConfigurationReady:
      mocks.isIntegrationConfigurationReady,
  })
);

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma: {
      $queryRaw:
        mocks.queryRaw,
    },
  })
);

vi.mock(
  "@/lib/redis",
  () => ({
    redisConnection: {
      ping:
        mocks.redisPing,
    },
  })
);

vi.mock(
  "@/lib/logger",
  () => ({
    createServerLogger:
      vi.fn(
        () =>
          mocks.logger
      ),

    getDurationMs:
      mocks.getDurationMs,

    normalizeError:
      mocks.normalizeError,
  })
);

//--------------------------------------------------
// Import Route After Mocks
//--------------------------------------------------

import {
  GET,
} from "@/app/api/ready/route";

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "GET /api/ready",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        vi.stubEnv(
          "NODE_ENV",
          "test"
        );

        mocks
          .queryRaw
          .mockResolvedValue([
            {
              "?column?":
                1,
            },
          ]);

        mocks
          .redisPing
          .mockResolvedValue(
            "PONG"
          );

        mocks
          .checkIntegrationConfiguration
          .mockReturnValue(
            HEALTHY_CONFIGURATION
          );

        mocks
          .isIntegrationConfigurationReady
          .mockReturnValue(
            true
          );

        mocks
          .getDurationMs
          .mockReturnValue(
            5
          );

        mocks
          .normalizeError
          .mockImplementation(
            (
              error:
                unknown
            ) => ({
              message:
                error instanceof Error
                  ? error.message
                  : String(
                      error
                    ),
            })
          );
      }
    );

    //------------------------------------------------
    // Fully Ready
    //------------------------------------------------

    it(
      "returns 200 when database, Redis, and integration configuration are healthy",
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
            "ready",

          service:
            "ai-ivr-management-system",

          process:
            "web",

          environment:
            "test",

          durationMs:
            5,

          dependencies: {
            database: {
              healthy:
                true,

              durationMs:
                5,

              message:
                "PostgreSQL connection available",
            },

            redis: {
              healthy:
                true,

              durationMs:
                5,

              message:
                "Redis connection available",
            },

            configuration:
              HEALTHY_CONFIGURATION,
          },
        });

        expect(
          body.dependencies
        ).not.toHaveProperty(
          "workers"
        );

        expect(
          mocks
            .checkIntegrationConfiguration
        ).toHaveBeenCalledOnce();

        expect(
          mocks
            .isIntegrationConfigurationReady
        ).toHaveBeenCalledWith(
          HEALTHY_CONFIGURATION
        );

        expect(
          mocks.logger.debug
        ).toHaveBeenCalled();

        expect(
          mocks.logger.warn
        ).not.toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Database Failure
    //------------------------------------------------

    it(
      "returns 503 when PostgreSQL is unavailable",
      async () => {
        mocks
          .queryRaw
          .mockRejectedValue(
            new Error(
              "Database unavailable"
            )
          );

        const response =
          await GET();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          503
        );

        expect(
          body.success
        ).toBe(
          false
        );

        expect(
          body.status
        ).toBe(
          "not_ready"
        );

        expect(
          body.process
        ).toBe(
          "web"
        );

        expect(
          body.dependencies.database
        ).toEqual({
          healthy:
            false,

          durationMs:
            5,

          message:
            "Database unavailable",
        });

        expect(
          body.dependencies.redis.healthy
        ).toBe(
          true
        );

        expect(
          body.dependencies.configuration
        ).toEqual(
          HEALTHY_CONFIGURATION
        );

        expect(
          body.dependencies
        ).not.toHaveProperty(
          "workers"
        );

        expect(
          mocks.logger.warn
        ).toHaveBeenCalled();
      }
    );

    //------------------------------------------------
    // Redis Failure
    //------------------------------------------------

    it(
      "returns 503 when Redis ping throws",
      async () => {
        mocks
          .redisPing
          .mockRejectedValue(
            new Error(
              "Redis unavailable"
            )
          );

        const response =
          await GET();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          503
        );

        expect(
          body.process
        ).toBe(
          "web"
        );

        expect(
          body.dependencies.redis
        ).toEqual({
          healthy:
            false,

          durationMs:
            5,

          message:
            "Redis unavailable",
        });

        expect(
          body.dependencies.configuration
        ).toEqual(
          HEALTHY_CONFIGURATION
        );

        expect(
          body.dependencies
        ).not.toHaveProperty(
          "workers"
        );
      }
    );

    it(
      "returns 503 when Redis returns an unexpected response",
      async () => {
        mocks
          .redisPing
          .mockResolvedValue(
            "LOADING"
          );

        const response =
          await GET();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          503
        );

        expect(
          body.process
        ).toBe(
          "web"
        );

        expect(
          body.dependencies.redis
        ).toEqual({
          healthy:
            false,

          durationMs:
            5,

          message:
            "Unexpected Redis response: LOADING",
        });

        expect(
          body.dependencies.configuration
        ).toEqual(
          HEALTHY_CONFIGURATION
        );

        expect(
          body.dependencies
        ).not.toHaveProperty(
          "workers"
        );
      }
    );

    //------------------------------------------------
    // Multiple Failures
    //------------------------------------------------

    it(
      "reports all dependency failures in one response",
      async () => {
        mocks
          .queryRaw
          .mockRejectedValue(
            new Error(
              "PostgreSQL offline"
            )
          );

        mocks
          .redisPing
          .mockRejectedValue(
            new Error(
              "Redis offline"
            )
          );

        const response =
          await GET();

        const body =
          await response.json();

        expect(
          response.status
        ).toBe(
          503
        );

        expect(
          body.process
        ).toBe(
          "web"
        );

        expect(
          body.dependencies.database.healthy
        ).toBe(
          false
        );

        expect(
          body.dependencies.redis.healthy
        ).toBe(
          false
        );

        expect(
          body.dependencies.configuration
        ).toEqual(
          HEALTHY_CONFIGURATION
        );

        expect(
          body.dependencies
        ).not.toHaveProperty(
          "workers"
        );
      }
    );

    //------------------------------------------------
    // Concurrent Checks
    //------------------------------------------------

    it(
      "starts PostgreSQL and Redis checks before either one resolves",
      async () => {
        let resolveDatabase:
          (() => void) |
          undefined;

        let resolveRedis:
          (() => void) |
          undefined;

        const databasePromise =
          new Promise<void>(
            resolve => {
              resolveDatabase =
                resolve;
            }
          );

        const redisPromise =
          new Promise<string>(
            resolve => {
              resolveRedis =
                () =>
                  resolve(
                    "PONG"
                  );
            }
          );

        mocks
          .queryRaw
          .mockImplementation(
            () =>
              databasePromise
          );

        mocks
          .redisPing
          .mockImplementation(
            () =>
              redisPromise
          );

        const readinessPromise =
          GET();

        await Promise.resolve();

        expect(
          mocks.queryRaw
        ).toHaveBeenCalledOnce();

        expect(
          mocks.redisPing
        ).toHaveBeenCalledOnce();

        resolveDatabase?.();

        resolveRedis?.();

        const response =
          await readinessPromise;

        expect(
          response.status
        ).toBe(
          200
        );

        expect(
          mocks
            .isIntegrationConfigurationReady
        ).toHaveBeenCalledWith(
          HEALTHY_CONFIGURATION
        );
      }
    );

    //------------------------------------------------
    // Headers
    //------------------------------------------------

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

    //------------------------------------------------
    // Error Response Safety
    //------------------------------------------------

    it(
      "does not expose stack traces in readiness responses",
      async () => {
        const databaseError =
          new Error(
            "Database connection failed"
          );

        databaseError.stack =
          "SECRET_INTERNAL_STACK_TRACE";

        mocks
          .queryRaw
          .mockRejectedValue(
            databaseError
          );

        const response =
          await GET();

        const body =
          await response.json();

        const serialized =
          JSON.stringify(
            body
          );

        expect(
          serialized
        ).not.toContain(
          "SECRET_INTERNAL_STACK_TRACE"
        );

        expect(
          serialized
        ).not.toContain(
          "stack"
        );

        expect(
          body.dependencies.database.message
        ).toBe(
          "Database connection failed"
        );
      }
    );
  }
);