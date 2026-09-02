// Design + behavior constants for the editor.

/** Base spacing (in scene units) between dotted-grid points. */
export const GRID_SIZE = 24;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

/** Freehand pen stroke width. */
export const PEN_WIDTH = 3;
/** Default stroke width for shapes/lines/arrows. */
export const STROKE_WIDTH = 2.5;

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
  note: "#fef3c7",
  noteInk: "#78350f",
  noteBorder: "#fcd982",
} as const;
