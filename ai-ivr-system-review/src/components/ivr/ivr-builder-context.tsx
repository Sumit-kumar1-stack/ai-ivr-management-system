"use client";

import {
  createContext,
  useContext,
  useState,
} from "react";

import {
  addEdge,
} from "@xyflow/react";

import type {
  Connection,
} from "@xyflow/react";

import type {
  IVREdge,
  IVREdgeData,
  IVRNode,
  IVRTransitionTrigger,
} from "./types";

export type IVRBuilderMode = "MANUAL" | "AI";

//--------------------------------------------------
// Context
//--------------------------------------------------

interface BuilderContextType {
  nodes:
    IVRNode[];

  setNodes:
    React.Dispatch<
      React.SetStateAction<
        IVRNode[]
      >
    >;

  edges:
    IVREdge[];

  setEdges:
    React.Dispatch<
      React.SetStateAction<
        IVREdge[]
      >
    >;

  selectedFlow?:
    string;

  setSelectedFlow:
    React.Dispatch<
      React.SetStateAction<
        string | undefined
      >
    >;

  flowName:
    string;

  setFlowName:
    React.Dispatch<
      React.SetStateAction<string>
    >;

  campaignId:
    string;

  setCampaignId:
    React.Dispatch<
      React.SetStateAction<string>
    >;

  mode:
    IVRBuilderMode;

  setMode:
    React.Dispatch<
      React.SetStateAction<
        IVRBuilderMode
      >
    >;

  onConnect: (
    connection:
      Connection
  ) => void;
}

const BuilderContext =
  createContext<
    BuilderContextType | null
  >(
    null
  );

//--------------------------------------------------
// Provider
//--------------------------------------------------

export function IVRBuilderProvider({
  children,
}: {
  children:
    React.ReactNode;
}) {
  const [
    nodes,
    setNodes,
  ] =
    useState<
      IVRNode[]
    >([
      {
        id:
          "start",

        type:
          "ivr",

        position: {
          x:
            400,

          y:
            120,
        },

        data: {
          nodeKind:
            "START",

          label:
            "Start",

          description:
            "Incoming Call",
        },
      },
    ]);

  const [
    edges,
    setEdges,
  ] =
    useState<
      IVREdge[]
    >([]);

  const [
    selectedFlow,
    setSelectedFlow,
  ] =
    useState<
      string | undefined
    >();

  const [
    flowName,
    setFlowName,
  ] =
    useState(
      "Untitled Flow"
    );

  const [
    campaignId,
    setCampaignId,
  ] =
    useState(
      ""
    );

  const [
    mode,
    setMode,
  ] =
    useState<IVRBuilderMode>(
      "MANUAL"
    );

  function onConnect(
    connection:
      Connection
  ): void {
    const data:
      IVREdgeData = {
        trigger:
          "DEFAULT" as IVRTransitionTrigger,
      };

    setEdges(
      previous =>
        addEdge(
          {
            ...connection,

            data,
          },
          previous
        )
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

        campaignId,
        setCampaignId,

        mode,
        setMode,

        onConnect,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
}

//--------------------------------------------------
// Hook
//--------------------------------------------------

export function useIVRBuilder() {
  const context =
    useContext(
      BuilderContext
    );

  if (
    !context
  ) {
    throw new Error(
      "useIVRBuilder must be inside provider"
    );
  }

  return context;
}
