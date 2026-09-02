// A minimal undo/redo stack that stores serialized canvas snapshots.
//
// Each snapshot is a JSON string of `canvas.toJSON()`. The controller records a
// snapshot after every discrete, meaningful change (shape drawn, object moved,
// stroke finished, object deleted, text edited).

export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private current: string | null = null;
  private readonly limit: number;

  constructor(limit = 100) {
    this.limit = limit;
  }

  /** Establish a new baseline (e.g. after loading a page). Clears history. */
  reset(state: string): void {
    this.current = state;
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Record a new state. No-op if identical to the current state. */
  record(state: string): void {
    if (state === this.current) return;
    if (this.current !== null) {
      this.undoStack.push(this.current);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.current = state;
    this.redoStack = [];
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
    if (this.current !== null) this.redoStack.push(this.current);
    this.current = prev;
    return prev;
  }

  /** Move one step forward. Returns the state to load, or null if unavailable. */
  redo(): string | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    if (this.current !== null) this.undoStack.push(this.current);
    this.current = next;
    return next;
  }
}
