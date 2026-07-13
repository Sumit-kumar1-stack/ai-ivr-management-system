"use client";

import {
  createContext,
  useContext,
  useState,
} from "react";

import {
  Edge,
  Node,
  Connection,
  addEdge,
} from "@xyflow/react";

interface BuilderContextType {
  nodes: Node[];
  setNodes: React.Dispatch<
    React.SetStateAction<Node[]>
  >;

  edges: Edge[];
  setEdges: React.Dispatch<
    React.SetStateAction<Edge[]>
  >;

  selectedFlow?: string;

  setSelectedFlow: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;

  flowName: string;

  setFlowName: React.Dispatch<
    React.SetStateAction<string>
  >;

  onConnect: (
    connection: Connection
  ) => void;
}

const BuilderContext =
  createContext<BuilderContextType | null>(
    null
  );

export function IVRBuilderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [nodes, setNodes] =
    useState<Node[]>([
      {
        id: "1",
        type: "ivr",
        position: {
          x: 400,
          y: 120,
        },
        data: {
          label: "Start",
          description: "Incoming Call",
        },
      },
    ]);

  const [edges, setEdges] =
    useState<Edge[]>([]);

  const [
    selectedFlow,
    setSelectedFlow,
  ] = useState<string>();

  const [
    flowName,
    setFlowName,
  ] = useState("Untitled Flow");

  function onConnect(
    connection: Connection
  ) {
    setEdges((previous) =>
      addEdge(connection, previous)
    );
  }

  return (
    <BuilderContext.Provider
      value={{
        nodes,
        setNodes,

        edges,
        setEdges,

        selectedFlow,
        setSelectedFlow,

        flowName,
        setFlowName,

        onConnect,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
}

export function useIVRBuilder() {
  const context =
    useContext(BuilderContext);

  if (!context) {
    throw new Error(
      "useIVRBuilder must be inside provider"
    );
  }

  return context;
}