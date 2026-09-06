"use client";

// Compact custom export-size sheet (Pro). Presets (Original / 2× / 4×) plus exact
// width×height with an aspect-ratio lock, and a transparent-background option.
// Safe bounds come from the pure export math; the actual render + download is the
// caller's job. Modal, viewport-safe on phones (max-height + scroll).

import { useEffect, useMemo, useState } from "react";
import { Link2, Link2Off, X } from "lucide-react";
import { MAX_EXPORT_EDGE, clampDimension, pairedDimension } from "@/lib/export/scale";

export function CustomSizeDialog({
  content,
  onExport,
  onClose,
}: {
  content: { width: number; height: number };
  onExport: (width: number, height: number, transparent: boolean) => void;
  onClose: () => void;
}) {
  const [width, setWidth] = useState(content.width);
  const [height, setHeight] = useState(content.height);
  const [lock, setLock] = useState(true);
  const [transparent, setTransparent] = useState(false);
  const titleId = "nd-customsize-title";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preset = (mult: number) => {
    setWidth(clampDimension(content.width * mult));
    setHeight(clampDimension(content.height * mult));
  };

  const editWidth = (v: number) => {
    setWidth(clampDimension(v));
    if (lock) setHeight(pairedDimension("width", v, content.width, content.height));
  };
  const editHeight = (v: number) => {
    setHeight(clampDimension(v));
    if (lock) setWidth(pairedDimension("height", v, content.width, content.height));
  };

  const presets = useMemo(() => [
    { label: "Original", mult: 1 },
    { label: "2×", mult: 2 },
    { label: "4×", mult: 4 },
  ], []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-nd-border bg-nd-surface p-5 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="nd-hit absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text">
          <X size={16} />
        </button>
        <h2 id={titleId} className="text-base font-semibold text-nd-text">Custom export size</h2>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => preset(p.mult)}
              className="rounded-lg border border-nd-border py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1 text-xs text-nd-muted">
            Width
            <input
              type="number"
              min={1}
              max={MAX_EXPORT_EDGE}
              value={width}
              onChange={(e) => editWidth(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-nd-border bg-nd-bg-2 px-2.5 py-2 text-sm text-nd-text outline-none focus:ring-2 focus:ring-nd-accent/50"
            />
          </label>
          <button
            type="button"
            aria-pressed={lock}
            aria-label={lock ? "Aspect ratio locked" : "Aspect ratio unlocked"}
            title={lock ? "Aspect ratio locked" : "Aspect ratio unlocked"}
            onClick={() => setLock((l) => !l)}
            className={`nd-hit mb-1 flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${lock ? "border-nd-accent text-nd-accent" : "border-nd-border text-nd-muted hover:bg-white/5"}`}
          >
            {lock ? <Link2 size={16} /> : <Link2Off size={16} />}
          </button>
          <label className="flex-1 text-xs text-nd-muted">
            Height
            <input
              type="number"
              min={1}
              max={MAX_EXPORT_EDGE}
              value={height}
              onChange={(e) => editHeight(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-nd-border bg-nd-bg-2 px-2.5 py-2 text-sm text-nd-text outline-none focus:ring-2 focus:ring-nd-accent/50"
            />
          </label>
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-nd-text">
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} className="h-4 w-4 accent-nd-accent" />
          Transparent background
        </label>

        <button
          type="button"
          onClick={() => onExport(clampDimension(width), clampDimension(height), transparent)}
          className="nd-gradient mt-4 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Export PNG · {clampDimension(width)}×{clampDimension(height)}
        </button>
      </div>
    </div>
  );
}
