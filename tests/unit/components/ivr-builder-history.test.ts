import { describe, expect, it } from "vitest";
import { areIVRGraphSnapshotsEqual, IVRBuilderHistory } from "@/components/ivr/ivr-builder-history";
import type { IVRGraphSnapshot } from "@/components/ivr/ivr-builder-history";
const snap = (id: string): IVRGraphSnapshot => ({ nodes: [{ id, type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START", label: id } }], edges: [] });
describe("IVRBuilderHistory", () => {
  it("undoes/redoes meaningful graph mutations and clears redo after a new edit", () => { const history = new IVRBuilderHistory(snap("a")); history.commit(snap("b")); expect(history.undo()?.nodes[0]?.id).toBe("a"); expect(history.redo()?.nodes[0]?.id).toBe("b"); history.undo(); history.commit(snap("c")); expect(history.canRedo()).toBe(false); });
  it("bounds graph history", () => { const history = new IVRBuilderHistory(snap("0"), 2); history.commit(snap("1")); history.commit(snap("2")); history.commit(snap("3")); expect(history.undo()?.nodes[0]?.id).toBe("2"); expect(history.undo()?.nodes[0]?.id).toBe("1"); expect(history.undo()).toBeNull(); });
  it("returns clean only when undo returns to the saved graph baseline", () => {
    const history = new IVRBuilderHistory(snap("saved"));
    history.markSaved();
    expect(history.isDirty()).toBe(false);
    history.commit(snap("edited"));
    expect(history.isDirty()).toBe(true);
    history.undo();
    expect(history.isDirty()).toBe(false);
    history.redo();
    expect(history.isDirty()).toBe(true);
  });
  it("ignores React Flow interaction fields in saved-baseline equality", () => {
    const saved = snap("saved");
    const selected = structuredClone(saved);
    Object.assign(selected.nodes[0] as object, {
      selected: true,
      dragging: true,
      positionAbsolute: { x: 0, y: 0 },
    });
    expect(areIVRGraphSnapshotsEqual(saved, selected)).toBe(true);
  });
  it("resets history without carrying prior undo state or dirty baseline drift", () => {
    const history = new IVRBuilderHistory(snap("saved"));
    history.markSaved();
    history.commit(snap("edited"));
    history.reset(snap("reset"), { saved: true });

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.isDirty()).toBe(false);
    expect(history.current().nodes[0]?.id).toBe("reset");
  });
});
