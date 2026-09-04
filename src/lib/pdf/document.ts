// The editable document structure: an ordered list of page slots layered over
// the immutable source PDF, plus the overlay model. Page operations (rotate,
// delete, duplicate, reorder) manipulate slots — never the source — and are
// snapshotted together with overlays so undo/redo covers everything. Pure +
// tested.

import { applyMatrix, type Matrix } from "./coordinates.ts";
import {
  createOverlayId,
  overlaysForPage,
  replacePageOverlays,
  type OverlayState,
  type PdfOverlay,
} from "./overlays.ts";

/** One visible page: a reference to a source PDF page + a user rotation, with a
 *  stable id that overlays key off (so edits follow the page through reorder /
 *  duplicate). */
export interface PageSlot {
  readonly id: string;
  /** 0-based index into the original PDF's pages. */
  readonly sourceIndex: number;
  /** Extra user rotation, normalized 0 | 90 | 180 | 270 (on top of the source
   *  page's own /Rotate). */
  readonly rotation: number;
}

export interface DocState {
  readonly pages: readonly PageSlot[];
  readonly overlays: OverlayState;
}

export function initialPages(numPages: number): PageSlot[] {
  return Array.from({ length: Math.max(1, numPages) }, (_, i) => ({
    id: `pg-${i + 1}`,
    sourceIndex: i,
    rotation: 0,
  }));
}

export function slotIndex(pages: readonly PageSlot[], slotId: string): number {
  return pages.findIndex((p) => p.id === slotId);
}

function norm(r: number): number {
  return ((Math.round(r / 90) * 90) % 360 + 360) % 360;
}

/** Rotate a slot by ±90 and re-project its overlays with the given display-space
 *  matrix + angle delta so they stay attached to the content. */
export function rotatePage(
  state: DocState,
  slotId: string,
  deltaDeg: number,
  matrix: Matrix,
): DocState {
  const idx = slotIndex(state.pages, slotId);
  if (idx === -1) return state;
  const pages = state.pages.slice();
  pages[idx] = { ...pages[idx], rotation: norm(pages[idx].rotation + deltaDeg) };
  const reprojected = overlaysForPage(state.overlays, slotId).map((o) =>
    reprojectOverlay(o, matrix, deltaDeg),
  );
  const overlays = replacePageOverlays(state.overlays, slotId, reprojected);
  return { pages, overlays };
}

/** Delete a slot (never the last one) and its overlays. */
export function deletePage(state: DocState, slotId: string): DocState {
  if (state.pages.length <= 1) return state;
  const idx = slotIndex(state.pages, slotId);
  if (idx === -1) return state;
  const pages = state.pages.filter((p) => p.id !== slotId);
  const overlays = { ...state.overlays };
  delete (overlays as Record<string, unknown>)[slotId];
  return { pages, overlays };
}

/** Duplicate a slot right after it, copying its overlays with fresh ids. */
export function duplicatePage(state: DocState, slotId: string): DocState {
  const idx = slotIndex(state.pages, slotId);
  if (idx === -1) return state;
  const src = state.pages[idx];
  const newId = createOverlayId("pg");
  const pages = state.pages.slice();
  pages.splice(idx + 1, 0, { ...src, id: newId });
  const copied = overlaysForPage(state.overlays, slotId).map((o) => ({
    ...o,
    id: createOverlayId(o.type),
    pageId: newId,
  }));
  const overlays = copied.length
    ? replacePageOverlays(state.overlays, newId, copied)
    : state.overlays;
  return { pages, overlays };
}

/** Move a slot from one position to another (reorder). */
export function movePage(state: DocState, from: number, to: number): DocState {
  const n = state.pages.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return state;
  const pages = state.pages.slice();
  const [moved] = pages.splice(from, 1);
  pages.splice(to, 0, moved);
  return { pages, overlays: state.overlays };
}

/* ------------------------- overlay re-projection ------------------------- */

const map = (m: Matrix, x: number, y: number) => applyMatrix(m, { x, y });

/** Re-map an overlay from one page-rotation's display space to another's. */
export function reprojectOverlay(o: PdfOverlay, m: Matrix, angleDelta: number): PdfOverlay {
  switch (o.type) {
    case "freehand":
      return { ...o, points: o.points.map((p) => { const q = map(m, p[0], p[1]); return [q.x, q.y] as [number, number]; }) };
    case "text": {
      const p = map(m, o.x, o.y);
      return { ...o, x: p.x, y: p.y, angle: o.angle + angleDelta };
    }
    case "highlight": {
      // Highlight has no angle field, so a 90/270 rotation must swap w/h to keep
      // it aligned to the content.
      const c = map(m, o.cx, o.cy);
      const swap = (((Math.round(angleDelta / 90) % 2) + 2) % 2) === 1;
      return { ...o, cx: c.x, cy: c.y, w: swap ? o.h : o.w, h: swap ? o.w : o.h };
    }
    case "rect":
    case "ellipse":
    case "image":
    case "whiteout": {
      const c = map(m, o.cx, o.cy);
      return { ...o, cx: c.x, cy: c.y, angle: o.angle + angleDelta };
    }
    case "line":
    case "arrow": {
      const a = map(m, o.x1, o.y1);
      const b = map(m, o.x2, o.y2);
      return { ...o, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
  }
}
