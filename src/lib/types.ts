// Core shared types for the NoteDrift editor.

/**
 * The active drawing/interaction tool.
 * `image` is intentionally not a tool — it is a one-shot action (opens a file
 * picker), so it lives outside this union.
 */
export type Tool =
  | "select"
  | "pen"
  | "pencil"
  | "marker"
  | "highlighter"
  | "brush"
  | "technical"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "note"
  | "eraser";

/** The freehand drawing instruments (share the Phase 1.6A brush engine). */
export type DrawTool =
  | "pen"
  | "pencil"
  | "marker"
  | "highlighter"
  | "brush"
  | "technical";

/** Tools grouped under the single "Shape" toolbar button. */
export const SHAPE_TOOLS: readonly Tool[] = ["rect", "ellipse", "line"];

/** Background appearance of the canvas paper (persisted per page). */
export type CanvasStyle = "blank" | "dots" | "grid";

/** Freehand drawing stabilization level (persisted per drawing tool). */
export type PenStabilization = "off" | "low" | "medium" | "high";

/** Category of the current selection, used to pick contextual controls. */
export type ObjKind =
  | "none"
  | "shape"
  | "text"
  | "note"
  | "path"
  | "image"
  | "connector"
  | "mixed";

/** Edge anchor of a connectable object. */
export type Anchor = "top" | "right" | "bottom" | "left";

/** Snapshot of the current selection for the contextual toolbar. */
export interface SelectionInfo {
  kind: ObjKind;
  count: number;
  /** Screen-space bounds relative to the canvas element (viewport coords). */
  rect: { left: number; top: number; width: number; height: number } | null;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fontSize?: number;
  textColor?: string;
  bold?: boolean;
  textAlign?: string;
  noteFill?: string;
  /** Whether a connector shows an arrowhead. */
  hasArrow?: boolean;
  /** Mind-map: the single selection is an editable mind-map node (NodeBox). */
  isNode?: boolean;
  /** Mind-map: the node has hierarchical children (can arrange/collapse/branch). */
  hasChildren?: boolean;
  /** Mind-map: the node has no hierarchical parent (it is a root). */
  isRoot?: boolean;
  /** Mind-map: the node's branch is currently collapsed. */
  collapsed?: boolean;
  /** Mind-map: the node's current soft accent key. */
  nodeAccent?: string;
  /** A freehand ink stroke (filled Path): color edits map to `fill`, no width. */
  isInk?: boolean;
  /** Object opacity (0–1), surfaced for ink strokes. */
  opacity?: number;
}

/** Persisted preferences for a single drawing instrument. */
export interface DrawToolPrefs {
  color: string;
  width: number;
  /** Stroke opacity (0–1). */
  opacity: number;
  stabilization: PenStabilization;
  /** Pressure / brush-dynamics width response, where the tool supports it. */
  pressure: boolean;
}

/** Default styling applied to newly created objects (persisted locally). */
export interface ToolDefaults {
  /** Per-instrument preferences for the freehand drawing family. */
  draw: Record<DrawTool, DrawToolPrefs>;
  shapeStroke: string;
  shapeStrokeWidth: number;
  shapeFill: string;
  lineStroke: string;
  lineStrokeWidth: number;
  textColor: string;
  textFontSize: number;
  noteFill: string;
}

/** A style patch applied to the current selection (only relevant keys set). */
export interface StylePatch {
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  /** Text color (maps to a text object's `fill`). */
  textColor?: string;
  fontSize?: number;
  bold?: boolean;
  textAlign?: string;
  noteFill?: string;
  /** Connector arrowhead on/off. */
  hasArrow?: boolean;
  /** Mind-map node soft accent key. */
  nodeAccent?: string;
  /** Object opacity (0–1) — used to restyle a completed ink stroke. */
  opacity?: number;
}

/** UI-facing snapshot the controller emits to React on every change. */
export interface EditorState {
  tool: Tool;
  /** 1 = 100%. */
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  canvasStyle: CanvasStyle;
  hasSelection: boolean;
  selection: SelectionInfo;
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
