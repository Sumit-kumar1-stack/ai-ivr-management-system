import {
  afterEach,
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

      const prisma = {
        call: {
          findUnique:
            vi.fn(),
        },
      };

      return {
        logger,
        prisma,

        getBusinessTool:
          vi.fn(),

        registerDefaultBusinessTools:
          vi.fn(),

        startAudit:
          vi.fn(),

        completeAudit:
          vi.fn(),

        enforceRateLimit:
          vi.fn(),

        reconcileStaleToolExecutions:
          vi.fn(),

        handler:
          vi.fn(),
      };
    }
  );

//--------------------------------------------------
// Prisma
//--------------------------------------------------

vi.mock(
  "@/lib/prisma",
  () => ({
    prisma:
      mocks.prisma,
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

    getDurationMs:
      vi.fn(
        () =>
          25
      ),

    normalizeError:
      vi.fn(
        (
          error:
            unknown
        ) => ({
          name:
            error instanceof
              Error
              ? error.name
              : "UnknownError",

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

vi.mock(
  "@/lib/abuse-control",
  () => ({
    enforceRateLimit:
      mocks.enforceRateLimit,
  })
);

//--------------------------------------------------
// Tool Registry
//--------------------------------------------------

vi.mock(
  "@/services/tools/tool-registry.service",
  () => ({
    getBusinessTool:
      mocks
        .getBusinessTool,
  })
);

//--------------------------------------------------
// Default Registration
//--------------------------------------------------

vi.mock(
  "@/services/tools/register-default-tools.service",
  () => ({
    registerDefaultBusinessTools:
      mocks
        .registerDefaultBusinessTools,
  })
);

//--------------------------------------------------
// Durable Audit
//--------------------------------------------------

vi.mock(
  "@/services/tools/tool-execution-audit.service",
  () => ({
    startToolExecutionAudit:
      mocks.startAudit,

    completeToolExecutionAudit:
      mocks.completeAudit,

    reconcileStaleToolExecutions:
      mocks.reconcileStaleToolExecutions,
  })
);

//--------------------------------------------------
// Import Subject After Mocks
//--------------------------------------------------

import {
  executeBusinessTool,
} from "@/services/tools/tool-gateway.service";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const CALL_ID =
  "premium-tool-test-call";

const EXECUTION_ID =
  "tool-execution-test-1";

//--------------------------------------------------
// Deferred Promise
//--------------------------------------------------

interface Deferred<T> {
  promise:
    Promise<T>;

  resolve:
    (
      value:
        T
    ) => void;

  reject:
    (
      reason?:
        unknown
    ) => void;
}

function createDeferred<T>():
  Deferred<T> {
  let resolve:
    (
      value:
        T
    ) => void =
    () => {
      // Replaced by Promise constructor.
    };

  let reject:
    (
      reason?:
        unknown
    ) => void =
    () => {
      // Replaced by Promise constructor.
    };

  const promise =
    new Promise<T>(
      (
        promiseResolve,
        promiseReject
      ) => {
        resolve =
          promiseResolve;

        reject =
          promiseReject;
      }
    );

  return {
    promise,
    resolve,
    reject,
  };
}

//--------------------------------------------------
// Flush Promise Queue
//--------------------------------------------------

async function flushMicrotasks():
  Promise<void> {
  for (
    let count =
      0;
    count <
    12;
    count +=
      1
  ) {
    await Promise.resolve();
  }
}

//--------------------------------------------------
// Require Captured AbortSignal
//--------------------------------------------------

function requireAbortSignal(
  signal:
    AbortSignal |
    null
): AbortSignal {
  if (
    !signal
  ) {
    throw new Error(
      "Expected Tool Gateway to provide an AbortSignal to the handler"
    );
  }

  return signal;
}

//--------------------------------------------------
// Mock Tool Definition
//--------------------------------------------------

function mockToolDefinition(
  timeoutMs =
    1000
): void {
  mocks
    .getBusinessTool
    .mockReturnValue({
      name:
        "searchKnowledgeBase",

      description:
        "Test knowledge tool",

      risk:
        "READ_ONLY",

      mutating:
        false,

      requiresConfirmation:
        false,

      timeoutMs,

      //------------------------------------------------
      // Isolate Gateway From Zod
      //------------------------------------------------

      inputSchema: {
        safeParse:
          vi.fn(
            (
              input:
                unknown
            ) => ({
              success:
                true,

              data:
                input,
            })
          ),
      },

      handler:
        mocks.handler,
    });
}

//--------------------------------------------------
// Request
//--------------------------------------------------

function createRequest(
  signal?:
    AbortSignal
) {
  return {
    tool:
      "searchKnowledgeBase" as const,

    callId:
      CALL_ID,

    input: {
      query:
        "premium resilience test",
    },

    confirmed:
      true,

    requestedBy:
      "AI" as const,

    signal,
  };
}

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "Tool Gateway resilience",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        vi.useRealTimers();

        //------------------------------------------------
        // Tool
        //------------------------------------------------

        mockToolDefinition();

        //------------------------------------------------
        // Existing Call
        //------------------------------------------------

        mocks
          .prisma
          .call
          .findUnique
          .mockResolvedValue({
            id:
              CALL_ID,

            tenantId:
              "tenant-1",
          });

        //------------------------------------------------
        // Durable Audit
        //------------------------------------------------

        mocks
          .startAudit
          .mockResolvedValue({
            executionId:
              EXECUTION_ID,

            created:
              true,

            status:
              "STARTED",
          });

        mocks
          .completeAudit
          .mockResolvedValue(
            undefined
          );

        mocks
          .reconcileStaleToolExecutions
          .mockResolvedValue(
            undefined
          );

        mocks
          .enforceRateLimit
          .mockResolvedValue({
            allowed:
              true,

            current:
              1,

            limit:
              30,

            windowMs:
              60_000,

            retryAfterMs:
              60_000,

            key:
              "abuse:tool-search:1",
          });

        //------------------------------------------------
        // Default Tool Result
        //------------------------------------------------

        mocks
          .handler
          .mockResolvedValue({
            ok:
              true,
          });
      }
    );

    afterEach(
      () => {
        vi.useRealTimers();
      }
    );

    //------------------------------------------------
    // Normal Success
    //------------------------------------------------

    it(
      "records SUCCEEDED when the handler completes normally",
      async () => {
        const result =
          await executeBusinessTool(
            createRequest()
          );

        expect(
          mocks
            .reconcileStaleToolExecutions
        ).toHaveBeenCalled();

        expect(
          mocks
            .prisma
            .call
            .findUnique
        ).toHaveBeenCalled();

        expect(
          mocks.handler
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result.success
        ).toBe(
          true
        );

        if (
          !result.success
        ) {
          throw new Error(
            "Expected successful tool result"
          );
        }

        expect(
          result.result
        ).toEqual({
          ok:
            true,
        });

        expect(
          mocks.completeAudit
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            executionId:
              EXECUTION_ID,

            status:
              "SUCCEEDED",
          })
        );
      }
    );

    it(
      "aborts a knowledge search when the rate limit is exceeded",
      async () => {
        mocks
          .enforceRateLimit
          .mockResolvedValueOnce({
            allowed:
              false,

            current:
              31,

            limit:
              30,

            windowMs:
              60_000,

            retryAfterMs:
              2_000,

            key:
              "abuse:tool-search:over",
          });

        const result =
          await executeBusinessTool(
            createRequest()
          );

        expect(
          result.success
        ).toBe(false);

        if (
          result.success
        ) {
          throw new Error(
            "Expected rate-limited tool result"
          );
        }

        expect(
          result.error.code
        ).toBe(
          "RATE_LIMITED"
        );

        expect(
          mocks.handler
        ).not.toHaveBeenCalled();

        expect(
          mocks.completeAudit
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            executionId:
              EXECUTION_ID,

            status:
              "ABORTED",

            errorCode:
              "RATE_LIMITED",
          })
        );
      }
    );

    //------------------------------------------------
    // Already Aborted
    //------------------------------------------------

    it(
      "does not execute the handler when the parent signal is already aborted",
      async () => {
        const controller =
          new AbortController();

        controller.abort(
          new Error(
            "Caller cancelled operation"
          )
        );

        const result =
          await executeBusinessTool(
            createRequest(
              controller.signal
            )
          );

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          result.success
        ) {
          throw new Error(
            "Expected aborted tool result"
          );
        }

        expect(
          result.error.code
        ).toBe(
          "TOOL_ABORTED"
        );

        expect(
          mocks.handler
        ).not.toHaveBeenCalled();

        expect(
          mocks.completeAudit
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            executionId:
              EXECUTION_ID,

            status:
              "ABORTED",

            errorCode:
              "TOOL_ABORTED",
          })
        );

        expect(
          mocks.completeAudit
        ).not.toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              "SUCCEEDED",
          })
        );
      }
    );

    //------------------------------------------------
    // Parent Cancellation During Execution
    //------------------------------------------------

    it(
      "does not report success when a handler finishes after parent cancellation",
      async () => {
        const controller =
          new AbortController();

        const deferred =
          createDeferred<{
            providerAccepted:
              boolean;
          }>();

        const handlerSignalRef: {
          current:
            AbortSignal |
            null;
        } = {
          current:
            null,
        };

        mocks
          .handler
          .mockImplementation(
            async (
              _input:
                unknown,

              context: {
                signal:
                  AbortSignal;
              }
            ) => {
              handlerSignalRef.current =
                context.signal;

              //------------------------------------------------
              // Provider intentionally ignores cancellation.
              //------------------------------------------------

              return deferred.promise;
            }
          );

        //------------------------------------------------
        // Start
        //------------------------------------------------

        const operation =
          executeBusinessTool(
            createRequest(
              controller.signal
            )
          );

        await flushMicrotasks();

        expect(
          mocks.handler
        ).toHaveBeenCalledTimes(
          1
        );

        const handlerSignal =
          requireAbortSignal(
            handlerSignalRef.current
          );

        expect(
          handlerSignal.aborted
        ).toBe(
          false
        );

        //------------------------------------------------
        // Parent Cancels
        //------------------------------------------------

        controller.abort(
          new Error(
            "Gemini Live tool cancelled"
          )
        );

        expect(
          handlerSignal.aborted
        ).toBe(
          true
        );

        //------------------------------------------------
        // Provider Resolves After Cancellation
        //------------------------------------------------

        deferred.resolve({
          providerAccepted:
            true,
        });

        const result =
          await operation;

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          result.success
        ) {
          throw new Error(
            "Late completion must not become success"
          );
        }

        expect(
          result.error.code
        ).toBe(
          "TOOL_ABORTED"
        );

        expect(
          mocks.completeAudit
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            executionId:
              EXECUTION_ID,

            status:
              "ABORTED",

            errorCode:
              "TOOL_ABORTED",
          })
        );

        expect(
          mocks.completeAudit
        ).not.toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              "SUCCEEDED",
          })
        );
      }
    );

    //------------------------------------------------
    // Gateway Timeout
    //------------------------------------------------

    it(
      "records TIMED_OUT instead of success when a handler resolves after its timeout",
      async () => {
        vi.useFakeTimers();

        //------------------------------------------------
        // 100ms Tool Timeout
        //------------------------------------------------

        mockToolDefinition(
          100
        );

        const deferred =
          createDeferred<{
            providerAccepted:
              boolean;
          }>();

        const handlerSignalRef: {
          current:
            AbortSignal |
            null;
        } = {
          current:
            null,
        };

        mocks
          .handler
          .mockImplementation(
            async (
              _input:
                unknown,

              context: {
                signal:
                  AbortSignal;
              }
            ) => {
              handlerSignalRef.current =
                context.signal;

              //------------------------------------------------
              // Provider intentionally ignores AbortSignal.
              //------------------------------------------------

              return deferred.promise;
            }
          );

        //------------------------------------------------
        // Start
        //------------------------------------------------

        const operation =
          executeBusinessTool(
            createRequest()
          );

        await flushMicrotasks();

        expect(
          mocks.handler
        ).toHaveBeenCalledTimes(
          1
        );

        const handlerSignal =
          requireAbortSignal(
            handlerSignalRef.current
          );

        expect(
          handlerSignal.aborted
        ).toBe(
          false
        );

        //------------------------------------------------
        // Trigger Gateway Timeout
        //------------------------------------------------

        await vi.advanceTimersByTimeAsync(
          101
        );

        expect(
          handlerSignal.aborted
        ).toBe(
          true
        );

        //------------------------------------------------
        // Provider Resolves After Timeout
        //------------------------------------------------

        deferred.resolve({
          providerAccepted:
            true,
        });

        const result =
          await operation;

        expect(
          result.success
        ).toBe(
          false
        );

        if (
          result.success
        ) {
          throw new Error(
            "Timed-out tool must not become success"
          );
        }

        expect(
          result.error.code
        ).toBe(
          "TOOL_TIMEOUT"
        );

        expect(
          mocks.completeAudit
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            executionId:
              EXECUTION_ID,

            status:
              "TIMED_OUT",

            errorCode:
              "TOOL_TIMEOUT",
          })
        );

        expect(
          mocks.completeAudit
        ).not.toHaveBeenCalledWith(
          expect.objectContaining({
            status:
              "SUCCEEDED",
          })
        );
      }
    );
  }
);
