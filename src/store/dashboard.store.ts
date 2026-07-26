"use client";

import {
  create,
} from "zustand";

export interface TimelineEvent {
  id?: string;
  callId?: string;
  event: string;
  payload: unknown;
  timestamp: number;
}

export interface DashboardMetrics {
  activeCalls: number;
  queuedCalls: number;
  thinkingCalls: number;
  speakingCalls: number;
  completedCalls: number;
  failedCalls: number;
}

export interface ActiveCall {
  id: string;
  phone: string;
  status: string;
  startedAt: number;
  language?: string;
  duration?: number;
  customerName?: string;
  campaignName?: string;
  providerCallId?:
    | string
    | null;
}

export interface ConversationMessage {
  id: string;
  role:
    | "user"
    | "assistant";
  content: string;
}

export interface LiveConversation {
  callId: string;
  messages:
    ConversationMessage[];
}

interface DashboardState {
  metrics:
    DashboardMetrics;

  timeline:
    TimelineEvent[];

  activeCalls:
    ActiveCall[];

  conversations:
    Record<
      string,
      LiveConversation
    >;

  setMetrics: (
    metrics:
      Partial<DashboardMetrics>
  ) => void;

  setTimeline: (
    events:
      TimelineEvent[]
  ) => void;

  addEvent: (
    event: string,
    payload: unknown
  ) => void;

  clearTimeline:
    () => void;

  setActiveCalls: (
    calls:
      ActiveCall[]
  ) => void;

  upsertActiveCall: (
    call:
      ActiveCall
  ) => void;

  updateActiveCallStatus: (
    id: string,
    status: string,
    fallback?:
      Partial<ActiveCall>
  ) => void;

  removeActiveCall: (
    id: string
  ) => void;

  appendMessage: (
    callId: string,
    role:
      | "user"
      | "assistant",
    content: string
  ) => void;
}

const initialMetrics:
  DashboardMetrics = {
    activeCalls:
      0,

    queuedCalls:
      0,

    thinkingCalls:
      0,

    speakingCalls:
      0,

    completedCalls:
      0,

    failedCalls:
      0,
  };

export const useDashboardStore =
  create<DashboardState>(
    (
      set
    ) => ({
      metrics: {
        ...initialMetrics,
      },

      timeline:
        [],

      activeCalls:
        [],

      conversations:
        {},

      setMetrics:
        (
          metrics
        ) =>
          set(
            (
              state
            ) => ({
              metrics: {
                ...state.metrics,
                ...metrics,
              },
            })
          ),

      setTimeline:
        (
          events
        ) =>
          set({
            timeline:
              events.slice(
                0,
                100
              ),
          }),

      addEvent:
        (
          event,
          payload
        ) =>
          set(
            (
              state
            ) => ({
              timeline: [
                {
                  event,
                  payload,
                  timestamp:
                    Date.now(),
                },
                ...state.timeline,
              ].slice(
                0,
                100
              ),
            })
          ),

      clearTimeline:
        () =>
          set({
            timeline:
              [],
          }),

      setActiveCalls:
        (
          calls
        ) =>
          set({
            activeCalls:
              calls,
          }),

      upsertActiveCall:
        (
          call
        ) =>
          set(
            (
              state
            ) => {
              const existing =
                state.activeCalls.find(
                  (
                    currentCall
                  ) =>
                    currentCall.id ===
                    call.id
                );

              if (
                !existing
              ) {
                return {
                  activeCalls: [
                    call,
                    ...state.activeCalls,
                  ],
                };
              }

              return {
                activeCalls:
                  state.activeCalls.map(
                    (
                      currentCall
                    ) =>
                      currentCall.id ===
                      call.id
                        ? {
                            ...currentCall,
                            ...call,

                            startedAt:
                              currentCall.startedAt ??
                              call.startedAt,
                          }
                        : currentCall
                  ),
              };
            }
          ),

      updateActiveCallStatus:
        (
          id,
          status,
          fallback
        ) =>
          set(
            (
              state
            ) => {
              const existing =
                state.activeCalls.find(
                  (
                    call
                  ) =>
                    call.id ===
                    id
                );

              if (
                existing
              ) {
                return {
                  activeCalls:
                    state.activeCalls.map(
                      (
                        call
                      ) =>
                        call.id ===
                        id
                          ? {
                              ...call,
                              ...fallback,
                              status,
                            }
                          : call
                    ),
                };
              }

              return {
                activeCalls: [
                  {
                    id,

                    phone:
                      fallback
                        ?.phone ??
                      "Unknown",

                    status,

                    startedAt:
                      fallback
                        ?.startedAt ??
                      Date.now(),

                    language:
                      fallback
                        ?.language,

                    duration:
                      fallback
                        ?.duration,

                    customerName:
                      fallback
                        ?.customerName,

                    campaignName:
                      fallback
                        ?.campaignName,

                    providerCallId:
                      fallback
                        ?.providerCallId,
                  },
                  ...state.activeCalls,
                ],
              };
            }
          ),

      removeActiveCall:
        (
          id
        ) =>
          set(
            (
              state
            ) => ({
              activeCalls:
                state.activeCalls.filter(
                  (
                    call
                  ) =>
                    call.id !==
                    id
                ),
            })
          ),

      appendMessage:
        (
          callId,
          role,
          content
        ) =>
          set(
            (
              state
            ) => {
              if (
                !content.trim()
              ) {
                return state;
              }

              const conversation =
                state.conversations[
                  callId
                ] ?? {
                  callId,
                  messages:
                    [],
                };

              const previousMessage =
                conversation.messages[
                  conversation
                    .messages
                    .length -
                    1
                ];

              if (
                previousMessage &&
                previousMessage.role ===
                  role &&
                previousMessage.content ===
                  content
              ) {
                return state;
              }

              return {
                conversations: {
                  ...state.conversations,

                  [callId]: {
                    ...conversation,

                    messages: [
                      ...conversation.messages,

                      {
                        id:
                          crypto.randomUUID(),

                        role,

                        content,
                      },
                    ],
                  },
                },
              };
            }
          ),
    })
  );