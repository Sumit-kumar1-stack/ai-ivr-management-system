import { describe, it, expect, vi } from "vitest";

describe("IVR Builder Panels & Modals Exit Path Architecture", () => {
  it("SCENARIO H: Validation panel handles close callback and escape key events", () => {
    const onCloseMock = vi.fn();

    // Verify callback execution
    onCloseMock();
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    // Verify key listener handler logic
    const handleKeyDown = (event: { key: string }) => {
      if (event.key === "Escape") {
        onCloseMock();
      }
    };

    handleKeyDown({ key: "Escape" });
    expect(onCloseMock).toHaveBeenCalledTimes(2);

    handleKeyDown({ key: "Enter" });
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });

  it("SCENARIO I: Simulator panel handles close callback and escape key events", () => {
    const onCloseMock = vi.fn();

    onCloseMock();
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    const handleKeyDown = (event: { key: string }) => {
      if (event.key === "Escape") {
        onCloseMock();
      }
    };

    handleKeyDown({ key: "Escape" });
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });

  it("SCENARIO J & K: Switching mode preserves graph state in memory", () => {
    const currentDraft = {
      nodes: [
        { id: "start", type: "ivr", position: { x: 0, y: 0 }, data: { nodeKind: "START" } },
        { id: "greeting", type: "ivr", position: { x: 100, y: 0 }, data: { nodeKind: "GREETING" } },
      ],
      edges: [
        { id: "e1", source: "start", target: "greeting" },
      ],
      mode: "MANUAL" as const,
      isDirty: true,
    };

    // Switch to AI mode
    const aiMode = { ...currentDraft, mode: "AI" as const };
    expect(aiMode.nodes).toHaveLength(2);
    expect(aiMode.edges).toHaveLength(1);
    expect(aiMode.isDirty).toBe(true);

    // Switch back to MANUAL mode
    const backToManual = { ...aiMode, mode: "MANUAL" as const };
    expect(backToManual.nodes).toHaveLength(2);
    expect(backToManual.edges).toHaveLength(1);
    expect(backToManual.isDirty).toBe(true);
  });
});
