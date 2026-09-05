"use client";

// Tap BPM — tap along with a beat to calculate its tempo. Uses the shared tap-tempo
// math (src/lib/audio/bpm) with high-resolution performance.now() timing, a median
// of recent intervals for outlier resistance, and an idle reset. No audio at all.

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { bpmFromTaps, registerTap } from "@/lib/audio/bpm";

export function TapBpm() {
  const [bpm, setBpm] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const tapsRef = useRef<number[]>([]);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tap = useCallback(() => {
    const next = registerTap(tapsRef.current, performance.now());
    tapsRef.current = next;
    setBpm(bpmFromTaps(next));
    setCount(next.length);
    setPulse(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => setPulse(false), 110);
  }, []);

  const reset = useCallback(() => {
    tapsRef.current = [];
    setBpm(null);
    setCount(0);
  }, []);

  // Global Space / Enter taps — unless the user is typing in a form control (so we
  // never hijack Space in an input) and never on key repeat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.code === "Space" || e.code === "Enter" || e.key === " " || e.key === "Enter") {
        e.preventDefault(); // stop Space from scrolling the page
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap]);

  useEffect(
    () => () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    },
    [],
  );

  return (
    <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-5 sm:p-6">
      <div
        role="button"
        tabIndex={0}
        aria-label="Tap the beat"
        onPointerDown={tap}
        style={{ touchAction: "manipulation" }}
        className={[
          "flex min-h-[260px] cursor-pointer select-none flex-col items-center justify-center rounded-2xl border text-center transition",
          pulse
            ? "border-nd-accent bg-nd-accent/15 motion-safe:scale-[0.99]"
            : "border-nd-border bg-nd-surface-2/40 hover:border-nd-accent/40",
        ].join(" ")}
      >
        <div className="text-[11px] uppercase tracking-wide text-nd-muted">BPM</div>
        <div aria-hidden className="mt-1 text-7xl font-bold tabular-nums text-nd-text sm:text-8xl">
          {bpm ?? "—"}
        </div>
        <div className="mt-3 text-sm text-nd-muted">Tap the beat</div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {bpm != null ? `${bpm} beats per minute` : "Tap to start"}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-nd-muted">
          Taps: <span className="tabular-nums text-nd-text">{count}</span>
        </div>
        <button
          type="button"
          onClick={reset}
          className="nd-hit inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-3 py-1.5 text-sm text-nd-text transition-colors hover:bg-white/5"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      <p className="mt-3 text-center text-[11px] text-nd-muted">
        Click, tap, or press Space to tap along.
      </p>
    </div>
  );
}
