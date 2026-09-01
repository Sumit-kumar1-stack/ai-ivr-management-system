import type { IVREdge, IVRNode } from "./types";
import type { IVRBuilderMode, IVRBuilderSaveState } from "./ivr-builder-context";

export interface AppliedIVRBuilderDraft {
  nodes: IVRNode[];
  edges: IVREdge[];
  name?: string;
  mode: IVRBuilderMode;
  saveState: IVRBuilderSaveState;
}

/**
 * The Copilot handoff is intentionally a local state transition. Saving and
 * publishing remain explicit actions in the Manual Builder.
 */
export function applyGeneratedGraphToDraft(next: {
  nodes: IVRNode[];
  edges: IVREdge[];
  name?: string;
}): AppliedIVRBuilderDraft {
  return {
    nodes: [...next.nodes],
    edges: [...next.edges],
    name: next.name?.trim() || undefined,
    mode: "MANUAL",
    saveState: "UNSAVED",
  };
}
