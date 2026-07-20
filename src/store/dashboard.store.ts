"use client";

import { create } from "zustand";

export interface TimelineEvent {
  event: string;
  payload: unknown;
  timestamp: number;
}

interface DashboardMetrics {
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
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface LiveConversation {
  callId: string;
  messages: ConversationMessage[];
}

interface DashboardState {
  metrics: DashboardMetrics;

  timeline: TimelineEvent[];

  activeCalls: ActiveCall[];

  conversations: Record<string, LiveConversation>;

  setMetrics: (
    metrics: Partial<DashboardMetrics>
  ) => void;

  addEvent: (
    event: string,
    payload: unknown
  ) => void;

  clearTimeline: () => void;

  setActiveCalls: (
    calls: ActiveCall[]
  ) => void;

  upsertActiveCall: (
    call: ActiveCall
  ) => void;

  removeActiveCall: (
    id: string
  ) => void;

  appendMessage: (
    callId: string,
    role: "user" | "assistant",
    content: string
  ) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  metrics: {
    activeCalls: 0,
    queuedCalls: 0,
    thinkingCalls: 0,
    speakingCalls: 0,
    completedCalls: 0,
    failedCalls: 0,
  },

  timeline: [],

  activeCalls: [],

  conversations: {},

  setMetrics: (metrics) =>
    set((state) => ({
      metrics: {
        ...state.metrics,
        ...metrics,
      },
    })),

  addEvent: (event, payload) =>
    set((state) => ({
      timeline: [
        {
          event,
          payload,
          timestamp: Date.now(),
        },
        ...state.timeline,
      ].slice(0, 100),
    })),

  clearTimeline: () =>
    set({
      timeline: [],
    }),

  setActiveCalls: (calls) =>
    set({
      activeCalls: calls,
    }),

  upsertActiveCall: (call) =>
    set((state) => {
      const index = state.activeCalls.findIndex(
        (c) => c.id === call.id
      );

      if (index === -1) {
        return {
          activeCalls: [
            ...state.activeCalls,
            call,
          ],
        };
      }

      const updated = [...state.activeCalls];

      updated[index] = call;

      return {
        activeCalls: updated,
      };
    }),

  removeActiveCall: (id) =>
    set((state) => ({
      activeCalls: state.activeCalls.filter(
        (c) => c.id !== id
      ),
    })),

  appendMessage: (
    callId,
    role,
    content
  ) =>
    set((state) => {
      const conversation =
        state.conversations[callId] ?? {
          callId,
          messages: [],
        };

      return {
        conversations: {
          ...state.conversations,

          [callId]: {
            ...conversation,

            messages: [
              ...conversation.messages,

              {
                id: crypto.randomUUID(),
                role,
                content,
              },
            ],
          },
        },
      };
    }),
}));