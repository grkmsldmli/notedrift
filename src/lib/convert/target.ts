// Pure decision logic for target-size image compression. No browser APIs — the
// candidate generation (canvas encoding) lives in image.ts and calls these to
// choose sizes and the best result, so the strategy is unit-testable.

/** A sensible automatic target (KB) for a given original — roughly half the
 *  original, floored to a tidy 10 KB step, never below 10 KB. */
export function defaultTargetKb(originalBytes: number): number {
  const halfKb = (originalBytes * 0.5) / 1024;
  return Math.max(10, Math.floor(halfKb / 10) * 10);
}

/** Validate a requested target (in KB) against the original size. */
export function validateTargetKb(
  kb: number,
  originalBytes: number,
): { valid: boolean; alreadyUnder: boolean; error?: string } {
  if (!Number.isFinite(kb) || !Number.isInteger(kb) || kb < 10) {
    return { valid: false, alreadyUnder: false, error: "Enter a target of at least 10 KB." };
  }
  // If the target is already >= the original, there is nothing to gain by
  // re-encoding — the caller should surface "already under target".
  return { valid: true, alreadyUnder: kb * 1024 >= originalBytes };
}

/** First-guess downscale factor to bring a candidate of `candidateBytes` down to
 *  `targetBytes` — file size scales roughly with pixel area, so linear scale ≈
 *  sqrt(size ratio). Clamped to (0, 1]. */
export function estimateDownscale(targetBytes: number, candidateBytes: number): number {
  if (candidateBytes <= 0) return 1;
  return Math.min(1, Math.max(0.01, Math.sqrt(targetBytes / candidateBytes)));
}

export interface Candidate {
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  /** JPEG/WebP encoder quality, if applicable. */
  readonly quality?: number;
}

/** Choose the best candidate for a target-size budget:
 *  - If any candidate is AT OR BELOW target, pick the one that uses the budget
 *    best — highest resolution (pixel area) first, then highest encoder quality.
 *    (So a 195 KB full-res result beats a 120 KB one for a 200 KB target.)
 *  - If none reached target, pick the CLOSEST (smallest over-target) and report
 *    reachedTarget=false.
 *  Returns the chosen index into `candidates`, or null if there are none. */
export function pickBestCandidate(
  candidates: readonly Candidate[],
  targetBytes: number,
): { index: number; reachedTarget: boolean } | null {
  if (candidates.length === 0) return null;

  let bestValid = -1;
  let bestClosest = 0;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c.bytes <= targetBytes) {
      if (bestValid === -1 || isBetterValid(c, candidates[bestValid])) bestValid = i;
    }
    if (c.bytes < candidates[bestClosest].bytes) bestClosest = i;
  }
  return bestValid !== -1
    ? { index: bestValid, reachedTarget: true }
    : { index: bestClosest, reachedTarget: false };
}

function isBetterValid(a: Candidate, b: Candidate): boolean {
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  if (areaA !== areaB) return areaA > areaB; // more resolution wins
  return (a.quality ?? 1) > (b.quality ?? 1); // then more quality
}
