// The overlay document model — the user's edits, layered over the immutable
// source PDF. Everything here is pure data + pure helpers so it can be unit
// tested and snapshotted for undo/redo. Geometry is in DISPLAY space (see
// coordinates.ts): zoom-independent points, top-left origin. Fabric objects are
// transient view-space representations built from these on load and read back on
// commit — repeated zooming never touches this model.

export type OverlayType =
  | "text"
  | "freehand"
  | "highlight"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "image"
  | "whiteout";

export type FontFamilyKey = "sans" | "serif" | "mono";
export type TextAlign = "left" | "center" | "right";

interface BaseOverlay {
  readonly id: string;
  readonly pageId: string;
  readonly type: OverlayType;
  /** 0..1 */
  readonly opacity: number;
}

/** New text authored in NoteDrift (NOT edited source-PDF text). */
export interface PdfTextOverlay extends BaseOverlay {
  readonly type: "text";
  /** Top-left of the text box, display space. */
  readonly x: number;
  readonly y: number;
  /** Box width (display pts) for wrapping. */
  readonly width: number;
  /** Degrees, clockwise in display space. */
  readonly angle: number;
  readonly text: string;
  readonly fontSize: number; // display pts
  readonly fontFamily: FontFamilyKey;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly align: TextAlign;
  readonly color: string;
}

export interface PdfFreehandOverlay extends BaseOverlay {
  readonly type: "freehand";
  /** Absolute display-space samples. Move/scale/rotate is baked straight into
   *  these points (never a separate transform), so the outline is always the
   *  current geometry — width changes regenerate the stroke around the same
   *  points (no drift), and export needs no transform reconstruction. */
  readonly points: readonly (readonly [number, number])[];
  readonly width: number; // display pts
  readonly color: string;
}

export interface PdfHighlightOverlay extends BaseOverlay {
  readonly type: "highlight";
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
}

interface BaseBoxShape extends BaseOverlay {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly angle: number; // degrees
  readonly stroke: string;
  readonly strokeWidth: number; // display pts
  readonly fill: string | null;
}

export interface PdfRectOverlay extends BaseBoxShape {
  readonly type: "rect";
  readonly radius: number; // corner radius, display pts (0 = square)
}

export interface PdfEllipseOverlay extends BaseBoxShape {
  readonly type: "ellipse";
}

interface BaseSegment extends BaseOverlay {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stroke: string;
  readonly strokeWidth: number; // display pts
}

export interface PdfLineOverlay extends BaseSegment {
  readonly type: "line";
}

export interface PdfArrowOverlay extends BaseSegment {
  readonly type: "arrow";
}

/** A raster image / signature image placed by the user. Bytes are a local data
 *  URL (PNG or JPEG) — never uploaded. */
export interface PdfImageOverlay extends BaseOverlay {
  readonly type: "image";
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly angle: number;
  readonly src: string; // data:image/(png|jpeg);base64,...
  readonly format: "png" | "jpg";
}

/** An opaque rectangle placed OVER source content (a cover, NOT secure
 *  redaction — the underlying content is not removed). */
export interface PdfWhiteoutOverlay extends BaseOverlay {
  readonly type: "whiteout";
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
  readonly angle: number;
  readonly color: string;
}

export type PdfOverlay =
  | PdfTextOverlay
  | PdfFreehandOverlay
  | PdfHighlightOverlay
  | PdfRectOverlay
  | PdfEllipseOverlay
  | PdfLineOverlay
  | PdfArrowOverlay
  | PdfImageOverlay
  | PdfWhiteoutOverlay;

/* --------------------------------- ids ---------------------------------- */

let seq = 0;

/** Unique overlay id. Uniqueness (not a specific format) is what matters. */
export function createOverlayId(prefix = "ov"): string {
  seq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${seq.toString(36)}_${rand}`;
}

/* ------------------------------ overlay state ---------------------------- */

/** pageId → overlays on that page. Immutable; unchanged pages keep identity. */
export type OverlayState = Readonly<Record<string, readonly PdfOverlay[]>>;

export const EMPTY_OVERLAY_STATE: OverlayState = Object.freeze({});

export function overlaysForPage(state: OverlayState, pageId: string): readonly PdfOverlay[] {
  return state[pageId] ?? [];
}

export function totalOverlayCount(state: OverlayState): number {
  let n = 0;
  for (const key of Object.keys(state)) n += state[key].length;
  return n;
}

export function addOverlay(state: OverlayState, overlay: PdfOverlay): OverlayState {
  const list = state[overlay.pageId] ?? [];
  return { ...state, [overlay.pageId]: [...list, overlay] };
}

export function updateOverlay(state: OverlayState, overlay: PdfOverlay): OverlayState {
  const list = state[overlay.pageId] ?? [];
  const idx = list.findIndex((o) => o.id === overlay.id);
  if (idx === -1) return addOverlay(state, overlay);
  const next = list.slice();
  next[idx] = overlay;
  return { ...state, [overlay.pageId]: next };
}

export function removeOverlay(state: OverlayState, pageId: string, id: string): OverlayState {
  const list = state[pageId];
  if (!list) return state;
  const next = list.filter((o) => o.id !== id);
  if (next.length === list.length) return state;
  return { ...state, [pageId]: next };
}

export function replacePageOverlays(
  state: OverlayState,
  pageId: string,
  overlays: readonly PdfOverlay[],
): OverlayState {
  return { ...state, [pageId]: overlays.slice() };
}

/* --------------------------- geometry helpers ---------------------------- */
// Display space ↔ view space is a pure scalar multiply by the current zoom.
// These small helpers exist mainly so the invariance is locked by tests.

export interface ViewBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export function boxToView(box: ViewBox, scale: number): ViewBox {
  return { cx: box.cx * scale, cy: box.cy * scale, w: box.w * scale, h: box.h * scale };
}

export function boxFromView(box: ViewBox, scale: number): ViewBox {
  const s = scale || 1;
  return { cx: box.cx / s, cy: box.cy / s, w: box.w / s, h: box.h / s };
}

/** Ensure width/height are positive (Fabric can report negatives after a flip). */
export function normalizeBox(box: ViewBox): ViewBox {
  return { cx: box.cx, cy: box.cy, w: Math.abs(box.w), h: Math.abs(box.h) };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}
