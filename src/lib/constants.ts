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
export const NODE_FILL = "#eef2ff";
export const NODE_INK = "#20242e";
export const MINDMAP_GAP_X = 90;
export const MINDMAP_GAP_Y = 22;

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
];
