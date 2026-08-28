"use client";

import { addEdge, applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import type { Connection, EdgeChange, NodeChange } from "@xyflow/react";

import type {
  IVREdge,
  IVREdgeData,
  IVRNode,
  IVRTransitionTrigger,
} from "./types";

import {
  getIvrFlowTemplate,
  listIvrFlowTemplates,
  type IVRFlowTemplate,
} from "@/services/ivr/ivr-flow-templates.service";

import { applyGeneratedGraphToDraft } from "./ivr-builder-draft";
import { IVRBuilderHistory } from "./ivr-builder-history";
import { resolveIVRBuilderShortcut } from "./ivr-builder-keyboard";

import type {
  IVRBuilderResourceCatalog,
  IVRBuilderTargetContext,
} from "@/services/ivr/ivr-builder-catalog.service";

export type IVRBuilderMode = "MANUAL" | "AI";
export type IVRBuilderSaveState = "UNSAVED" | "SAVING" | "SAVED" | "FAILED";

interface BuilderContextType {
  nodes: IVRNode[];
  setNodes: React.Dispatch<React.SetStateAction<IVRNode[]>>;
  edges: IVREdge[];
  setEdges: React.Dispatch<React.SetStateAction<IVREdge[]>>;
  selectedFlow?: string;
  setSelectedFlow: React.Dispatch<React.SetStateAction<string | undefined>>;
  selectedPublishedVersionId: string | null;
  setSelectedPublishedVersionId: React.Dispatch<React.SetStateAction<string | null>>;
  flowName: string;
  setFlowName: React.Dispatch<React.SetStateAction<string>>;
  campaignId: string;
  setCampaignId: React.Dispatch<React.SetStateAction<string>>;
  builderContext: IVRBuilderTargetContext;
  setBuilderContext: React.Dispatch<React.SetStateAction<IVRBuilderTargetContext>>;
  resourceCatalog: IVRBuilderResourceCatalog | null;
  setResourceCatalog: React.Dispatch<React.SetStateAction<IVRBuilderResourceCatalog | null>>;
  templates: IVRFlowTemplate[];
  setTemplates: React.Dispatch<React.SetStateAction<IVRFlowTemplate[]>>;
  mode: IVRBuilderMode;
  setMode: React.Dispatch<React.SetStateAction<IVRBuilderMode>>;
  saveState: IVRBuilderSaveState;
  setSaveState: React.Dispatch<React.SetStateAction<IVRBuilderSaveState>>;
  isDirty: boolean;
  markDirty: () => void;
  markSaved: () => void;
  onConnect: (connection: Connection) => void;
  onNodesChange: (changes: NodeChange<IVRNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<IVREdge>[]) => void;
  resetDraft: () => void;
  applyTemplate: (templateId: string) => void;
  replaceGraph: (next: { nodes: IVRNode[]; edges: IVREdge[] }) => void;
  applyGeneratedGraph: (next: { nodes: IVRNode[]; edges: IVREdge[] }) => void;
  canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void;
  commitGraph: (next: { nodes: IVRNode[]; edges: IVREdge[] }) => void;
}

const BuilderContext = createContext<BuilderContextType | null>(null);

function createStartNode(): IVRNode {
  return {
    id: "start",
    type: "ivr",
    position: { x: 400, y: 120 },
    data: {
      nodeKind: "START",
      label: "Start",
      description: "Incoming Call",
      runtimeMode: "AUTO",
      runtimeDefault: "STANDARD",
    },
  };
}

export function IVRBuilderProvider({
  children,
  initialBuilderContext,
  initialResourceCatalog,
  initialTemplates,
  initialFlowId,
}: {
  children: React.ReactNode;
  initialBuilderContext?: IVRBuilderTargetContext;
  initialResourceCatalog?: IVRBuilderResourceCatalog | null;
  initialTemplates?: IVRFlowTemplate[];
  initialFlowId?: string;
}) {
  const [nodes, setNodes] = useState<IVRNode[]>([createStartNode()]);
  const [edges, setEdges] = useState<IVREdge[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<string | undefined>(initialFlowId);
  const [selectedPublishedVersionId, setSelectedPublishedVersionId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("Untitled Flow");
  const [campaignId, setCampaignId] = useState(initialBuilderContext?.campaignId ?? "");
  const [builderContext, setBuilderContext] = useState<IVRBuilderTargetContext>(
    initialBuilderContext ?? {
      kind: "STANDALONE",
      returnTo: null,
    }
  );
  const [resourceCatalog, setResourceCatalog] = useState<IVRBuilderResourceCatalog | null>(
    initialResourceCatalog ?? null
  );
  const [templates, setTemplates] = useState<IVRFlowTemplate[]>(
    initialTemplates ?? listIvrFlowTemplates()
  );
  const [mode, setMode] = useState<IVRBuilderMode>("MANUAL");
  const [saveState, setSaveStateValue] = useState<IVRBuilderSaveState>("UNSAVED");
  const history = useRef(new IVRBuilderHistory({ nodes: [createStartNode()], edges: [] }));
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [isDirty, setIsDirty] = useState(true);
  const savedBaselineRequested = useRef(false);
  const syncHistory = useCallback(() => setHistoryState({ canUndo: history.current.canUndo(), canRedo: history.current.canRedo() }), []);
  const syncDirty = useCallback(() => {
    const dirty = history.current.isDirty();
    setIsDirty(dirty);
    setSaveStateValue(previous => dirty ? (previous === "FAILED" ? "FAILED" : "UNSAVED") : "SAVED");
  }, []);
  const markSaved = useCallback(() => {
    history.current.replacePresent({ nodes, edges });
    history.current.markSaved();
    savedBaselineRequested.current = false;
    setIsDirty(false);
    setSaveStateValue("SAVED");
  }, [edges, nodes]);
  const setSaveState = useCallback<React.Dispatch<React.SetStateAction<IVRBuilderSaveState>>>(next => {
    if (typeof next === "function") {
      setSaveStateValue(previous => {
        const resolved = next(previous);
        if (resolved === "SAVED") savedBaselineRequested.current = true;
        return resolved;
      });
      return;
    }
    if (next === "SAVED") savedBaselineRequested.current = true;
    setSaveStateValue(next);
  }, []);
  function commitGraph(next: { nodes: IVRNode[]; edges: IVREdge[] }): void {
    const snapshot = history.current.commit(next); setNodes(snapshot.nodes); setEdges(snapshot.edges); syncHistory(); syncDirty();
  }
  const undo = useCallback((): void => {
    const snapshot = history.current.undo();
    if (snapshot) { setNodes(snapshot.nodes); setEdges(snapshot.edges); syncHistory(); syncDirty(); }
  }, [syncDirty, syncHistory]);
  const redo = useCallback((): void => {
    const snapshot = history.current.redo();
    if (snapshot) { setNodes(snapshot.nodes); setEdges(snapshot.edges); syncHistory(); syncDirty(); }
  }, [syncDirty, syncHistory]);

  function markDirty(): void { setIsDirty(true); setSaveStateValue("UNSAVED"); }

  // Direct setters remain for React Flow interaction updates. Keep history's
  // present snapshot synchronized, but never create a history entry here.
  useEffect(() => {
    history.current.replacePresent({ nodes, edges });
    syncDirty();
  }, [edges, nodes, syncDirty]);

  // Existing load/save callers use setSaveState("SAVED"). Treat that as an
  // explicit acknowledgement that the current graph is now the saved baseline.
  useEffect(() => {
    if (saveState === "SAVED" && savedBaselineRequested.current) markSaved();
  }, [markSaved, saveState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolveIVRBuilderShortcut(event);
      if (shortcut === "UNDO" && history.current.canUndo()) { event.preventDefault(); undo(); }
      if (shortcut === "REDO" && history.current.canRedo()) { event.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  function onConnect(connection: Connection): void {
    const data: IVREdgeData = {
      trigger: "DEFAULT" as IVRTransitionTrigger,
    };

    const nextEdges = addEdge(
        {
          ...connection,
          data,
        },
        edges
      );
    commitGraph({ nodes, edges: nextEdges });
  }

  function onNodesChange(changes: NodeChange<IVRNode>[]): void {
    const meaningful = changes.filter(change =>
      change.type !== "select" &&
      !(change.type === "position" && change.dragging)
    );
    if (meaningful.length > 0) commitGraph({ nodes: applyNodeChanges(changes, nodes), edges });
    else if (changes.length > 0) setNodes(previous => applyNodeChanges(changes, previous));
  }

  function onEdgesChange(changes: EdgeChange<IVREdge>[]): void {
    const meaningful = changes.filter(change => change.type !== "select");
    if (meaningful.length > 0) commitGraph({ nodes, edges: applyEdgeChanges(changes, edges) });
    else if (changes.length > 0) setEdges(previous => applyEdgeChanges(changes, previous));
  }

  function resetDraft(): void {
    setSelectedFlow(undefined);
    setSelectedPublishedVersionId(null);
    setFlowName("Untitled Flow");
    setCampaignId(initialBuilderContext?.campaignId ?? "");
    setMode("MANUAL");
    setNodes([createStartNode()]);
    setEdges([]);
    setSaveState("UNSAVED");
    history.current.reset({ nodes: [createStartNode()], edges: [] }); syncHistory(); setIsDirty(true);
  }

  function applyTemplate(templateId: string): void {
    const template = getIvrFlowTemplate(templateId);
    if (!template) {
      return;
    }

    setSelectedFlow(undefined);
    setSelectedPublishedVersionId(null);
    setFlowName(template.name);
    setCampaignId(initialBuilderContext?.campaignId ?? "");
    setMode("MANUAL");
    setNodes(template.nodes);
    setEdges(template.edges);
    setSaveState("UNSAVED");
    history.current.reset({ nodes: template.nodes, edges: template.edges }); syncHistory(); setIsDirty(true);
  }

  function replaceGraph(next: { nodes: IVRNode[]; edges: IVREdge[] }): void {
    commitGraph(next);
  }

  function applyGeneratedGraph(next: { nodes: IVRNode[]; edges: IVREdge[] }): void {
    // This is the single transition from a Copilot candidate into the shared
    // editable draft used by the canvas, inspectors, save, validation, and simulation.
    const draft = applyGeneratedGraphToDraft(next);
    setNodes(draft.nodes);
    setEdges(draft.edges);
    setMode(draft.mode);
    setSaveState(draft.saveState);
    history.current.reset({ nodes: draft.nodes, edges: draft.edges });
    syncHistory();
    setIsDirty(true);
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
        selectedPublishedVersionId,
        setSelectedPublishedVersionId,
        flowName,
        setFlowName,
        campaignId,
        setCampaignId,
        builderContext,
        setBuilderContext,
        resourceCatalog,
        setResourceCatalog,
        templates,
        setTemplates,
        mode,
        setMode,
        saveState,
        setSaveState,
        isDirty,
        markDirty,
        markSaved,
        onConnect,
        onNodesChange,
        onEdgesChange,
        resetDraft,
        applyTemplate,
        replaceGraph,
        applyGeneratedGraph,
        canUndo: historyState.canUndo, canRedo: historyState.canRedo, undo, redo, commitGraph,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
}

export function useIVRBuilder() {
  const context = useContext(BuilderContext);

  if (!context) {
    throw new Error("useIVRBuilder must be inside provider");
  }

  return context;
}
