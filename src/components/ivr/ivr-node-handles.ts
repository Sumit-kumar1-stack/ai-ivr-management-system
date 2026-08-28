import type { IVRNodeData } from "./types";

/**
 * React Flow requires a source handle for every canonical menu digit. The
 * edge contract remains data-driven, so destinations may safely be shared.
 */
export function getMenuOptionHandleIds(options: IVRNodeData["options"]): string[] {
  if (!Array.isArray(options)) return [];

  const seen = new Set<string>();
  return options.flatMap(option => {
    const digit = typeof option?.digit === "string" ? option.digit.trim() : "";
    if (!digit || seen.has(digit)) return [];
    seen.add(digit);
    return [digit];
  });
}
