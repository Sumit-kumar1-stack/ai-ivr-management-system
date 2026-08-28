import { describe, expect, it } from "vitest";

import {
  isEditableShortcutTarget,
  resolveIVRBuilderShortcut,
} from "@/components/ivr/ivr-builder-keyboard";

const shortcut = (key: string, target: EventTarget | null, overrides: Partial<{
  ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
}> = {}) => ({
  key,
  target,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

const editable = (tagName: string, options: { contentEditable?: boolean; closest?: boolean } = {}): EventTarget => ({
  tagName,
  isContentEditable: options.contentEditable ?? false,
  getAttribute: (name: string) => name === "contenteditable" && options.contentEditable ? "true" : null,
  closest: () => options.closest ? {} : null,
}) as unknown as EventTarget;

describe("IVR builder keyboard shortcuts", () => {
  it("maps Ctrl+Z to undo and Ctrl+Y/Ctrl+Shift+Z to redo", () => {
    expect(resolveIVRBuilderShortcut(shortcut("z", null))).toBe("UNDO");
    expect(resolveIVRBuilderShortcut(shortcut("y", null))).toBe("REDO");
    expect(resolveIVRBuilderShortcut(shortcut("z", null, { shiftKey: true }))).toBe("REDO");
  });

  it.each(["INPUT", "TEXTAREA", "SELECT"])("does not capture shortcuts from %s", tagName => {
    const target = editable(tagName);
    expect(isEditableShortcutTarget(target)).toBe(true);
    expect(resolveIVRBuilderShortcut(shortcut("z", target))).toBeNull();
  });

  it("does not capture shortcuts from contenteditable elements or their descendants", () => {
    const editor = editable("DIV", { contentEditable: true });
    const descendant = editable("SPAN", { closest: true });
    expect(resolveIVRBuilderShortcut(shortcut("z", editor))).toBeNull();
    expect(resolveIVRBuilderShortcut(shortcut("y", descendant))).toBeNull();
  });

  it("does not capture unsupported or alt-modified browser shortcuts", () => {
    expect(resolveIVRBuilderShortcut(shortcut("p", null))).toBeNull();
    expect(resolveIVRBuilderShortcut(shortcut("z", null, { altKey: true }))).toBeNull();
  });
});
