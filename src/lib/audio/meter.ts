// Pure signal-processing helpers for the Sound Meter. A browser microphone is NOT
// a calibrated SPL meter — Web Audio exposes digital amplitude, not certified sound
// pressure. These map amplitude to an APPROXIMATE display dB using one documented
// reference offset plus an optional user calibration. Isomorphic + pure so they are
// unit-tested without any audio hardware. Nothing here records or transmits audio.

/** Offset mapping 0 dBFS (digital full scale) to an approximate display dB.
 *  Uncalibrated — real devices vary widely, which is why a user calibration control
 *  exists. Not a certified SPL reference. */
export const DBFS_TO_DISPLAY_OFFSET = 94;
export const DISPLAY_DB_MIN = 0;
export const DISPLAY_DB_MAX = 130;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Root-mean-square of time-domain samples (each in [-1, 1]). */
export function rms(samples: Float32Array | number[]): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / n);
}

/** RMS amplitude (0..1) to dBFS (<= 0). Silence -> -Infinity. */
export function rmsToDbfs(r: number): number {
  return r > 0 ? 20 * Math.log10(r) : -Infinity;
}

/** Approximate display dB from dBFS + calibration, clamped to a sane range. */
export function estimatedDb(dbfs: number, calibration = 0): number {
  if (!Number.isFinite(dbfs)) return DISPLAY_DB_MIN;
  return clamp(dbfs + DBFS_TO_DISPLAY_OFFSET + calibration, DISPLAY_DB_MIN, DISPLAY_DB_MAX);
}

/** Convenience: time-domain samples -> approximate display dB. */
export function dbFromSamples(samples: Float32Array | number[], calibration = 0): number {
  return estimatedDb(rmsToDbfs(rms(samples)), calibration);
}

/** Descriptive (NOT certified) level label for a display dB value (§10). */
export function levelLabel(db: number): string {
  if (db < 35) return "Very quiet";
  if (db < 50) return "Quiet";
  if (db < 65) return "Moderate";
  if (db < 80) return "Loud";
  if (db < 95) return "Very loud";
  return "Extremely loud";
}

/** Exponential moving average, for a stable on-screen reading. alpha in (0, 1]. */
export function ewma(prev: number | null, next: number, alpha: number): number {
  return prev == null || !Number.isFinite(prev) ? next : prev + alpha * (next - prev);
}

export interface MeterStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

export const EMPTY_STATS: MeterStats = { min: NaN, max: NaN, avg: NaN, count: 0 };

/** Fold a new reading into running min/max/avg (streaming mean — no history kept). */
export function accumulate(s: MeterStats, db: number): MeterStats {
  if (!Number.isFinite(db)) return s;
  const count = s.count + 1;
  return {
    min: s.count === 0 ? db : Math.min(s.min, db),
    max: s.count === 0 ? db : Math.max(s.max, db),
    avg: s.count === 0 ? db : s.avg + (db - s.avg) / count,
    count,
  };
}

/** Clamp a calibration value to the supported adjustment range. */
export const CALIBRATION_MIN = -20;
export const CALIBRATION_MAX = 20;
export function clampCalibration(v: number): number {
  return Number.isFinite(v) ? clamp(Math.round(v), CALIBRATION_MIN, CALIBRATION_MAX) : 0;
}
