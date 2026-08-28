"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import type {
  Socket,
} from "socket.io-client";

import {
  getSocket,
} from "@/lib/socket";

const SocketContext =
  createContext<Socket | null>(
    null
  );

type SocketProviderProps = {
  children: React.ReactNode;
};

export function SocketProvider({
  children,
}: SocketProviderProps) {

  const [socket] =
    useState<Socket>(() =>
      getSocket()
    );

  useEffect(() => {

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      // Do not disconnect the shared socket here.
      // Other components may still be using it.
    };

  }, [socket]);

  return (
    <SocketContext.Provider
      value={socket}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): Socket {

  const socket =
    useContext(SocketContext);

  if (!socket) {
    throw new Error(
      "useSocket must be used inside SocketProvider"
    );
  }

  return socket;
}