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

/** UI-facing snapshot the controller emits to React on every change. */
export interface EditorState {
  tool: Tool;
  /** 1 = 100%. */
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  gridOn: boolean;
  hasSelection: boolean;
}

/** Metadata for a single page, kept in localStorage (small, always-loaded). */
export interface PageMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** A serialized Fabric canvas document (fabric `toJSON()` output). */
export type CanvasDoc = Record<string, unknown>;
