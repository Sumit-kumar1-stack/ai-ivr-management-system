"use client";

import { useEffect } from "react";

import { useSocket } from "@/contexts/socket-context";
import { useDashboardStore } from "@/store/dashboard.store";

export function useDashboardEvents() {
  const socket = useSocket();

  const addEvent = useDashboardStore((s) => s.addEvent);
  const setMetrics = useDashboardStore((s) => s.setMetrics);

  const upsertCall = useDashboardStore(
    (s) => s.upsertActiveCall
  );

  const removeCall = useDashboardStore(
    (s) => s.removeActiveCall
  );

  const appendMessage = useDashboardStore(
    (s) => s.appendMessage
  );

  useEffect(() => {
    const handler = (event: string, payload: any) => {
      addEvent(event, payload);

      const { metrics } = useDashboardStore.getState();

      switch (event) {
        case "CALL_STARTED":
          setMetrics({
            ...metrics,
            activeCalls: metrics.activeCalls + 1,
          });

          upsertCall({
            id: payload?.callId,
            phone: payload?.phone ?? "Unknown",
            status: "Started",
            startedAt: Date.now(),
            language: payload?.language,
          });

          break;

        case "CALL_RINGING":
          upsertCall({
            id: payload?.callId,
            phone: payload?.phone ?? "Unknown",
            status: "Ringing",
            startedAt: Date.now(),
            language: payload?.language,
          });

          break;

        case "CALL_ANSWERED":
          upsertCall({
            id: payload?.callId,
            phone: payload?.phone ?? "Unknown",
            status: "Answered",
            startedAt: Date.now(),
            language: payload?.language,
          });

          break;

        case "CALL_THINKING":
          upsertCall({
            id: payload?.callId,
            phone: payload?.phone ?? "Unknown",
            status: "AI Thinking",
            startedAt: Date.now(),
            language: payload?.language,
          });

          break;

        case "CALL_SPEAKING":
          upsertCall({
            id: payload?.callId,
            phone: payload?.phone ?? "Unknown",
            status: "AI Speaking",
            startedAt: Date.now(),
            language: payload?.language,
          });

          break;

        case "CALL_COMPLETED":
          setMetrics({
            ...metrics,
            activeCalls: Math.max(
              0,
              metrics.activeCalls - 1
            ),
            completedCalls:
              metrics.completedCalls + 1,
          });

          removeCall(payload?.callId);

          break;

        case "CALL_FAILED":
          setMetrics({
            ...metrics,
            failedCalls: metrics.failedCalls + 1,
          });

          removeCall(payload?.callId);

          break;
      }

      // Live transcript from the caller
      if (event === "TRANSCRIPT") {
        appendMessage(
          payload?.callId,
          "user",
          payload?.text ?? ""
        );
      }

      // AI response
      if (event === "AI_RESPONSE") {
        appendMessage(
          payload?.callId,
          "assistant",
          payload?.text ?? ""
        );
      }
    };

    socket.onAny(handler);

    return () => {
      socket.offAny(handler);
    };
  }, [
    socket,
    addEvent,
    setMetrics,
    upsertCall,
    removeCall,
    appendMessage,
  ]);
}