"use client";

import {
  useEffect,
} from "react";

import {
  getSocket,
} from "@/lib/socket";

type SocketProviderProps = {
  children: React.ReactNode;
};

export default function SocketProvider({
  children,
}: SocketProviderProps) {

  useEffect(() => {

    const socket =
      getSocket();

    const handleConnect = () => {

      console.log(
        "🟢 Dashboard connected:",
        socket.id
      );

    };

    const handleDisconnect = (
      reason: string
    ) => {

      console.log(
        "🔴 Dashboard disconnected:",
        reason
      );

    };

    const handleConnectError = (
      error: Error
    ) => {

      console.error(
        "🔴 Socket connection error:",
        error.message
      );

    };

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    socket.on(
      "connect_error",
      handleConnectError
    );

    if (!socket.connected) {

      socket.connect();

    } else {

      handleConnect();

    }

    return () => {

      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.off(
        "connect_error",
        handleConnectError
      );

    };

  }, []);

  return children;
}