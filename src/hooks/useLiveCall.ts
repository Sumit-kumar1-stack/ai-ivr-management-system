"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  getSocket,
} from "@/lib/socket";

export interface LiveCallData {
  transcript: string;
  assistant: string;
  state: string;
  completed: boolean;
}

type TranscriptPayload = {
  callId: string;
  text: string;
};

type AssistantPayload = {
  callId: string;
  text: string;
};

type StatePayload = {
  callId: string;
  state: string;
};

type CompletedPayload = {
  callId: string;
};

export function useLiveCall(
  callId: string
) {
  const [data, setData] =
    useState<LiveCallData>({
      transcript: "",
      assistant: "",
      state: "IDLE",
      completed: false,
    });

  useEffect(() => {
    if (!callId) {
      return;
    }

    const socket =
      getSocket();

    const handleConnect = () => {
      console.log(
        "🟢 Live-call socket connected:",
        socket.id
      );
    };

    const handleConnectError = (
      error: Error
    ) => {
      console.error(
        "🔴 Live-call socket error:",
        error.message
      );
    };

    const handleTranscript = (
      payload: TranscriptPayload
    ) => {
      if (
        payload.callId !== callId
      ) {
        return;
      }

      setData((previous) => ({
        ...previous,
        transcript: payload.text,
      }));
    };

    const handleAssistant = (
      payload: AssistantPayload
    ) => {
      if (
        payload.callId !== callId
      ) {
        return;
      }

      setData((previous) => ({
        ...previous,
        assistant: payload.text,
      }));
    };

    const handleState = (
      payload: StatePayload
    ) => {
      if (
        payload.callId !== callId
      ) {
        return;
      }

      setData((previous) => ({
        ...previous,
        state: payload.state,
      }));
    };

    const handleCompleted = (
      payload: CompletedPayload
    ) => {
      if (
        payload.callId !== callId
      ) {
        return;
      }

      setData((previous) => ({
        ...previous,
        completed: true,
      }));
    };

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "connect_error",
      handleConnectError
    );

    socket.on(
      "transcript",
      handleTranscript
    );

    socket.on(
      "assistant",
      handleAssistant
    );

    socket.on(
      "state",
      handleState
    );

    socket.on(
      "completed",
      handleCompleted
    );

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "connect_error",
        handleConnectError
      );

      socket.off(
        "transcript",
        handleTranscript
      );

      socket.off(
        "assistant",
        handleAssistant
      );

      socket.off(
        "state",
        handleState
      );

      socket.off(
        "completed",
        handleCompleted
      );
    };
  }, [callId]);

  return data;
}