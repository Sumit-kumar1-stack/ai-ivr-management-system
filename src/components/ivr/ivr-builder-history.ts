import type { IVREdge, IVRNode } from "./types";

export type IVRGraphSnapshot = { nodes: IVRNode[]; edges: IVREdge[] };
const clone = (snapshot: IVRGraphSnapshot): IVRGraphSnapshot => structuredClone(snapshot);

/**
 * React Flow decorates nodes and edges with interaction-only fields. They are
 * deliberately excluded from the persisted-draft comparison so selecting or
 * focusing a node can never make a flow dirty.
 */
const TRANSIENT_NODE_FIELDS = new Set([
  "selected",
  "dragging",
  "measured",
  "positionAbsolute",
  "width",
  "height",
  "resizing",
]);
const TRANSIENT_EDGE_FIELDS = new Set(["selected", "interactionWidth"]);

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, candidate]) => candidate !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, candidate]) => [key, canonicalize(candidate)])
  );
}

function withoutFields(value: object, fields: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !fields.has(key))
  );
}

/** Compare graph truth only; interaction/selection state never participates. */
export function areIVRGraphSnapshotsEqual(
  left: IVRGraphSnapshot,
  right: IVRGraphSnapshot
): boolean {
  const normalize = (snapshot: IVRGraphSnapshot) => canonicalize({
    nodes: snapshot.nodes.map(node => withoutFields(node, TRANSIENT_NODE_FIELDS)),
    edges: snapshot.edges.map(edge => withoutFields(edge, TRANSIENT_EDGE_FIELDS)),
  });

  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

/** Bounded immutable graph history; selection and viewport never enter this store. */
export class IVRBuilderHistory {
  private past: IVRGraphSnapshot[] = [];
  private future: IVRGraphSnapshot[] = [];
  private baseline: IVRGraphSnapshot | null = null;
  constructor(private present: IVRGraphSnapshot, private readonly limit = 75) {}
  current(): IVRGraphSnapshot { return clone(this.present); }
  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  isDirty(): boolean { return !this.baseline || !areIVRGraphSnapshotsEqual(this.present, this.baseline); }
  markSaved(): void { this.baseline = clone(this.present); }
  clearSavedBaseline(): void { this.baseline = null; }
  /** Keeps direct transient React Flow changes in sync without creating history. */
  replacePresent(next: IVRGraphSnapshot): IVRGraphSnapshot { this.present = clone(next); return this.current(); }
  commit(next: IVRGraphSnapshot): IVRGraphSnapshot {
    this.past.push(clone(this.present));
    if (this.past.length > this.limit) this.past.shift();
    this.present = clone(next); this.future = [];
    return this.current();
  }
  reset(next: IVRGraphSnapshot, options: { saved?: boolean } = {}): void {
    this.present = clone(next); this.past = []; this.future = [];
    if (options.saved) this.markSaved(); else this.clearSavedBaseline();
  }
  undo(): IVRGraphSnapshot | null {
    const previous = this.past.pop(); if (!previous) return null;
    this.future.unshift(clone(this.present)); this.present = previous; return this.current();
  }
  redo(): IVRGraphSnapshot | null {
    const next = this.future.shift(); if (!next) return null;
    this.past.push(clone(this.present)); this.present = next; return this.current();
  }
}
