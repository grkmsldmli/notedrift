// Pure formatting + dimension math shared by every tool. No browser APIs here,
// so these are unit-tested directly with node's test runner.

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** How much smaller `after` is than `before`, as a rounded percent. Positive =
 *  smaller (a saving); negative = the output grew. */
export function savingsPercent(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((before - after) / before) * 100);
}

export function formatDimensions(w: number, h: number): string {
  return `${Math.round(w)} × ${Math.round(h)}`;
}

/**
 * Compute output dimensions for a resize. With `lock` on, a single provided edge
 * drives the other via the original aspect ratio; with `lock` off, each provided
 * edge is used directly and a missing edge keeps the original. Never returns a
 * dimension below 1.
 */
export function resizeDims(
  origW: number,
  origH: number,
  reqW: number | null,
  reqH: number | null,
  lock: boolean,
): { width: number; height: number } {
  if (origW <= 0 || origH <= 0) return { width: 0, height: 0 };
  const ar = origW / origH;
  const hasW = reqW != null && reqW > 0;
  const hasH = reqH != null && reqH > 0;
  if (lock) {
    if (hasW) return { width: Math.round(reqW!), height: Math.max(1, Math.round(reqW! / ar)) };
    if (hasH) return { width: Math.max(1, Math.round(reqH! * ar)), height: Math.round(reqH!) };
    return { width: origW, height: origH };
  }
  return {
    width: hasW ? Math.max(1, Math.round(reqW!)) : origW,
    height: hasH ? Math.max(1, Math.round(reqH!)) : origH,
  };
}
