// Core shared types for the NoteDrift editor.

/**
 * The active drawing/interaction tool.
 * `image` is intentionally not a tool — it is a one-shot action (opens a file
 * picker), so it lives outside this union.
 */
export type Tool =
  | "select"
  | "pen"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "note"
  | "eraser";

/** Tools grouped under the single "Shape" toolbar button. */
export const SHAPE_TOOLS: readonly Tool[] = ["rect", "ellipse", "line"];

/** Background appearance of the canvas paper (persisted per page). */
export type CanvasStyle = "blank" | "dots" | "grid";

/** UI-facing snapshot the controller emits to React on every change. */
export interface EditorState {
  tool: Tool;
  /** 1 = 100%. */
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  canvasStyle: CanvasStyle;
  hasSelection: boolean;
}

/** Metadata for a single page, kept in localStorage (small, always-loaded). */
export interface PageMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Per-page canvas background; defaults to "dots" when absent. */
  style?: CanvasStyle;
}

/** A serialized Fabric canvas document (fabric `toJSON()` output). */
export type CanvasDoc = Record<string, unknown>;
