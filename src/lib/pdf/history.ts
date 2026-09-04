// Bounded snapshot undo/redo. Generic over the snapshotted state so it can hold
// the overlay model in tests and the full document state (page slots + overlays)
// in the editor. Snapshots share references for unchanged parts, so a snapshot
// is a small object — never PDF bytes or page bitmaps.

export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export const MAX_HISTORY = 120;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Record a new state as the present, clearing redo. A no-op (same reference) is
 *  ignored so it doesn't pollute the undo stack. */
export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  const trimmed = past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past;
  return { past: trimmed, present: next, future: [] };
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0;
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const present = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const present = h.future[0];
  return { past: [...h.past, h.present], present, future: h.future.slice(1) };
}
