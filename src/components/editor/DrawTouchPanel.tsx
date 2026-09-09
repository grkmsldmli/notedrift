"use client";

// Touch-first QUICK settings for the drawing instruments (Pen / Pencil / Marker /
// Highlighter / Brush / Technical). Optimized for fingers on iPhone/iPad: big
// colour swatches and width/opacity PRESETS you tap once — no dragging tiny
// desktop sliders — with the precise controls tucked behind "Advanced". Compact
// (never a full-width desktop bar) so it doesn't cover the canvas. Every write goes
// through the same onSetDrawPref the desktop bar uses, so each instrument keeps its
// own persisted colour/width/opacity/stabilization/pressure. Serialization is
// untouched.

import { useState } from "react";
import { ChevronDown, ChevronUp, PenTool } from "lucide-react";
import { PALETTE } from "@/lib/constants";
import type { BrushMaterial } from "@/lib/brush/materials";
import type { DrawToolPrefs, DrawTool, PenStabilization } from "@/lib/types";
import { Segmented } from "../ui/controls";
import { ColorPopover } from "../ui/ColorPopover";
import { OpacityControl, WidthControl } from "../ui/BrushControls";

const STABILIZE: { value: string; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

const OPACITY_PRESETS = [1, 0.6, 0.3];

/** Practical width presets for THIS instrument, scaled from its default width so a
 *  Pen (4) and a Highlighter (24) each get a sensible set. Deduped, clamped. */
function widthPresetsFor(mat: BrushMaterial): number[] {
  const base = mat.defaults.width;
  const raw = [base * 0.5, base, base * 2, base * 3.5].map((w) =>
    Math.min(48, Math.max(1, Math.round(w))),
  );
  return [...new Set(raw)];
}

export function DrawTouchPanel({
  draw,
  mat,
  prefs,
  onSetDrawPref,
  onCollapse,
}: {
  draw: DrawTool;
  mat: BrushMaterial;
  prefs: DrawToolPrefs;
  onSetDrawPref: (patch: Partial<DrawToolPrefs>, commit?: boolean) => void;
  onCollapse: () => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const widths = widthPresetsFor(mat);
  const swatchActive = PALETTE.some((s) => s.value.toLowerCase() === prefs.color.toLowerCase());

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-20 w-[min(22rem,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl border border-nd-border bg-nd-surface/95 p-3 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-nd-text">{mat.label}</span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse settings"
          title="Collapse"
          className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          <ChevronUp size={16} />
        </button>
      </div>

      {/* QUICK — colour swatches + a custom-colour (full picker) button */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PALETTE.map((s) => {
          const active = s.value.toLowerCase() === prefs.color.toLowerCase();
          return (
            <button
              key={s.value}
              type="button"
              title={s.name}
              aria-label={s.name}
              aria-pressed={active}
              onClick={() => onSetDrawPref({ color: s.value }, true)}
              className={`nd-hit flex h-9 w-9 items-center justify-center rounded-full transition-transform ${
                active ? "ring-2 ring-nd-accent ring-offset-2 ring-offset-nd-surface" : ""
              }`}
            >
              <span
                className="h-6 w-6 rounded-full border border-white/25"
                style={{ background: s.value }}
              />
            </button>
          );
        })}
        {/* Current/custom colour — opens the full picker. Shows a ring when the
            active colour isn't one of the presets. */}
        <div
          className={`rounded-full ${
            !swatchActive ? "ring-2 ring-nd-accent ring-offset-2 ring-offset-nd-surface" : ""
          }`}
        >
          <ColorPopover
            value={prefs.color}
            onChange={(c, commit) => onSetDrawPref({ color: c }, commit)}
          />
        </div>
      </div>

      {/* QUICK — width presets */}
      <div className="mt-3">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-nd-muted">
          Width
        </div>
        <div className="flex items-center gap-1.5">
          {widths.map((w) => {
            const active = prefs.width === w;
            return (
              <button
                key={w}
                type="button"
                aria-pressed={active}
                onClick={() => onSetDrawPref({ width: w }, true)}
                className={`nd-hit flex h-11 flex-1 items-center justify-center rounded-xl border transition-colors ${
                  active
                    ? "border-nd-accent/50 bg-nd-accent/[0.10] text-nd-accent"
                    : "border-nd-border text-nd-text hover:bg-white/5"
                }`}
              >
                <span
                  className="rounded-full bg-current"
                  style={{ width: Math.min(22, Math.max(3, w)), height: Math.min(22, Math.max(3, w)) }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* QUICK — opacity presets (only where the material supports opacity) */}
      {mat.showOpacity && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-nd-muted">
            Opacity
          </div>
          <div className="flex items-center gap-1.5">
            {OPACITY_PRESETS.map((o) => {
              const active = Math.round(prefs.opacity * 100) === Math.round(o * 100);
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSetDrawPref({ opacity: o }, true)}
                  className={`nd-hit h-11 flex-1 rounded-xl border text-sm font-medium tabular-nums transition-colors ${
                    active
                      ? "border-nd-accent/50 bg-nd-accent/[0.10] text-nd-accent"
                      : "border-nd-border text-nd-text hover:bg-white/5"
                  }`}
                >
                  {Math.round(o * 100)}%
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ADVANCED — precise controls, hidden by default so the panel stays small */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        aria-expanded={advanced}
        className="nd-hit mt-3 flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-sm text-nd-muted transition-colors hover:text-nd-text"
      >
        <span>Advanced</span>
        {advanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {advanced && (
        <div className="mt-1 flex flex-col gap-2 border-t border-nd-border pt-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-nd-muted">Width</span>
            <WidthControl
              value={prefs.width}
              onChange={(w, commit) => onSetDrawPref({ width: w }, commit)}
            />
          </div>
          {mat.showOpacity && (
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-nd-muted">Opacity</span>
              <OpacityControl
                value={prefs.opacity}
                onChange={(o, commit) => onSetDrawPref({ opacity: o }, commit)}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-nd-muted">Smooth</span>
            <Segmented
              options={STABILIZE}
              value={prefs.stabilization}
              onChange={(v) => onSetDrawPref({ stabilization: v as PenStabilization })}
            />
          </div>
          {mat.variableWidth && (
            <button
              type="button"
              aria-pressed={prefs.pressure}
              onClick={() => onSetDrawPref({ pressure: !prefs.pressure })}
              className={`nd-hit flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors ${
                prefs.pressure
                  ? "bg-nd-accent/15 text-nd-text ring-1 ring-nd-accent/40"
                  : "text-nd-muted hover:bg-white/5 hover:text-nd-text"
              }`}
            >
              <PenTool size={15} />
              {draw === "brush" ? "Velocity dynamics" : "Pressure (stylus)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
