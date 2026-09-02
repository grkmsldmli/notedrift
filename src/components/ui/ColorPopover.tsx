"use client";

import { useRef, useState } from "react";
import { Check, Pipette, Plus, Star } from "lucide-react";
import {
  hexToHsv,
  hsvToHex,
  INK_PALETTE,
  isLightColor,
  normalizeHex,
  type HSV,
} from "@/lib/colors";
import {
  loadFavoriteColors,
  loadRecentColors,
  pushRecentColor,
  saveFavoriteColors,
} from "@/lib/storage";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface ColorPopoverProps {
  value: string;
  /** `commit` false = a live drag preview; true = a committed change (records
   *  history / persists). */
  onChange: (hex: string, commit: boolean) => void;
}

/** A single-swatch button that opens a compact color popover: fast palette,
 *  recents, favorites, an HSV picker with HEX entry, and a native eyedropper. */
export function ColorPopover({ value, onChange }: ColorPopoverProps) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  // The last hex WE emitted, so we can tell drag-induced changes (keep the live
  // HSV, no hue jump in the gray column) from genuine external changes (resync).
  const [lastEmitted, setLastEmitted] = useState(value);
  const [recents, setRecents] = useState<string[]>(() => loadRecentColors());
  const [favs, setFavs] = useState<string[]>(() => loadFavoriteColors());
  const [dragging, setDragging] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const svDrag = useRef(false);
  const hueDrag = useRef(false);

  const hasEyedropper =
    typeof window !== "undefined" &&
    "EyeDropper" in window &&
    typeof (window as { EyeDropper?: unknown }).EyeDropper === "function";

  // Resync only when the color changed from outside this control, and never
  // mid-drag: some parents echo `value` back asynchronously (the object toolbar's
  // rAF-scheduled emit), which would otherwise fight the live HSV during a drag.
  if (value !== lastEmitted && !dragging) {
    setLastEmitted(value);
    setHsv(hexToHsv(value));
    setHexText(value);
  }

  const openPopover = () => {
    const next = !open;
    if (next) {
      setRecents(loadRecentColors());
      setFavs(loadFavoriteColors());
    }
    setOpen(next);
  };

  const apply = (hex: string, commit: boolean) => {
    const n = normalizeHex(hex);
    if (!n) return;
    setLastEmitted(n);
    setHsv(hexToHsv(n));
    setHexText(n);
    onChange(n, commit);
    if (commit) setRecents(pushRecentColor(n));
  };

  const applyHsv = (next: HSV, commit: boolean) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setLastEmitted(hex);
    setHexText(hex);
    onChange(hex, commit);
    if (commit) setRecents(pushRecentColor(hex));
  };

  const onSv = (e: React.PointerEvent) => {
    const r = svRef.current?.getBoundingClientRect();
    if (!r) return;
    applyHsv(
      {
        ...hsv,
        s: clamp01((e.clientX - r.left) / r.width),
        v: clamp01(1 - (e.clientY - r.top) / r.height),
      },
      false,
    );
  };
  const onHue = (e: React.PointerEvent) => {
    const r = hueRef.current?.getBoundingClientRect();
    if (!r) return;
    applyHsv({ ...hsv, h: clamp01((e.clientX - r.left) / r.width) * 360 }, false);
  };

  // On drag release, re-emit the current color as a committed change (records
  // one history entry) and store it in recents.
  const commitCurrent = () => applyHsv(hsv, true);

  const eyedrop = async () => {
    try {
      const EyeDropperCtor = (
        window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }
      ).EyeDropper;
      const res = await new EyeDropperCtor().open();
      apply(res.sRGBHex, true);
    } catch {
      /* user cancelled or unavailable — no-op */
    }
  };

  const currentNorm = normalizeHex(value) ?? "#000000";
  const isFav = favs.includes(currentNorm);
  const toggleFav = () => {
    const next = isFav
      ? favs.filter((c) => c !== currentNorm)
      : [currentNorm, ...favs.filter((c) => c !== currentNorm)].slice(0, 12);
    saveFavoriteColors(next);
    setFavs(next);
  };

  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="relative">
      <button
        type="button"
        title="Color"
        aria-label="Color"
        onClick={openPopover}
        className="h-6 w-6 rounded-full border border-black/25 shadow-inner ring-1 ring-white/10 transition hover:scale-110"
        style={{ backgroundColor: value }}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-nd-border bg-nd-surface p-3 shadow-2xl">
            {/* Fast palette */}
            <div className="grid grid-cols-6 gap-1.5">
              {INK_PALETTE.map((c) => {
                const active = currentNorm === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    onClick={() => apply(c.value, true)}
                    className={[
                      "flex h-7 w-full items-center justify-center rounded-md border transition",
                      active ? "ring-2 ring-nd-accent" : "border-black/15 hover:scale-105",
                    ].join(" ")}
                    style={{ backgroundColor: c.value }}
                  >
                    {active && (
                      <Check
                        size={13}
                        color={isLightColor(c.value) ? "#111827" : "#ffffff"}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* SV square */}
            <div
              ref={svRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                svDrag.current = true;
                setDragging(true);
                onSv(e);
              }}
              onPointerMove={(e) => svDrag.current && onSv(e)}
              onPointerUp={() => {
                svDrag.current = false;
                setDragging(false);
                commitCurrent();
              }}
              className="relative mt-3 h-28 w-full cursor-crosshair rounded-lg"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueHex}`,
              }}
            >
              <span
                className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
              />
            </div>

            {/* Hue slider */}
            <div
              ref={hueRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                hueDrag.current = true;
                setDragging(true);
                onHue(e);
              }}
              onPointerMove={(e) => hueDrag.current && onHue(e)}
              onPointerUp={() => {
                hueDrag.current = false;
                setDragging(false);
                commitCurrent();
              }}
              className="relative mt-2 h-3.5 w-full cursor-pointer rounded-full"
              style={{
                background:
                  "linear-gradient(to right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)",
              }}
            >
              <span
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueHex }}
              />
            </div>

            {/* HEX + eyedropper + favorite */}
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-xs text-nd-muted">#</span>
              <input
                value={hexText.replace(/^#/, "")}
                onChange={(e) => setHexText(e.target.value)}
                onBlur={() => apply(hexText, true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") apply(hexText, true);
                }}
                spellCheck={false}
                maxLength={7}
                className="w-20 rounded-md bg-nd-surface-2 px-2 py-1 font-mono text-xs uppercase text-nd-text outline-none ring-1 ring-nd-border focus:ring-nd-accent/60"
                aria-label="Hex color"
              />
              <div className="flex-1" />
              <button
                type="button"
                title={isFav ? "Remove favorite" : "Add favorite"}
                aria-pressed={isFav}
                onClick={toggleFav}
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  isFav
                    ? "text-amber-400 hover:bg-white/5"
                    : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
                ].join(" ")}
              >
                <Star size={15} fill={isFav ? "currentColor" : "none"} />
              </button>
              {hasEyedropper && (
                <button
                  type="button"
                  title="Pick color from canvas"
                  onClick={eyedrop}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
                >
                  <Pipette size={15} />
                </button>
              )}
            </div>

            {/* Recents */}
            {recents.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-nd-muted">
                  Recent
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recents.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => apply(c, true)}
                      className="h-5 w-5 rounded-md border border-black/15 transition hover:scale-110"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Favorites */}
            {favs.length > 0 && (
              <div className="mt-2.5">
                <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-nd-muted">
                  <Star size={9} /> Favorites
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {favs.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => apply(c, true)}
                      className="h-5 w-5 rounded-md border border-black/15 transition hover:scale-110"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            )}

            {favs.length === 0 && (
              <div className="mt-2.5 flex items-center gap-1 text-[10px] text-nd-faint">
                <Plus size={10} /> Tap the star to save a favorite
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
