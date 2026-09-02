"use client";

import { useState } from "react";
import { MAX_WIDTH, MIN_WIDTH, WIDTH_PRESETS } from "@/lib/brush/materials";

interface WidthControlProps {
  value: number;
  /** `commit` false = live slider preview; true = committed (preset click or
   *  slider release). */
  onChange: (width: number, commit: boolean) => void;
}

/** Compact stroke-width control: a trigger showing the current size, opening a
 *  popover of quick presets plus a fine slider. */
export function WidthControl({ value, onChange }: WidthControlProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        title="Width"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-lg px-2 text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <span className="flex h-6 w-6 items-center justify-center">
          <span
            className="rounded-full bg-current"
            style={{
              width: Math.min(20, Math.max(2, value)),
              height: Math.min(20, Math.max(2, value)),
            }}
          />
        </span>
        <span className="w-5 text-center text-xs tabular-nums text-nd-text">{value}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border border-nd-border bg-nd-surface p-3 shadow-2xl">
            <div className="flex items-end justify-between gap-1">
              {WIDTH_PRESETS.map((w) => {
                const active = value === w;
                return (
                  <button
                    key={w}
                    type="button"
                    title={`${w} px`}
                    onClick={() => onChange(w, true)}
                    className={[
                      "flex h-9 flex-1 flex-col items-center justify-center gap-1 rounded-md transition-colors",
                      active ? "bg-nd-accent/15 ring-1 ring-nd-accent/40" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: Math.min(16, w),
                        height: Math.min(16, w),
                        background: active ? "var(--nd-accent, #5b8cff)" : "#8b90a1",
                      }}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="range"
                min={MIN_WIDTH}
                max={MAX_WIDTH}
                value={value}
                onChange={(e) => onChange(Number(e.target.value), false)}
                onPointerUp={(e) =>
                  onChange(Number((e.target as HTMLInputElement).value), true)
                }
                onKeyUp={(e) =>
                  onChange(Number((e.target as HTMLInputElement).value), true)
                }
                className="nd-range flex-1"
                aria-label="Fine width"
              />
              <span className="w-6 text-right text-xs tabular-nums text-nd-text">{value}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface OpacityControlProps {
  value: number; // 0–1
  /** `commit` false = live slider preview; true = committed (preset click or
   *  slider release). */
  onChange: (opacity: number, commit: boolean) => void; // 0–1
}

const OPACITY_PRESETS = [0.25, 0.5, 0.75, 1];

/** Compact opacity control (0–100%) with quick presets and a fine slider. */
export function OpacityControl({ value, onChange }: OpacityControlProps) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(value * 100);
  return (
    <div className="relative">
      <button
        type="button"
        title="Opacity"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1 rounded-lg px-2 text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        <span
          className="h-4 w-4 rounded-full border border-black/20"
          style={{
            backgroundImage:
              "linear-gradient(45deg,#9aa0ae 25%,transparent 25%,transparent 75%,#9aa0ae 75%),linear-gradient(45deg,#9aa0ae 25%,#e5e7eb 25%,#e5e7eb 75%,#9aa0ae 75%)",
            backgroundSize: "6px 6px",
            backgroundPosition: "0 0,3px 3px",
            opacity: 0.4 + value * 0.6,
          }}
        />
        <span className="w-8 text-center text-xs tabular-nums text-nd-text">{pct}%</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-52 rounded-xl border border-nd-border bg-nd-surface p-3 shadow-2xl">
            <div className="flex gap-1">
              {OPACITY_PRESETS.map((o) => {
                const active = pct === Math.round(o * 100);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onChange(o, true)}
                    className={[
                      "flex-1 rounded-md py-1 text-xs font-medium transition-colors",
                      active
                        ? "bg-nd-accent/15 text-nd-text ring-1 ring-nd-accent/40"
                        : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
                    ].join(" ")}
                  >
                    {Math.round(o * 100)}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="range"
                min={5}
                max={100}
                value={pct}
                onChange={(e) => onChange(Number(e.target.value) / 100, false)}
                onPointerUp={(e) =>
                  onChange(Number((e.target as HTMLInputElement).value) / 100, true)
                }
                onKeyUp={(e) =>
                  onChange(Number((e.target as HTMLInputElement).value) / 100, true)
                }
                className="nd-range flex-1"
                aria-label="Fine opacity"
              />
              <span className="w-9 text-right text-xs tabular-nums text-nd-text">{pct}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
