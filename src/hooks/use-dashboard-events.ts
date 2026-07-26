"use client";

import {
  useEffect,
} from "react";

import {
  useSocket,
} from "@/contexts/socket-context";

import {
  ActiveCall,
  DashboardMetrics,
  TimelineEvent,
  useDashboardStore,
} from "@/store/dashboard.store";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

type SocketPayload = {
  callId?: string;
  phone?: string;
  language?: string;
  duration?: number;
  customerName?: string;
  campaignName?: string;
  providerCallId?:
    | string
    | null;
  text?: string;
};

function getCallId(
  payload:
    SocketPayload
): string | null {
  if (
    typeof payload.callId !==
      "string" ||
    !payload.callId
  ) {
    return null;
  }

  return payload.callId;
}

function createCallFallback(
  payload:
    SocketPayload
): Partial<ActiveCall> {
  return {
    phone:
      payload.phone ??
      "Unknown",

    startedAt:
      Date.now(),

    language:
      payload.language,

    duration:
      payload.duration,

    customerName:
      payload.customerName,

    campaignName:
      payload.campaignName,

    providerCallId:
      payload.providerCallId,
  };
}

function decrementMetric(
  value: number
): number {
  return Math.max(
    0,
    value - 1
  );
}

export function useDashboardEvents() {
  const socket =
    useSocket();

  useEffect(
    () => {
      const controller =
        new AbortController();

      async function bootstrapDashboard(): Promise<void> {
        try {
          const [
            metricsResponse,
            activeResponse,
            timelineResponse,
          ] =
            await Promise.all([
              fetch(
                "/api/dashboard/metrics",
                {
                  cache:
                    "no-store",

                  signal:
                    controller.signal,
                }
              ),

              fetch(
                "/api/dashboard/active",
                {
                  cache:
                    "no-store",

                  signal:
                    controller.signal,
                }
              ),

              fetch(
                "/api/dashboard/timeline",
                {
                  cache:
                    "no-store",

                  signal:
                    controller.signal,
                }
              ),
            ]);

          const [
            metricsResult,
            activeResult,
            timelineResult,
          ] =
            await Promise.all([
              metricsResponse.json() as
                Promise<
                  ApiResponse<DashboardMetrics>
                >,

              activeResponse.json() as
                Promise<
                  ApiResponse<ActiveCall[]>
                >,

              timelineResponse.json() as
                Promise<
                  ApiResponse<TimelineEvent[]>
                >,
            ]);

          if (
            controller.signal
              .aborted
          ) {
            return;
          }

          const store =
            useDashboardStore.getState();

          if (
            metricsResponse.ok &&
            metricsResult.success &&
            metricsResult.data
          ) {
            store.setMetrics(
              metricsResult.data
            );
          }

          if (
            activeResponse.ok &&
            activeResult.success &&
            activeResult.data
          ) {
            store.setActiveCalls(
              activeResult.data
            );
          }

          if (
            timelineResponse.ok &&
            timelineResult.success &&
            timelineResult.data
          ) {
            store.setTimeline(
              timelineResult.data
            );
          }
        } catch (
          error
        ) {
          if (
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          ) {
            return;
          }

          console.error(
            "Dashboard bootstrap failed:",
            error
          );
        }
      }

      void bootstrapDashboard();

      const handler = (
        event: string,
        rawPayload:
          unknown
      ) => {
        const payload =
          (
            rawPayload &&
            typeof rawPayload ===
              "object"
          )
            ? rawPayload as
                SocketPayload
            : {};

        const store =
          useDashboardStore.getState();

        store.addEvent(
          event,
          payload
        );

        const callId =
          getCallId(
            payload
          );

        switch (
          event
        ) {
          case "CALL_STARTED": {
            if (
              !callId
            ) {
              break;
            }

            const callExists =
              store.activeCalls.some(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            store.updateActiveCallStatus(
              callId,
              "Started",
              createCallFallback(
                payload
              )
            );

            if (
              !callExists
            ) {
              store.setMetrics({
                activeCalls:
                  store.metrics
                    .activeCalls +
                  1,
              });
            }

            break;
          }

          case "CALL_QUEUED": {
            if (
              !callId
            ) {
              break;
            }

            const callExists =
              store.activeCalls.some(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            store.updateActiveCallStatus(
              callId,
              "Queued",
              createCallFallback(
                payload
              )
            );

            store.setMetrics({
              activeCalls:
                callExists
                  ? store.metrics
                      .activeCalls
                  : store.metrics
                      .activeCalls +
                    1,

              queuedCalls:
                callExists
                  ? store.metrics
                      .queuedCalls
                  : store.metrics
                      .queuedCalls +
                    1,
            });

            break;
          }

          case "CALL_RINGING": {
            if (
              !callId
            ) {
              break;
            }

            const previous =
              store.activeCalls.find(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            store.updateActiveCallStatus(
              callId,
              "Ringing",
              createCallFallback(
                payload
              )
            );

            if (
              previous?.status ===
              "Queued"
            ) {
              store.setMetrics({
                queuedCalls:
                  decrementMetric(
                    store.metrics
                      .queuedCalls
                  ),
              });
            }

            break;
          }

          case "CALL_ANSWERED": {
            if (
              !callId
            ) {
              break;
            }

            const previous =
              store.activeCalls.find(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            store.updateActiveCallStatus(
              callId,
              "Answered",
              createCallFallback(
                payload
              )
            );

            if (
              previous?.status ===
              "Queued"
            ) {
              store.setMetrics({
                queuedCalls:
                  decrementMetric(
                    store.metrics
                      .queuedCalls
                  ),
              });
            }

            break;
          }

          case "CALL_LISTENING": {
            if (
              !callId
            ) {
              break;
            }

            const previous =
              store.activeCalls.find(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            store.updateActiveCallStatus(
              callId,
              "Listening",
              createCallFallback(
                payload
              )
            );

            store.setMetrics({
              thinkingCalls:
                previous?.status ===
                "AI Thinking"
                  ? decrementMetric(
                      store.metrics
                        .thinkingCalls
                    )
                  : store.metrics
                      .thinkingCalls,

              speakingCalls:
                previous?.status ===
                "AI Speaking"
                  ? decrementMetric(
                      store.metrics
                        .speakingCalls
                    )
                  : store.metrics
                      .speakingCalls,
            });

            break;
          }

          case "CALL_THINKING": {
            if (
              !callId
            ) {
              break;
            }

            const previous =
              store.activeCalls.find(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            store.updateActiveCallStatus(
              callId,
              "AI Thinking",
              createCallFallback(
                payload
              )
            );

            store.setMetrics({
              thinkingCalls:
                previous?.status ===
                "AI Thinking"
                  ? store.metrics
                      .thinkingCalls
                  : store.metrics
                      .thinkingCalls +
                    1,

              speakingCalls:
                previous?.status ===
                "AI Speaking"
                  ? decrementMetric(
                      store.metrics
                        .speakingCalls
                    )
                  : store.metrics
                      .speakingCalls,
            });

            break;
          }

          case "CALL_SPEAKING": {
            if (
              !callId
            ) {
              break;
            }

            const previous =
              store.activeCalls.find(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            store.updateActiveCallStatus(
              callId,
              "AI Speaking",
              createCallFallback(
                payload
              )
            );

            store.setMetrics({
              speakingCalls:
                previous?.status ===
                "AI Speaking"
                  ? store.metrics
                      .speakingCalls
                  : store.metrics
                      .speakingCalls +
                    1,

              thinkingCalls:
                previous?.status ===
                "AI Thinking"
                  ? decrementMetric(
                      store.metrics
                        .thinkingCalls
                    )
                  : store.metrics
                      .thinkingCalls,
            });

            break;
          }

          case "CALL_COMPLETED": {
            if (
              !callId
            ) {
              break;
            }

            const previous =
              store.activeCalls.find(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            if (
              previous
            ) {
              store.setMetrics({
                activeCalls:
                  decrementMetric(
                    store.metrics
                      .activeCalls
                  ),

                queuedCalls:
                  previous.status ===
                  "Queued"
                    ? decrementMetric(
                        store.metrics
                          .queuedCalls
                      )
                    : store.metrics
                        .queuedCalls,

                thinkingCalls:
                  previous.status ===
                  "AI Thinking"
                    ? decrementMetric(
                        store.metrics
                          .thinkingCalls
                      )
                    : store.metrics
                        .thinkingCalls,

                speakingCalls:
                  previous.status ===
                  "AI Speaking"
                    ? decrementMetric(
                        store.metrics
                          .speakingCalls
                      )
                    : store.metrics
                        .speakingCalls,

                completedCalls:
                  store.metrics
                    .completedCalls +
                  1,
              });
            }

            store.removeActiveCall(
              callId
            );

            break;
          }

          case "CALL_FAILED":
          case "CALL_BUSY":
          case "CALL_NO_ANSWER":
          case "CALL_CANCELED": {
            if (
              !callId
            ) {
              break;
            }

            const previous =
              store.activeCalls.find(
                (
                  call
                ) =>
                  call.id ===
                  callId
              );

            if (
              previous
            ) {
              store.setMetrics({
                activeCalls:
                  decrementMetric(
                    store.metrics
                      .activeCalls
                  ),

                queuedCalls:
                  previous.status ===
                  "Queued"
                    ? decrementMetric(
                        store.metrics
                          .queuedCalls
                      )
                    : store.metrics
                        .queuedCalls,

                thinkingCalls:
                  previous.status ===
                  "AI Thinking"
                    ? decrementMetric(
                        store.metrics
                          .thinkingCalls
                      )
                    : store.metrics
                        .thinkingCalls,

                speakingCalls:
                  previous.status ===
                  "AI Speaking"
                    ? decrementMetric(
                        store.metrics
                          .speakingCalls
                      )
                    : store.metrics
                        .speakingCalls,

                failedCalls:
                  store.metrics
                    .failedCalls +
                  1,
              });
            }

            store.removeActiveCall(
              callId
            );

            break;
          }

          default:
            break;
        }

        if (
          event ===
            "TRANSCRIPT" &&
          callId &&
          payload.text
        ) {
          store.appendMessage(
            callId,
            "user",
            payload.text
          );
        }

        if (
          event ===
            "AI_RESPONSE" &&
          callId &&
          payload.text
        ) {
          store.appendMessage(
            callId,
            "assistant",
            payload.text
          );
        }
      };

      socket.onAny(
        handler
      );

      return () => {
        controller.abort();

        socket.offAny(
          handler
        );
      };
    },
    [
      socket,
    ]
  );
}