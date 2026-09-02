// Tool registry foundation (Phase 1.6A).
//
// A single declarative source of truth for tools, so behavior and metadata stop
// living in ever-growing switch statements. Phase 1.6A intentionally proves the
// pattern with ONE tool (Pen): only Pen carries a `brush`, and the controller
// builds its freehand engine from that. Every other tool is registered as
// lightweight metadata (label/category) and keeps its existing controller logic
// for now — later subphases migrate them one at a time.

import type { Tool } from "../types";

/** High-level grouping used later by the tool library / favorites / command bar. */
export type ToolCategory =
  | "draw"
  | "write"
  | "shape"
  | "diagram"
  | "organize"
  | "insert"
  | "navigate";

/** A freehand drawing brush spec. Parameters are resolved from ToolDefaults at
 *  activation time, so the registry stays declarative. */
export interface BrushSpec {
  kind: "freehand";
}

export interface ToolDefinition {
  id: Tool;
  label: string;
  category: ToolCategory;
  /** Present only for freehand drawing tools (Pen today). */
  brush?: BrushSpec;
}
