// Shared tap-tempo math. Used by BOTH the Tap BPM tool and the Metronome's tap
// tempo — one algorithm, no duplication (§23). Pure + isomorphic so it is
// unit-tested. Callers supply high-resolution timestamps (performance.now()).

export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const MIN_INTERVAL_MS = 60000 / MAX_BPM; // 200ms
export const MAX_INTERVAL_MS = 60000 / MIN_BPM; // 2000ms
export const TAP_RESET_MS = 2500; // start a fresh sequence after this idle gap
export const TAP_WINDOW = 8; // recent intervals used for a stable estimate

export function clampBpm(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
}

export function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** BPM from ascending tap timestamps (ms). Needs >= 2 taps. Uses the MEDIAN of the
 *  recent in-range inter-tap intervals, so a single stray tap can't wreck the
 *  estimate, and intervals outside the supported BPM range are discarded. Returns
 *  null when there isn't enough usable data. */
export function bpmFromTaps(taps: number[]): number | null {
  if (taps.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
  const valid = intervals.filter((iv) => iv >= MIN_INTERVAL_MS && iv <= MAX_INTERVAL_MS);
  if (valid.length === 0) return null;
  const m = median(valid.slice(-TAP_WINDOW));
  if (!(m > 0)) return null;
  return Math.round(clampBpm(60000 / m));
}

/** Append a tap at `now` (ms). If the previous tap was more than TAP_RESET_MS ago,
 *  begin a fresh sequence. Keeps only enough taps for TAP_WINDOW intervals. */
export function registerTap(taps: number[], now: number): number[] {
  const last = taps[taps.length - 1];
  const base = last != null && now - last > TAP_RESET_MS ? [] : taps;
  const next = [...base, now];
  return next.length > TAP_WINDOW + 1 ? next.slice(next.length - (TAP_WINDOW + 1)) : next;
}
