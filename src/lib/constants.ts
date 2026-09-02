// Design + behavior constants for the editor.

/** Base spacing (in scene units) between dotted-grid points. */
export const GRID_SIZE = 24;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

/**
 * Font stack used for text drawn *on the canvas*. We deliberately use a system
 * stack (never a web font that might not be loaded when the canvas paints) so
 * text renders correctly and identically on first paint and after reload.
 */
export const CANVAS_FONT =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Color of the dotted grid points / grid lines on the white paper. */
export const GRID_COLOR = "#dbe0ec";
export const GRID_LINE_COLOR = "#e8ebf2";

export const COLORS = {
  /** Default drawing ink — dark, readable on white paper. */
  ink: "#20242e",
  accent: "#5b8cff",
  accent2: "#a855f7",
  noteInk: "#3a3320",
} as const;

/** The one NoteDrift drawing palette (pen / shapes / text / lines). */
export const PALETTE: { name: string; value: string }[] = [
  { name: "Graphite", value: "#20242e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Red", value: "#ef4444" },
  { name: "Green", value: "#22c55e" },
  { name: "Orange", value: "#f97316" },
];

/** Soft, unsaturated fills for sticky notes. */
export const NOTE_COLORS: { name: string; value: string }[] = [
  { name: "Yellow", value: "#fef3c7" },
  { name: "Pink", value: "#fde2e4" },
  { name: "Blue", value: "#dbeafe" },
  { name: "Green", value: "#dcfce7" },
  { name: "White", value: "#ffffff" },
];

/** Optional soft fills for shapes (plus "transparent"). */
export const SHAPE_FILLS: { name: string; value: string }[] = [
  { name: "None", value: "transparent" },
  { name: "Yellow", value: "#fef3c7" },
  { name: "Pink", value: "#fde2e4" },
  { name: "Blue", value: "#dbeafe" },
  { name: "Green", value: "#dcfce7" },
];

/** Discrete stroke widths (no free slider — keeps history clean). */
export const STROKE_WIDTHS = { thin: 2, medium: 4, thick: 7 } as const;
export type StrokeWidthKey = keyof typeof STROKE_WIDTHS;

/** Discrete font sizes for the text/note steppers. */
export const FONT_SIZES = [14, 18, 24, 32, 48, 64];

// Sticky-note geometry.
export const NOTE_W = 220;
export const NOTE_H = 180;
export const NOTE_MIN_W = 140;
export const NOTE_MIN_H = 110;
export const NOTE_PAD = 16;
export const NOTE_RADIUS = 16;

// Mind-map node geometry (the small editable node used by Quick Connect and the
// keyboard mind-map flow).
export const NODE_W = 132;
export const NODE_H = 46;
export const NODE_MIN_W = 84;
export const NODE_PAD = 10;
export const NODE_RADIUS = 10;
export const NODE_INK = "#20242e";
export const MINDMAP_GAP_X = 90;
export const MINDMAP_GAP_Y = 24;

/**
 * Soft accent palette for mind-map nodes. Intentionally small and lightweight —
 * a node reads as a light card, never a heavy flowchart block. `neutral` is the
 * default (white card, faint neutral border). Each accent tints the fill,
 * border, and text ink together so the node stays legible and calm.
 */
export type NodeAccent =
  | "neutral"
  | "blue"
  | "violet"
  | "green"
  | "orange"
  | "pink";

export const NODE_ACCENTS: Record<
  NodeAccent,
  { fill: string; border: string; ink: string }
> = {
  neutral: { fill: "#ffffff", border: "rgba(15,23,42,0.16)", ink: "#20242e" },
  blue: { fill: "#eef4ff", border: "rgba(59,130,246,0.55)", ink: "#1e3a8a" },
  violet: { fill: "#f4efff", border: "rgba(139,92,246,0.55)", ink: "#4c1d95" },
  green: { fill: "#ebfbf1", border: "rgba(22,163,74,0.55)", ink: "#14532d" },
  orange: { fill: "#fff4ea", border: "rgba(234,88,12,0.55)", ink: "#7c2d12" },
  pink: { fill: "#fdeff6", border: "rgba(219,39,119,0.55)", ink: "#831843" },
};

export const DEFAULT_NODE_ACCENT: NodeAccent = "neutral";

/** Default fill kept for backward-compat with any node missing an accent. */
export const NODE_FILL = NODE_ACCENTS.neutral.fill;

/** Accent choices offered in the contextual toolbar (order matters). */
export const NODE_ACCENT_LIST: { key: NodeAccent; name: string }[] = [
  { key: "neutral", name: "Neutral" },
  { key: "blue", name: "Blue" },
  { key: "violet", name: "Violet" },
  { key: "green", name: "Green" },
  { key: "orange", name: "Orange" },
  { key: "pink", name: "Pink" },
];

// Connectors.
export const CONNECTOR_STROKE = "#64748b";
export const CONNECTOR_WIDTH = 2.5;
/** Screen-space radii for anchor dots and their hit test. */
export const ANCHOR_R = 4;
export const ANCHOR_HIT = 13;

/**
 * Extra (non-default) object properties that must be serialized so NoteDrift's
 * relationship model survives save/load. Passed to `canvas.toObject(...)`.
 */
export const NOTEDRIFT_PROPS = [
  "ndId",
  "ndRole",
  "sourceId",
  "targetId",
  "sourceAnchor",
  "targetAnchor",
  "connKind",
  "sourceFree",
  "targetFree",
  // Phase 1.5 — mind-map relationship/state props.
  "hier", // connector: true = parent→child hierarchy edge, false = freeform link
  "ndAccent", // node: soft accent key
  "ndCollapsed", // node: branch collapsed (descendants hidden)
  // Phase 1.6B — which brush produced a freehand ink path.
  "ndBrush",
  // Phase 1.6C — shape identity/params and line arrowheads.
  "ndShape",
  "ndSides",
  "ndPoints",
  "ndInner",
  "startHead",
  "endHead",
];

/** Stroke dash arrays (absolute px; strokeUniform keeps them constant on zoom). */
export const DASH_ARRAYS: Record<"solid" | "dashed" | "dotted", number[] | null> = {
  solid: null,
  dashed: [12, 9],
  dotted: [2, 7],
};

// Default style for newly drawn shapes and lines.
export const SHAPE_DEFAULT_STROKE = "#20242e";
export const SHAPE_DEFAULT_FILL = "transparent";
export const SHAPE_DEFAULT_WIDTH = 3;
export const LINE_DEFAULT_STROKE = "#20242e";
export const LINE_DEFAULT_WIDTH = 4;

/** Discrete stroke widths for shape/line outlines. */
export const OUTLINE_WIDTHS = [1, 2, 3, 5, 8, 12];
