// A minimal undo/redo stack that stores serialized canvas snapshots.
//
// Each snapshot is a JSON string of `canvas.toJSON()`. The controller records a
// snapshot after every discrete, meaningful change (shape drawn, object moved,
// stroke finished, object deleted, text edited).
//
// Two caps bound memory: a depth cap (how many steps back you can go) and a
// TOTAL-BYTES cap. The byte cap matters for image-heavy pages: every snapshot
// embeds each image's full data URL, so a handful of photos across 100 steps can
// otherwise balloon to well over a gigabyte. When the retained snapshots exceed
// the byte budget the oldest are dropped early (shallower undo, but never a
// crash) — the smallest safe mitigation, with no separate asset store.

/** ~384 MB of UTF-16 string data across the undo history. Normal vector pages
 *  (KB-sized snapshots) never approach it and keep the full depth; only pages
 *  with many large embedded images trade undo depth for staying alive. */
const MAX_HISTORY_CHARS = 192 * 1024 * 1024;

export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private current: string | null = null;
  private readonly limit: number;
  private readonly maxChars: number;
  private undoChars = 0;

  constructor(limit = 100, maxChars = MAX_HISTORY_CHARS) {
    this.limit = limit;
    this.maxChars = maxChars;
  }

  /** Establish a new baseline (e.g. after loading a page). Clears history. */
  reset(state: string): void {
    this.current = state;
    this.undoStack = [];
    this.redoStack = [];
    this.undoChars = 0;
  }

  /** Record a new state. No-op if identical to the current state. */
  record(state: string): void {
    if (state === this.current) return;
    if (this.current !== null) {
      this.undoStack.push(this.current);
      this.undoChars += this.current.length;
      // Depth cap.
      while (this.undoStack.length > this.limit) this.dropOldest();
      // Memory cap — keep at least one step so undo always does something.
      while (this.undoStack.length > 1 && this.undoChars > this.maxChars) {
        this.dropOldest();
      }
    }
    this.current = state;
    this.redoStack = [];
  }

  private dropOldest(): void {
    const dropped = this.undoStack.shift();
    if (dropped !== undefined) this.undoChars -= dropped.length;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Move one step back. Returns the state to load, or null if unavailable. */
  undo(): string | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.undoChars -= prev.length;
    if (this.current !== null) this.redoStack.push(this.current);
    this.current = prev;
    return prev;
  }

  /** Move one step forward. Returns the state to load, or null if unavailable. */
  redo(): string | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    if (this.current !== null) {
      this.undoStack.push(this.current);
      this.undoChars += this.current.length;
    }
    this.current = next;
    return next;
  }
}
