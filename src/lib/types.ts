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
  // Shape family
  | "rect"
  | "roundrect"
  | "ellipse"
  | "circle"
  | "triangle"
  | "diamond"
  | "polygon"
  | "star"
  | "cloud"
  | "process"
  | "decision"
  | "terminator"
  | "database"
  | "document"
  // Line family
  | "line"
  | "arrow"
  | "doublearrow"
  | "note"
  | "lasso"
  | "hand"
  | "eraser";

/** Arrowhead style for a line end. */
export type ArrowHead = "none" | "open" | "triangle" | "filled";

/** Stroke dash style for lines and shape outlines. */
export type DashStyle = "solid" | "dashed" | "dotted";

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
export type CanvasStyle =
  | "blank"
  | "dots"
  | "grid"
  | "lines"
  | "graph"
  | "engineering";

/** Eraser behaviour (persisted, user-level). */
export type EraserMode = "object" | "stroke";

/** A pinnable slot on the left tool rail (Select is always shown separately). */
export type RailSlot =
  | "draw"
  | "text"
  | "shapes"
  | "line"
  | "note"
  | "image"
  | "eraser"
  | "lasso"
  | "hand";

/** The default set of pinned rail slots — a calm, small default rail. */
export const DEFAULT_RAIL_SLOTS: RailSlot[] = [
  "draw",
  "text",
  "shapes",
  "note",
  "image",
  "eraser",
  "hand",
];

/** Hard cap so the rail never becomes a huge strip. */
export const MAX_RAIL_SLOTS = 9;

/** Freehand drawing stabilization level (persisted per drawing tool). */
export type PenStabilization = "off" | "low" | "medium" | "high";

/** Category of the current selection, used to pick contextual controls. */
export type ObjKind =
  | "none"
  | "shape"
  | "line"
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
  /** Stroke dash style (shapes + lines). */
  dash?: DashStyle;
  /** The shape's id (rect/roundrect/…) when a shape is selected. */
  shapeId?: string;
  /** A fillable vector shape (rect/ellipse/polygon/path) — not a legacy arrow group. */
  fillable?: boolean;
  /** Rounded-rect corner radius. */
  radius?: number;
  /** Regular-polygon side count. */
  sides?: number;
  /** Star point count and inner-radius ratio. */
  starPoints?: number;
  starInner?: number;
  /** A line-family object (NdLine): show line controls (arrowheads). */
  isLine?: boolean;
  startHead?: ArrowHead;
  endHead?: ArrowHead;
  // Phase 1.6D — multi-selection & organization.
  /** ≥2 selected objects that can be combined into a Fabric group. */
  canGroup?: boolean;
  /** ≥2 movable (non-connector, non-locked) objects — alignment is available. */
  canAlign?: boolean;
  /** The single selection is a group that can be broken apart. */
  canUngroup?: boolean;
  /** The single selection is a Fabric group. */
  isGroup?: boolean;
  /** The selection (or single object) is locked — show Unlock instead of Lock. */
  locked?: boolean;
  /** ≥3 objects selected — distribution is available. */
  canDistribute?: boolean;
  // Phase 1.6E — whole-object text/note formatting.
  /** Curated font-family key (sans / serif / mono / hand). */
  fontFamily?: string;
  /** Italic (maps to fontStyle). */
  italic?: boolean;
  /** Underline. */
  underline?: boolean;
  /** Line height (1.0 compact … 1.5 relaxed). */
  lineHeight?: number;
  /** Line-prefix list mode of a text/note object. */
  listStyle?: "none" | "bullet" | "check";
  // Phase 1.6F — image state.
  /** The image is horizontally flipped. */
  flipX?: boolean;
  /** The image is vertically flipped. */
  flipY?: boolean;
  /** The image currently has a crop applied. */
  cropped?: boolean;
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
  shapeDash: DashStyle;
  shapeOpacity: number;
  shapeRadius: number;
  shapeSides: number;
  shapeStarPoints: number;
  shapeStarInner: number;
  lineStroke: string;
  lineStrokeWidth: number;
  lineDash: DashStyle;
  lineOpacity: number;
  textColor: string;
  textFontSize: number;
  /** Curated font-family stack for new text (a FONT_STACKS value). */
  textFontFamily: string;
  /** Line height for new text. */
  textLineHeight: number;
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
  // Phase 1.6E — whole-object text/note formatting.
  /** Curated font-family stack (a FONT_STACKS value). */
  fontFamily?: string;
  /** Italic (maps to fontStyle "italic"/"normal"). */
  italic?: boolean;
  /** Underline. */
  underline?: boolean;
  /** Line height multiplier. */
  lineHeight?: number;
  /** Toggle a line-prefix list mode over the whole text object. */
  listStyle?: "none" | "bullet" | "check";
  /** Connector arrowhead on/off. */
  hasArrow?: boolean;
  /** Mind-map node soft accent key. */
  nodeAccent?: string;
  /** Object opacity (0–1). */
  opacity?: number;
  /** Stroke dash style. */
  dash?: DashStyle;
  /** Rounded-rect corner radius. */
  radius?: number;
  /** Regular-polygon side count. */
  sides?: number;
  /** Star point count / inner ratio. */
  starPoints?: number;
  starInner?: number;
  /** Line arrowheads. */
  startHead?: ArrowHead;
  endHead?: ArrowHead;
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
  /** Phase 1.6F — an image is being cropped (shows the crop bar, hides others). */
  cropping: boolean;
  /** Phase 1.6G — active eraser behaviour. */
  eraserMode: EraserMode;
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
