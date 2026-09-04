// Undo/redo for PDF overlay edits — dedicated to this editor, never the main
// canvas history. Stores lightweight OverlayState snapshots (unchanged pages
// keep reference identity, so a snapshot is a small map, never PDF bytes or page
// bitmaps). Bounded so browser memory can't grow without limit.

import type { OverlayState } from "./overlays.ts";

export interface OverlayHistory {
  readonly past: readonly OverlayState[];
  readonly present: OverlayState;
  readonly future: readonly OverlayState[];
}

export const MAX_HISTORY = 120;

export function createHistory(present: OverlayState): OverlayHistory {
  return { past: [], present, future: [] };
}

/** Record a new state as the present, clearing the redo stack. A no-op change
 *  (same reference) is ignored so it doesn't pollute the undo stack. */
export function commit(h: OverlayHistory, next: OverlayState): OverlayHistory {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  const trimmed = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
  return { past: trimmed, present: next, future: [] };
}

export function canUndo(h: OverlayHistory): boolean {
  return h.past.length > 0;
}

export function canRedo(h: OverlayHistory): boolean {
  return h.future.length > 0;
}

export function undo(h: OverlayHistory): OverlayHistory {
  if (!h.past.length) return h;
  const present = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present, future: [h.present, ...h.future] };
}

export function redo(h: OverlayHistory): OverlayHistory {
  if (!h.future.length) return h;
  const present = h.future[0];
  return { past: [...h.past, h.present], present, future: h.future.slice(1) };
}
