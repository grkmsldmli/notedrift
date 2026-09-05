"use client";

// Sound Meter — an APPROXIMATE, uncalibrated browser sound-level meter. It reads
// time-domain samples via Web Audio, computes RMS -> dBFS -> an approximate display
// dB (see src/lib/audio/meter), and never records or uploads audio. The microphone
// is released on Stop and on unmount.

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Mic, RotateCcw, Square } from "lucide-react";
import {
  accumulate,
  CALIBRATION_MAX,
  CALIBRATION_MIN,
  clamp,
  clampCalibration,
  dbFromSamples,
  EMPTY_STATS,
  ewma,
  levelLabel,
  type MeterStats,
} from "@/lib/audio/meter";

type Status = "idle" | "running" | "denied" | "error" | "unsupported" | "insecure";

const CALIB_KEY = "notedrift:soundmeter:calibration";
const UI_HZ = 15; // on-screen reading + chart refresh rate
const SMOOTH_ALPHA = 0.25;
const HISTORY_SECONDS = 40;
const CHART_MAX_DB = 120;
const ACCENT = "#6366f1";

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  );
}

export function SoundMeter() {
  const [status, setStatus] = useState<Status>("idle");
  const [db, setDb] = useState(0);
  const [stats, setStats] = useState<MeterStats>(EMPTY_STATS);
  const [calibration, setCalibration] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const statsRef = useRef<MeterStats>(EMPTY_STATS);
  const historyRef = useRef<number[]>([]);
  const lastUiRef = useRef(0);
  const lastLabelRef = useRef<string>("");
  const calibrationRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      await Promise.resolve(); // defer out of the synchronous effect phase
      try {
        const raw = localStorage.getItem(CALIB_KEY);
        if (raw != null && active) {
          const v = clampCalibration(Number(raw));
          calibrationRef.current = v;
          setCalibration(v);
        }
      } catch {
        /* private mode / disabled storage — default calibration */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const data = historyRef.current;
    const maxLen = HISTORY_SECONDS * UI_HZ;
    if (data.length < 2) return;
    const x = (i: number) => (i / (maxLen - 1)) * w;
    const y = (v: number) => h - (clamp(v, 0, CHART_MAX_DB) / CHART_MAX_DB) * h;
    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(x(i), y(data[i]));
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(x(data.length - 1), h);
    ctx.lineTo(x(0), h);
    ctx.closePath();
    ctx.fillStyle = "rgba(99,102,241,0.12)";
    ctx.fill();
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) void ctx.close().catch(() => {});
  }, []);

  // Release the microphone + audio graph on unmount — nothing stays active.
  useEffect(() => stop, [stop]);

  const tickRef = useRef<() => void>(() => {});
  const tick = useCallback(() => {
    if (!runningRef.current) return;
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (analyser && buf) {
      analyser.getFloatTimeDomainData(buf);
      const raw = dbFromSamples(buf, calibrationRef.current);
      const smoothed = ewma(smoothedRef.current, raw, SMOOTH_ALPHA);
      smoothedRef.current = smoothed;
      statsRef.current = accumulate(statsRef.current, smoothed);
      const now = performance.now();
      if (now - lastUiRef.current >= 1000 / UI_HZ) {
        lastUiRef.current = now;
        const rounded = Math.round(smoothed);
        setDb(rounded);
        setStats(statsRef.current);
        const h = historyRef.current;
        h.push(smoothed);
        const maxLen = HISTORY_SECONDS * UI_HZ;
        if (h.length > maxLen) h.splice(0, h.length - maxLen);
        drawChart();
        // Throttle screen-reader announcements to level-label changes only.
        const lbl = levelLabel(rounded);
        if (lbl !== lastLabelRef.current) {
          lastLabelRef.current = lbl;
          setAnnouncement(`${lbl}, about ${rounded} decibels`);
        }
      }
    }
    rafRef.current = requestAnimationFrame(tickRef.current);
  }, [drawChart]);

  // Keep the RAF self-scheduler pointing at the latest tick (avoids the callback
  // referencing itself, and survives re-creation).
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const start = useCallback(async () => {
    const Ctx = getAudioContextCtor();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || !Ctx) {
      setStatus("unsupported");
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setStatus("insecure");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      smoothedRef.current = null;
      statsRef.current = EMPTY_STATS;
      historyRef.current = [];
      lastUiRef.current = 0;
      lastLabelRef.current = "";
      runningRef.current = true;
      setStats(EMPTY_STATS);
      setDb(0);
      setAnnouncement("Measuring started");
      setStatus("running");
      rafRef.current = requestAnimationFrame(tickRef.current);
    } catch (e) {
      const err = e as DOMException;
      setStatus(err?.name === "NotAllowedError" || err?.name === "SecurityError" ? "denied" : "error");
      stop();
    }
  }, [stop]);

  const onStop = useCallback(() => {
    stop();
    setStatus("idle");
  }, [stop]);

  const reset = useCallback(() => {
    statsRef.current = EMPTY_STATS;
    smoothedRef.current = null;
    historyRef.current = [];
    lastLabelRef.current = "";
    setStats(EMPTY_STATS);
    setDb(0);
    drawChart();
  }, [drawChart]);

  const onCalibration = (value: number) => {
    const c = clampCalibration(value);
    setCalibration(c);
    calibrationRef.current = c;
    try {
      localStorage.setItem(CALIB_KEY, String(c));
    } catch {
      /* ignore storage failures */
    }
  };

  const running = status === "running";
  const label = levelLabel(db);
  const stat = (v: number) => (Number.isFinite(v) ? Math.round(v) : "—");

  return (
    <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-5 sm:p-6">
      {/* live region for screen readers — updated only on level-label change */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {!running && status !== "denied" && status !== "error" && status !== "unsupported" && status !== "insecure" && (
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-nd-accent/15 text-nd-accent">
            <Mic size={26} />
          </div>
          <p className="mx-auto max-w-sm text-sm text-nd-muted">
            Measure the approximate sound level around you. Your browser will ask for
            microphone access.
          </p>
          <button
            type="button"
            onClick={() => void start()}
            className="nd-gradient mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Mic size={16} /> Start measuring
          </button>
        </div>
      )}

      {(status === "denied" || status === "error" || status === "unsupported" || status === "insecure") && (
        <div className="py-6 text-center">
          <p className="mx-auto max-w-sm text-sm text-nd-text">
            {status === "denied" && "Microphone access is needed to measure sound. Allow it in your browser and try again."}
            {status === "error" && "Couldn't access the microphone. Check it isn't in use by another app and try again."}
            {status === "unsupported" && "This browser doesn't support microphone measurement."}
            {status === "insecure" && "Microphone access needs a secure (https) connection."}
          </p>
          {(status === "denied" || status === "error") && (
            <button
              type="button"
              onClick={() => void start()}
              className="nd-gradient mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {running && (
        <>
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-nd-muted">
              Estimated dB
              <button
                type="button"
                aria-label="About these readings"
                onClick={() => setShowInfo((v) => !v)}
                className="nd-hit inline-flex h-5 w-5 items-center justify-center rounded-full text-nd-muted hover:text-nd-text"
              >
                <Info size={13} />
              </button>
            </div>
            <div aria-hidden className="mt-1 flex items-end gap-1 leading-none">
              <span className="text-6xl font-bold tabular-nums text-nd-text sm:text-7xl">{db}</span>
              <span className="mb-2 text-lg font-medium text-nd-muted">dB</span>
            </div>
            <span className="mt-2 rounded-full bg-nd-accent/10 px-3 py-0.5 text-sm font-medium text-nd-accent">
              {label}
            </span>
          </div>

          {showInfo && (
            <p className="mt-3 rounded-lg bg-nd-surface-2 px-3 py-2 text-center text-[11px] text-nd-muted">
              Browser microphones are not calibrated sound-level meters. Readings are
              approximate and vary by device.
            </p>
          )}

          {/* level bar */}
          <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-nd-surface-2">
            <div
              className="nd-gradient h-full rounded-full transition-[width] duration-150"
              style={{ width: `${clamp((db / CHART_MAX_DB) * 100, 0, 100)}%` }}
            />
          </div>

          {/* stat cards */}
          <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
            {[
              ["Min", stat(stats.min)],
              ["Avg", stat(stats.avg)],
              ["Max", stat(stats.max)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-nd-border bg-nd-surface-2/50 py-2.5">
                <div className="text-[11px] uppercase tracking-wide text-nd-muted">{k}</div>
                <div className="text-xl font-bold tabular-nums text-nd-text">{v}</div>
              </div>
            ))}
          </div>

          {/* history chart (~40s) */}
          <div className="mt-4">
            <canvas ref={canvasRef} className="h-24 w-full" aria-hidden />
            <div className="mt-1 text-right text-[10px] text-nd-muted">last {HISTORY_SECONDS}s</div>
          </div>

          {/* calibration */}
          <div className="mt-4 rounded-xl border border-nd-border bg-nd-surface-2/40 p-3">
            <label htmlFor="nd-calib" className="flex items-center justify-between text-xs text-nd-muted">
              <span>Calibration adjustment</span>
              <span className="tabular-nums text-nd-text">
                {calibration > 0 ? `+${calibration}` : calibration} dB
              </span>
            </label>
            <input
              id="nd-calib"
              type="range"
              min={CALIBRATION_MIN}
              max={CALIBRATION_MAX}
              step={1}
              value={calibration}
              onChange={(e) => onCalibration(Number(e.target.value))}
              className="mt-2 w-full accent-nd-accent"
            />
            <p className="mt-1 text-[10px] text-nd-muted">
              Compare with a known meter and nudge to match. Optional — default is 0.
            </p>
          </div>

          {/* controls */}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onStop}
              className="nd-hit flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-nd-border py-2.5 text-sm font-medium text-nd-text transition-colors hover:bg-white/5"
            >
              <Square size={15} /> Stop
            </button>
            <button
              type="button"
              onClick={reset}
              className="nd-hit flex items-center justify-center gap-1.5 rounded-xl border border-nd-border px-4 py-2.5 text-sm text-nd-text transition-colors hover:bg-white/5"
            >
              <RotateCcw size={15} /> Reset
            </button>
          </div>

          <p className="mt-4 text-center text-[11px] text-nd-muted">
            Audio stays on your device. NoteDrift does not upload or save microphone audio.
          </p>
        </>
      )}
    </div>
  );
}
