"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { ArrowHead, DashStyle } from "@/lib/types";

/* -------------------------------- dash ----------------------------------- */

const DASH_OPTS: { key: DashStyle; dash: string }[] = [
  { key: "solid", dash: "" },
  { key: "dashed", dash: "5 4" },
  { key: "dotted", dash: "1.5 3" },
];

export function DashPicker({
  value,
  onChange,
}: {
  value: DashStyle;
  onChange: (v: DashStyle) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {DASH_OPTS.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            title={o.key}
            aria-label={o.key}
            aria-pressed={active}
            onClick={() => onChange(o.key)}
            className={[
              "flex h-7 w-9 items-center justify-center rounded-md transition-colors",
              active ? "bg-nd-accent/15 ring-1 ring-nd-accent/40" : "hover:bg-white/5",
            ].join(" ")}
          >
            <svg width="24" height="8" aria-hidden="true">
              <line
                x1="1"
                y1="4"
                x2="23"
                y2="4"
                stroke={active ? "#fff" : "#8b90a1"}
                strokeWidth="2"
                strokeDasharray={o.dash}
                strokeLinecap="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ arrowheads ------------------------------- */

const HEADS: ArrowHead[] = ["none", "open", "triangle", "filled"];

/** A tiny line ending in the given head, mirrored for a start head. */
function HeadGlyph({ style, flip, color }: { style: ArrowHead; flip?: boolean; color: string }) {
  const tip = flip ? 3 : 25;
  const back = flip ? 12 : 16;
  const lineFrom = flip ? 12 : 3;
  const lineTo = flip ? 25 : 16;
  return (
    <svg width="28" height="14" aria-hidden="true">
      <line x1={lineFrom} y1="7" x2={lineTo} y2="7" stroke={color} strokeWidth="1.6" />
      {style === "open" && (
        <polyline
          points={`${back},3 ${tip},7 ${back},11`}
          fill="none"
          stroke={color}
          strokeWidth="1.6"
        />
      )}
      {(style === "triangle" || style === "filled") && (
        <polygon
          points={`${tip},7 ${back},3 ${back},11`}
          fill={style === "filled" ? color : "none"}
          stroke={color}
          strokeWidth="1.4"
        />
      )}
    </svg>
  );
}

export function ArrowheadControl({
  start,
  end,
  onChange,
}: {
  start: ArrowHead;
  end: ArrowHead;
  onChange: (patch: { startHead?: ArrowHead; endHead?: ArrowHead }) => void;
}) {
  const [open, setOpen] = useState(false);
  const row = (label: string, current: ArrowHead, key: "startHead" | "endHead", flip: boolean) => (
    <div className="flex items-center gap-1.5">
      <span className="w-9 text-[10px] uppercase tracking-wide text-nd-muted">{label}</span>
      {HEADS.map((h) => {
        const active = current === h;
        return (
          <button
            key={h}
            type="button"
            title={h}
            aria-label={`${label} ${h}`}
            aria-pressed={active}
            onClick={() => onChange({ [key]: h })}
            className={[
              "flex h-7 w-8 items-center justify-center rounded-md transition-colors",
              active ? "bg-nd-accent/15 ring-1 ring-nd-accent/40" : "hover:bg-white/5",
            ].join(" ")}
          >
            <HeadGlyph style={h} flip={flip} color={active ? "#fff" : "#8b90a1"} />
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="relative">
      <button
        type="button"
        title="Arrowheads"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center rounded-lg px-2 text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <HeadGlyph style={start} flip color="currentColor" />
        <HeadGlyph style={end} color="currentColor" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 flex flex-col gap-1.5 rounded-xl border border-nd-border bg-nd-surface p-2 shadow-2xl">
            {row("Start", start, "startHead", true)}
            {row("End", end, "endHead", false)}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------- stepper -------------------------------- */

export function Stepper({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(clamp(value - step))}
        className="flex h-7 w-7 items-center justify-center rounded-md text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <Minus size={14} />
      </button>
      <span className="w-8 text-center text-xs tabular-nums text-nd-text">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(clamp(value + step))}
        className="flex h-7 w-7 items-center justify-center rounded-md text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
