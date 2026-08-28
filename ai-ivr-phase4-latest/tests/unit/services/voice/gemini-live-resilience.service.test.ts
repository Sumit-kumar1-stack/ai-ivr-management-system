import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  GeminiLiveOperationTimeoutError,
  GeminiLiveResilienceService,
} from "@/services/voice/gemini-live-resilience.service";

//--------------------------------------------------
// Constants
//--------------------------------------------------

const CALL_ID =
  "premium-call-resilience-test";

//--------------------------------------------------
// Tests
//--------------------------------------------------

describe(
  "GeminiLiveResilienceService",
  () => {
    beforeEach(
      () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-08-18T06:00:00.000Z"
          )
        );

        GeminiLiveResilienceService
          .clearCall(
            CALL_ID
          );
      }
    );

    afterEach(
      () => {
        GeminiLiveResilienceService
          .clearCall(
            CALL_ID
          );

        vi.useRealTimers();
      }
    );

    //------------------------------------------------
    // Connection State
    //------------------------------------------------

    describe(
      "connection state",
      () => {
        it(
          "creates resilience state when connection begins",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            const snapshot =
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                );

            expect(
              snapshot
            ).not.toBeNull();

            expect(
              snapshot?.callId
            ).toBe(
              CALL_ID
            );

            expect(
              snapshot
                ?.connectionStartedAt
            ).toBe(
              Date.now()
            );

            expect(
              snapshot
                ?.reconnectAttempts
            ).toBe(
              0
            );

            expect(
              snapshot
                ?.consecutiveAudioFailures
            ).toBe(
              0
            );

            expect(
              snapshot
                ?.consecutiveToolFailures
            ).toBe(
              0
            );
          }
        );

        it(
          "clears all call resilience state",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            expect(
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                )
            ).not.toBeNull();

            GeminiLiveResilienceService
              .clearCall(
                CALL_ID
              );

            expect(
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                )
            ).toBeNull();
          }
        );
      }
    );

    //------------------------------------------------
    // Session Resumption
    //------------------------------------------------

    describe(
      "session resumption",
      () => {
        it(
          "stores the latest safe resumption handle",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            GeminiLiveResilienceService
              .noteSessionResumptionUpdate(
                CALL_ID,
                {
                  resumable:
                    true,

                  newHandle:
                    "resume-handle-1",

                  lastConsumedClientMessageIndex:
                    "42",
                }
              );

            expect(
              GeminiLiveResilienceService
                .getResumeHandle(
                  CALL_ID
                )
            ).toBe(
              "resume-handle-1"
            );

            const snapshot =
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                );

            expect(
              snapshot?.resumable
            ).toBe(
              true
            );

            expect(
              snapshot
                ?.latestResumptionHandle
            ).toBe(
              "resume-handle-1"
            );

            expect(
              snapshot
                ?.lastConsumedClientMessageIndex
            ).toBe(
              "42"
            );
          }
        );

        it(
          "does not expose a resume handle while session is not resumable",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            GeminiLiveResilienceService
              .noteSessionResumptionUpdate(
                CALL_ID,
                {
                  resumable:
                    true,

                  newHandle:
                    "safe-handle",

                  lastConsumedClientMessageIndex:
                    "50",
                }
              );

            expect(
              GeminiLiveResilienceService
                .getResumeHandle(
                  CALL_ID
                )
            ).toBe(
              "safe-handle"
            );

            //------------------------------------------------
            // Gemini may temporarily mark resumption unsafe
            // during generation / function execution.
            //------------------------------------------------

            GeminiLiveResilienceService
              .noteSessionResumptionUpdate(
                CALL_ID,
                {
                  resumable:
                    false,

                  lastConsumedClientMessageIndex:
                    "51",
                }
              );

            expect(
              GeminiLiveResilienceService
                .getResumeHandle(
                  CALL_ID
                )
            ).toBeNull();

            //------------------------------------------------
            // Latest stored handle should remain available
            // internally for future resumable updates.
            //------------------------------------------------

            const snapshot =
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                );

            expect(
              snapshot
                ?.latestResumptionHandle
            ).toBe(
              "safe-handle"
            );

            expect(
              snapshot
                ?.resumable
            ).toBe(
              false
            );
          }
        );

        it(
          "replaces an older resume handle with the newest handle",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            GeminiLiveResilienceService
              .noteSessionResumptionUpdate(
                CALL_ID,
                {
                  resumable:
                    true,

                  newHandle:
                    "handle-1",
                }
              );

            GeminiLiveResilienceService
              .noteSessionResumptionUpdate(
                CALL_ID,
                {
                  resumable:
                    true,

                  newHandle:
                    "handle-2",
                }
              );

            expect(
              GeminiLiveResilienceService
                .getResumeHandle(
                  CALL_ID
                )
            ).toBe(
              "handle-2"
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Bounded Reconnect
    //------------------------------------------------

    describe(
      "reconnect protection",
      () => {
        beforeEach(
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            GeminiLiveResilienceService
              .noteSessionResumptionUpdate(
                CALL_ID,
                {
                  resumable:
                    true,

                  newHandle:
                    "reconnect-handle",
                }
              );
          }
        );

        it(
          "allows at most three reconnect attempts",
          () => {
            const first =
              GeminiLiveResilienceService
                .beginReconnect(
                  CALL_ID
                );

            const second =
              GeminiLiveResilienceService
                .beginReconnect(
                  CALL_ID
                );

            const third =
              GeminiLiveResilienceService
                .beginReconnect(
                  CALL_ID
                );

            const fourth =
              GeminiLiveResilienceService
                .beginReconnect(
                  CALL_ID
                );

            expect(
              first.allowed
            ).toBe(
              true
            );

            expect(
              first.attempt
            ).toBe(
              1
            );

            expect(
              second.allowed
            ).toBe(
              true
            );

            expect(
              second.attempt
            ).toBe(
              2
            );

            expect(
              third.allowed
            ).toBe(
              true
            );

            expect(
              third.attempt
            ).toBe(
              3
            );

            expect(
              fourth.allowed
            ).toBe(
              false
            );

            expect(
              fourth.maxAttempts
            ).toBe(
              3
            );
          }
        );

        it(
          "returns the safe resume handle with reconnect attempt",
          () => {
            const reconnect =
              GeminiLiveResilienceService
                .beginReconnect(
                  CALL_ID
                );

            expect(
              reconnect.allowed
            ).toBe(
              true
            );

            expect(
              reconnect.resumeHandle
            ).toBe(
              "reconnect-handle"
            );
          }
        );

        it(
          "resets reconnect counter after successful recovery",
          () => {
            GeminiLiveResilienceService
              .beginReconnect(
                CALL_ID
              );

            GeminiLiveResilienceService
              .beginReconnect(
                CALL_ID
              );

            expect(
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                )
                ?.reconnectAttempts
            ).toBe(
              2
            );

            GeminiLiveResilienceService
              .recordReconnectSuccess(
                CALL_ID
              );

            expect(
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                )
                ?.reconnectAttempts
            ).toBe(
              0
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Audio Circuit
    //------------------------------------------------

    describe(
      "audio failure circuit",
      () => {
        it(
          "terminates after five consecutive audio failures",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            for (
              let count =
                1;
              count <=
              4;
              count +=
                1
            ) {
              const failure =
                GeminiLiveResilienceService
                  .recordAudioFailure(
                    CALL_ID,
                    new Error(
                      `audio failure ${count}`
                    )
                  );

              expect(
                failure.terminate
              ).toBe(
                false
              );
            }

            const terminal =
              GeminiLiveResilienceService
                .recordAudioFailure(
                  CALL_ID,
                  new Error(
                    "audio failure 5"
                  )
                );

            expect(
              terminal.count
            ).toBe(
              5
            );

            expect(
              terminal.terminate
            ).toBe(
              true
            );
          }
        );

        it(
          "resets consecutive audio failures after success",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            GeminiLiveResilienceService
              .recordAudioFailure(
                CALL_ID,
                new Error(
                  "failure"
                )
              );

            GeminiLiveResilienceService
              .recordAudioFailure(
                CALL_ID,
                new Error(
                  "failure"
                )
              );

            GeminiLiveResilienceService
              .recordAudioSuccess(
                CALL_ID
              );

            expect(
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                )
                ?.consecutiveAudioFailures
            ).toBe(
              0
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Tool Circuit
    //------------------------------------------------

    describe(
      "tool failure circuit",
      () => {
        it(
          "opens after three consecutive tool failures",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            const first =
              GeminiLiveResilienceService
                .recordToolFailure(
                  CALL_ID,
                  new Error(
                    "tool failure 1"
                  )
                );

            const second =
              GeminiLiveResilienceService
                .recordToolFailure(
                  CALL_ID,
                  new Error(
                    "tool failure 2"
                  )
                );

            const third =
              GeminiLiveResilienceService
                .recordToolFailure(
                  CALL_ID,
                  new Error(
                    "tool failure 3"
                  )
                );

            expect(
              first.terminate
            ).toBe(
              false
            );

            expect(
              second.terminate
            ).toBe(
              false
            );

            expect(
              third.count
            ).toBe(
              3
            );

            expect(
              third.terminate
            ).toBe(
              true
            );
          }
        );

        it(
          "resets consecutive tool failures after a success",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            GeminiLiveResilienceService
              .recordToolFailure(
                CALL_ID,
                new Error(
                  "temporary failure"
                )
              );

            GeminiLiveResilienceService
              .recordToolSuccess(
                CALL_ID
              );

            expect(
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                )
                ?.consecutiveToolFailures
            ).toBe(
              0
            );
          }
        );
      }
    );

    //------------------------------------------------
    // Operation Timeout
    //------------------------------------------------

    describe(
      "operation timeout",
      () => {
        it(
          "returns normally when operation finishes before timeout",
          async () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            const result =
              await GeminiLiveResilienceService
                .runWithTimeout(
                  CALL_ID,

                  "tool:test",

                  Promise.resolve(
                    "completed"
                  ),

                  1000
                );

            expect(
              result
            ).toBe(
              "completed"
            );
          }
        );

        it(
          "rejects with GeminiLiveOperationTimeoutError when operation hangs",
          async () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            const neverCompletes =
              new Promise<string>(
                () => {
                  // Intentionally unresolved.
                }
              );

            const operation =
              GeminiLiveResilienceService
                .runWithTimeout(
                  CALL_ID,

                  "tool:hanging-test",

                  neverCompletes,

                  1000
                );

            //------------------------------------------------
            // Prevent early unhandled-rejection reporting
            //------------------------------------------------

            const assertion =
              expect(
                operation
              ).rejects.toBeInstanceOf(
                GeminiLiveOperationTimeoutError
              );

            await vi.advanceTimersByTimeAsync(
              1001
            );

            await assertion;
          }
        );

        it(
          "includes operation metadata in timeout error",
          async () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            const operation =
              GeminiLiveResilienceService
                .runWithTimeout(
                  CALL_ID,

                  "knowledge-search",

                  new Promise<void>(
                    () => {
                      // Intentionally unresolved.
                    }
                  ),

                  2500
                );

            const caught =
              operation.catch(
                error =>
                  error
              );

            await vi.advanceTimersByTimeAsync(
              2501
            );

            const error =
              await caught;

            expect(
              error
            ).toBeInstanceOf(
              GeminiLiveOperationTimeoutError
            );

            expect(
              error.operation
            ).toBe(
              "knowledge-search"
            );

            expect(
              error.timeoutMs
            ).toBe(
              2500
            );

            expect(
              error.code
            ).toBe(
              "GEMINI_LIVE_OPERATION_TIMEOUT"
            );
          }
        );
      }
    );

    //------------------------------------------------
    // GoAway
    //------------------------------------------------

    describe(
      "GoAway state",
      () => {
        it(
          "records provider GoAway state",
          () => {
            GeminiLiveResilienceService
              .beginConnection(
                CALL_ID
              );

            GeminiLiveResilienceService
              .noteGoAway(
                CALL_ID,
                "10s"
              );

            const snapshot =
              GeminiLiveResilienceService
                .getSnapshot(
                  CALL_ID
                );

            expect(
              snapshot?.goAway
            ).not.toBeNull();

            expect(
              snapshot
                ?.goAway
                ?.receivedAt
            ).toBe(
              Date.now()
            );

            expect(
              snapshot
                ?.goAway
                ?.timeLeftMs
            ).toBe(
              10_000
            );
          }
        );
      }
    );
  }
);