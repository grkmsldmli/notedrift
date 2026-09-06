// Shared PDF tool helpers. The page-range parsing is PURE and unit-tested; the
// byte reader is a thin browser helper. pdf-lib / pdfjs operations live in the
// individual tool components.

/** Read a File into bytes (browser). */
export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Parse a page selection like "1-3, 5, 8-10" into a FLAT, sorted, de-duplicated
 * list of 1-based page numbers, clamped to [1, total]. Invalid/out-of-range
 * tokens are ignored. Used by "extract pages".
 */
export function parsePageList(input: string, total: number): number[] {
  const set = new Set<number>();
  for (const raw of input.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) if (p >= 1 && p <= total) set.add(p);
    } else if (/^\d+$/.test(token)) {
      const p = parseInt(token, 10);
      if (p >= 1 && p <= total) set.add(p);
    }
  }
  return [...set].sort((x, y) => x - y);
}

/**
 * Parse a split spec like "1-3, 5, 7-9" into ORDERED GROUPS — each comma group
 * becomes its own output part. Empty/invalid groups are dropped; pages are
 * clamped to [1, total]. Used by "split PDF".
 */
export function parsePageRangeGroups(input: string, total: number): number[][] {
  const groups: number[][] = [];
  for (const raw of input.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(token);
    const pages: number[] = [];
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) if (p >= 1 && p <= total) pages.push(p);
    } else if (/^\d+$/.test(token)) {
      const p = parseInt(token, 10);
      if (p >= 1 && p <= total) pages.push(p);
    }
    if (pages.length > 0) groups.push(pages);
  }
  return groups;
}
