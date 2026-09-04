// Input-type validation. Pure — unit-tested.

import { extensionOf } from "./filenames.ts";
import type { ToolDef } from "./types";

/** Does a file match a tool's accepted types? Prefer MIME, but fall back to the
 *  extension because some browsers report an empty or odd MIME (notably SVG). */
export function accepts(
  tool: Pick<ToolDef, "accept" | "acceptExts">,
  file: { type: string; name: string },
): boolean {
  if (file.type && tool.accept.includes(file.type)) return true;
  const ext = extensionOf(file.name);
  return ext.length > 0 && tool.acceptExts.includes(ext);
}

/** Calm, tool-specific rejection message. */
export function acceptError(tool: Pick<ToolDef, "acceptLabel">): string {
  return `This tool accepts ${tool.acceptLabel} files.`;
}
