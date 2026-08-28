export type IVRBuilderShortcut = "UNDO" | "REDO";

type ShortcutTarget = {
  tagName?: string | null;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

type ShortcutEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey?: boolean;
  shiftKey: boolean;
  altKey?: boolean;
  target: EventTarget | null;
};

/** True when browser-native text editing must retain ownership of undo/redo. */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as ShortcutTarget;
  const tagName = element.tagName?.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (element.isContentEditable || element.getAttribute?.("contenteditable") === "true") return true;
  return Boolean(element.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
}

/**
 * Maps only builder-level undo/redo keys. Callers should preventDefault only
 * when this returns an action they can actually perform.
 */
export function resolveIVRBuilderShortcut(event: ShortcutEvent): IVRBuilderShortcut | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableShortcutTarget(event.target)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "REDO" : "UNDO";
  if (key === "y") return "REDO";
  return null;
}
