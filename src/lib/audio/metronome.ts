// Pure metronome timing math. The audible click is scheduled on the AudioContext
// clock inside the component (a look-ahead scheduler); this module holds the beat /
// interval / accent logic so it is unit-tested without any audio.

import { clampBpm } from "./bpm.ts";

export { clampBpm };

export const BEATS_PER_BAR_OPTIONS = [2, 3, 4, 6] as const;
export type BeatsPerBar = (typeof BEATS_PER_BAR_OPTIONS)[number];
export const DEFAULT_BPM = 120;
export const DEFAULT_BEATS_PER_BAR: BeatsPerBar = 4;

/** Seconds between beats at a given BPM (BPM is clamped to the supported range). */
export function beatIntervalSec(bpm: number): number {
  return 60 / clampBpm(bpm);
}

/** The next beat index within a bar (wraps at beatsPerBar). */
export function nextBeatIndex(current: number, beatsPerBar: number): number {
  return (current + 1) % beatsPerBar;
}

/** Whether a beat is accented — the first beat of the bar, when accent is on. */
export function isAccent(beatIndex: number, accentFirst: boolean): boolean {
  return accentFirst && beatIndex === 0;
}

export const MIN_VOLUME = 0;
export const MAX_VOLUME = 1;
export function clampVolume(v: number): number {
  return Number.isFinite(v) ? Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, v)) : 1;
}
