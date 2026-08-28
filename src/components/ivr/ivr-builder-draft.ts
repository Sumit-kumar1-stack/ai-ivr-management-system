import type { IVREdge, IVRNode } from "./types";
import type { IVRBuilderMode, IVRBuilderSaveState } from "./ivr-builder-context";

export interface AppliedIVRBuilderDraft {
  nodes: IVRNode[];
  edges: IVREdge[];
  mode: IVRBuilderMode;
  saveState: IVRBuilderSaveState;
}

/**
 * The Copilot handoff is intentionally a local state transition.  Saving and
 * publishing remain explicit actions in the Manual Builder.
 */
export function applyGeneratedGraphToDraft(next: {
  nodes: IVRNode[];
  edges: IVREdge[];
}): AppliedIVRBuilderDraft {
  return {
    nodes: [...next.nodes],
    edges: [...next.edges],
    mode: "MANUAL",
    saveState: "UNSAVED",
  };
}
