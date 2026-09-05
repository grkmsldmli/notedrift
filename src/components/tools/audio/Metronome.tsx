"use client";

// Metronome — a steady BPM click. Timing comes from the AudioContext clock via a
// look-ahead scheduler (a setInterval tick schedules beats a little ahead on the
// audio timeline), NOT from setInterval firing each click — so it doesn't drift or
// throttle. The click is synthesized locally (no audio file). Tap tempo reuses the
// shared BPM math. No audio input, no upload.

import { useCallback, useEffect, useRef, useState } from "react";
import { Hand, Minus, Plus, Square, Triangle, Volume2, VolumeX } from "lucide-react";
import { bpmFromTaps, registerTap } from "@/lib/audio/bpm";
import {
  BEATS_PER_BAR_OPTIONS,
  beatIntervalSec,
  clampBpm,
  clampVolume,
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_BPM,
  isAccent,
  nextBeatIndex,
  type BeatsPerBar,
} from "@/lib/audio/metronome";
import { MAX_BPM, MIN_BPM } from "@/lib/audio/bpm";

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;
const BPM_KEY = "notedrift:metronome:bpm";
const VOL_KEY = "notedrift:metronome:volume";

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function Metronome() {
  const [running, setRunning] = useState(false);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [beatsPerBar, setBeatsPerBar] = useState<BeatsPerBar>(DEFAULT_BEATS_PER_BAR);
  const [accentFirst, setAccentFirst] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [visualBeat, setVisualBeat] = useState(-1);
  const [bpmInput, setBpmInput] = useState(String(DEFAULT_BPM));

  const ctxRef = useRef<AudioContext | null>(null);
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const currentBeatRef = useRef(0);
  const queueRef = useRef<{ beat: number; time: number }[]>([]);
  const bpmRef = useRef(DEFAULT_BPM);
  const bpbRef = useRef<BeatsPerBar>(DEFAULT_BEATS_PER_BAR);
  const accentRef = useRef(true);
  const gainRef = useRef(1);
  const runningRef = useRef(false);
  const tapsRef = useRef<number[]>([]);
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    bpbRef.current = beatsPerBar;
  }, [beatsPerBar]);
  useEffect(() => {
    accentRef.current = accentFirst;
  }, [accentFirst]);
  useEffect(() => {
    gainRef.current = muted ? 0 : volume;
  }, [muted, volume]);

  // load saved preferences (bpm + volume)
  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      try {
        const b = localStorage.getItem(BPM_KEY);
        if (b != null) {
          const v = clampBpm(Number(b));
          bpmRef.current = v;
          setBpm(v);
          setBpmInput(String(v));
        }
        const vol = localStorage.getItem(VOL_KEY);
        if (vol != null) {
          const v = clampVolume(Number(vol));
          gainRef.current = v;
          setVolume(v);
        }
      } catch {
        /* storage unavailable — defaults */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const scheduleClick = useCallback((time: number, accent: boolean) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = accent ? 1500 : 1000;
    const vol = Math.max(gainRef.current, 0.0002);
    // short envelope -> clean click, no lingering tone, no clipping
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(g).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !runningRef.current) return;
    // Resync if we fell behind (e.g., a throttled background tab) — schedule from
    // "now", never a burst of missed beats.
    if (nextNoteTimeRef.current < ctx.currentTime) {
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
    }
    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
      const beat = currentBeatRef.current;
      scheduleClick(nextNoteTimeRef.current, isAccent(beat, accentRef.current));
      queueRef.current.push({ beat, time: nextNoteTimeRef.current });
      nextNoteTimeRef.current += beatIntervalSec(bpmRef.current);
      currentBeatRef.current = nextBeatIndex(beat, bpbRef.current);
    }
  }, [scheduleClick]);

  const draw = useCallback(() => {
    if (!runningRef.current) {
      rafRef.current = null;
      return;
    }
    const ctx = ctxRef.current;
    if (ctx) {
      const q = queueRef.current;
      let beat = -2;
      while (q.length && q[0].time <= ctx.currentTime) {
        beat = q[0].beat;
        q.shift();
      }
      if (beat !== -2) setVisualBeat(beat);
    }
    rafRef.current = requestAnimationFrame(drawRef.current);
  }, []);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (schedulerRef.current != null) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    queueRef.current = [];
    setVisualBeat(-1);
  }, []);

  const start = useCallback(async () => {
    const Ctx = getAudioContextCtor();
    if (!Ctx) return;
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new Ctx();
      ctxRef.current = ctx;
    }
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    currentBeatRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    queueRef.current = [];
    runningRef.current = true;
    setRunning(true);
    schedulerRef.current = setInterval(scheduler, LOOKAHEAD_MS);
    rafRef.current = requestAnimationFrame(drawRef.current);
  }, [scheduler]);

  const onStop = useCallback(() => {
    stop();
    setRunning(false);
  }, [stop]);

  // cleanup on unmount: stop scheduling + close the context
  useEffect(
    () => () => {
      stop();
      const c = ctxRef.current;
      ctxRef.current = null;
      if (c) void c.close().catch(() => {});
    },
    [stop],
  );

  const changeBpm = useCallback((v: number) => {
    const b = clampBpm(Math.round(v));
    bpmRef.current = b;
    setBpm(b);
    setBpmInput(String(b));
    try {
      localStorage.setItem(BPM_KEY, String(b));
    } catch {
      /* ignore */
    }
  }, []);

  const commitBpmInput = () => {
    const n = Number(bpmInput);
    changeBpm(Number.isFinite(n) ? n : bpm);
  };

  const onVolume = (v: number) => {
    const vol = clampVolume(v);
    setVolume(vol);
    if (!muted) gainRef.current = vol;
    try {
      localStorage.setItem(VOL_KEY, String(vol));
    } catch {
      /* ignore */
    }
  };

  const tapTempo = useCallback(() => {
    const next = registerTap(tapsRef.current, performance.now());
    tapsRef.current = next;
    const b = bpmFromTaps(next);
    if (b != null) changeBpm(b);
  }, [changeBpm]);

  return (
    <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-5 sm:p-6">
      {/* BPM */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Decrease tempo"
            onClick={() => changeBpm(bpmRef.current - 1)}
            className="nd-hit flex h-10 w-10 items-center justify-center rounded-full border border-nd-border text-nd-text hover:bg-white/5"
          >
            <Minus size={18} />
          </button>
          <div className="flex items-baseline gap-1">
            <input
              aria-label="Tempo in beats per minute"
              inputMode="numeric"
              value={bpmInput}
              onChange={(e) => setBpmInput(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commitBpmInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-24 bg-transparent text-center text-5xl font-bold tabular-nums text-nd-text outline-none sm:text-6xl"
            />
            <span className="text-sm font-medium text-nd-muted">BPM</span>
          </div>
          <button
            type="button"
            aria-label="Increase tempo"
            onClick={() => changeBpm(bpmRef.current + 1)}
            className="nd-hit flex h-10 w-10 items-center justify-center rounded-full border border-nd-border text-nd-text hover:bg-white/5"
          >
            <Plus size={18} />
          </button>
        </div>

        <input
          aria-label="Tempo slider"
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          onChange={(e) => changeBpm(Number(e.target.value))}
          className="mt-4 w-full max-w-xs accent-nd-accent"
        />
      </div>

      {/* beat indicator (not color-only: active is filled + ringed; accent is larger) */}
      <div className="mt-5 flex items-center justify-center gap-2.5" aria-hidden>
        {Array.from({ length: beatsPerBar }).map((_, i) => {
          const active = running && visualBeat === i;
          const accent = accentFirst && i === 0;
          return (
            <span
              key={i}
              className={[
                "rounded-full border transition-transform",
                accent ? "h-4 w-4" : "h-3 w-3",
                active
                  ? "border-nd-accent bg-nd-accent motion-safe:scale-125"
                  : "border-nd-border bg-transparent",
              ].join(" ")}
            />
          );
        })}
      </div>

      {/* transport */}
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (running ? onStop() : void start())}
          className="nd-gradient flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {running ? (
            <>
              <Square size={16} /> Stop
            </>
          ) : (
            <>
              <Triangle size={16} className="rotate-90 fill-current" /> Start
            </>
          )}
        </button>
        <button
          type="button"
          onClick={tapTempo}
          className="nd-hit flex items-center justify-center gap-1.5 rounded-xl border border-nd-border px-4 py-3 text-sm text-nd-text transition-colors hover:bg-white/5"
        >
          <Hand size={15} /> Tap
        </button>
      </div>

      {/* beats per bar + accent */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-nd-muted">Beats</span>
          {BEATS_PER_BAR_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={beatsPerBar === n}
              onClick={() => setBeatsPerBar(n)}
              className={[
                "nd-hit h-8 w-8 rounded-lg border text-sm tabular-nums transition-colors",
                beatsPerBar === n
                  ? "border-nd-accent bg-nd-accent/15 text-nd-accent"
                  : "border-nd-border text-nd-text hover:bg-white/5",
              ].join(" ")}
            >
              {n}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-nd-muted">
          <input
            type="checkbox"
            checked={accentFirst}
            onChange={(e) => setAccentFirst(e.target.checked)}
            className="accent-nd-accent"
          />
          Accent first beat
        </label>
      </div>

      {/* volume */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => setMuted((m) => !m)}
          className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted hover:text-nd-text"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          aria-label="Volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => {
            if (muted) setMuted(false);
            onVolume(Number(e.target.value));
          }}
          className="flex-1 accent-nd-accent"
        />
      </div>
    </div>
  );
}
