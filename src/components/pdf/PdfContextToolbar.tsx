"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Minus,
  Monitor,
  Pipette,
  Plus,
  Trash2,
} from "lucide-react";
import { INK_PALETTE } from "@/lib/colors";
import type { FontFamilyKey, TextAlign } from "@/lib/pdf/overlays";
import type { ToolControls } from "@/lib/pdf/toolState";

export interface ContextValues {
  color: string;
  strokeWidth: number;
  strokeMax?: number; // upper bound for the width stepper (Brush goes higher)
  opacity: number;
  fill: string | null;
  fontFamily: FontFamilyKey;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
}

export interface ContextPatch {
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  fill?: string | null;
  fontFamily?: FontFamilyKey;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
}

export function PdfContextToolbar({
  controls,
  values,
  onChange,
  onDelete,
  onEyedropper,
}: {
  controls: ToolControls;
  values: ContextValues;
  onChange: (patch: ContextPatch) => void;
  onDelete?: () => void;
  onEyedropper?: (target: "color" | "fill") => void;
}) {
  return (
    // Outer shell keeps overflow visible so portaled popovers are never clipped;
    // the inner strip scrolls horizontally with the scrollbar hidden.
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <div className="nd-hidescroll pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-nd-border bg-nd-surface/95 p-1 shadow-xl shadow-black/40 backdrop-blur">
        {(controls.color || controls.highlight) && (
          <ColorControl
            label={controls.highlight ? "Highlight color" : "Color"}
            value={values.color}
            onChange={(c) => onChange({ color: c })}
            onEyedropper={onEyedropper ? () => onEyedropper("color") : undefined}
          />
        )}

        {controls.fill && (
          <FillControl
            value={values.fill}
            onChange={(f) => onChange({ fill: f })}
            onEyedropper={onEyedropper ? () => onEyedropper("fill") : undefined}
          />
        )}

        {controls.strokeWidth && (
          <Stepper
            label="Width"
            value={values.strokeWidth}
            min={1}
            max={values.strokeMax ?? 24}
            step={1}
            onChange={(v) => onChange({ strokeWidth: v })}
          />
        )}

        {controls.text && (
          <>
            <Segmented
              label="Font"
              value={values.fontFamily}
              options={[
                { value: "sans", label: "Sans" },
                { value: "serif", label: "Serif" },
                { value: "mono", label: "Mono" },
              ]}
              onChange={(v) => onChange({ fontFamily: v as FontFamilyKey })}
            />
            <Stepper
              label="Size"
              value={values.fontSize}
              min={8}
              max={96}
              step={1}
              onChange={(v) => onChange({ fontSize: v })}
            />
            <Toggle label="Bold" active={values.bold} onClick={() => onChange({ bold: !values.bold })}>
              <Bold size={15} />
            </Toggle>
            <Toggle label="Italic" active={values.italic} onClick={() => onChange({ italic: !values.italic })}>
              <Italic size={15} />
            </Toggle>
            <AlignControl value={values.align} onChange={(a) => onChange({ align: a })} />
          </>
        )}

        {controls.opacity && (
          <OpacityControl value={values.opacity} onChange={(v) => onChange({ opacity: v })} />
        )}

        {onDelete && (
          <>
            <Divider />
            <button
              type="button"
              aria-label="Delete"
              title="Delete  (Del)"
              onClick={onDelete}
              className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-red-500/15 hover:text-red-400"
            >
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- pieces -------------------------------- */

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-nd-border" />;
}

/** Portaled popover anchored under a trigger — escapes the strip's horizontal
 *  overflow so the swatch grid is never clipped. */
function Popover({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current;
      if (a) {
        const r = a.getBoundingClientRect();
        setPos({ left: r.left + r.width / 2, top: r.bottom + 6 });
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      style={{ position: "fixed", left: pos.left, top: pos.top, transform: "translateX(-50%)", zIndex: 60 }}
      className="rounded-xl border border-nd-border bg-nd-surface p-2 shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}

function EyedropperRow({ onEyedropper }: { onEyedropper?: () => void }) {
  // This popover only renders client-side after a click, so reading window here
  // is safe and needs no effect/state.
  const hasNative = typeof window !== "undefined" && "EyeDropper" in window;
  if (!onEyedropper) return null;
  return (
    <button
      type="button"
      onClick={onEyedropper}
      aria-label="Pick a color from the page"
      title={hasNative ? "Eyedropper — sample from the page or screen" : "Eyedropper — sample from the page"}
      className="nd-hit flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-nd-muted transition-colors hover:border-nd-accent hover:text-nd-text"
    >
      <Pipette size={13} />
      {hasNative ? <Monitor size={11} className="opacity-60" /> : null}
    </button>
  );
}

function SwatchGrid({
  value,
  onPick,
  onEyedropper,
  extra,
}: {
  value: string | null;
  onPick: (c: string) => void;
  onEyedropper?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="w-[176px]">
      <div className="grid grid-cols-6 gap-1.5">
        {INK_PALETTE.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.name}
            aria-label={s.name}
            onClick={() => onPick(s.value)}
            className={`h-6 w-6 rounded-md border ${
              value?.toLowerCase() === s.value.toLowerCase()
                ? "border-nd-accent ring-2 ring-nd-accent/40"
                : "border-white/15"
            }`}
            style={{ backgroundColor: s.value }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-nd-muted">
          Custom
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value ?? "") ? (value as string) : "#000000"}
            onChange={(e) => onPick(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-white/15 bg-transparent"
          />
        </label>
        <EyedropperRow onEyedropper={onEyedropper} />
        {extra}
      </div>
    </div>
  );
}

function ColorControl({
  label,
  value,
  onChange,
  onEyedropper,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
  onEyedropper?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative flex shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
        className="nd-hit flex h-8 items-center gap-1.5 rounded-lg px-2 text-nd-muted transition-colors hover:bg-white/5"
      >
        <span className="h-4 w-4 rounded-full border border-white/25" style={{ backgroundColor: value }} />
      </button>
      <Popover open={open} anchorRef={btnRef} onClose={() => setOpen(false)}>
        <SwatchGrid
          value={value}
          onPick={(c) => { onChange(c); setOpen(false); }}
          onEyedropper={onEyedropper ? () => { setOpen(false); onEyedropper(); } : undefined}
        />
      </Popover>
    </div>
  );
}

function FillControl({
  value,
  onChange,
  onEyedropper,
}: {
  value: string | null;
  onChange: (f: string | null) => void;
  onEyedropper?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative flex shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label="Fill"
        title="Fill"
        onClick={() => setOpen((o) => !o)}
        className="nd-hit flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-nd-muted transition-colors hover:bg-white/5"
      >
        Fill
        <span
          className="h-4 w-4 rounded-sm border border-white/25"
          style={
            value
              ? { backgroundColor: value }
              : { backgroundImage: "linear-gradient(45deg,#888 25%,transparent 25%,transparent 75%,#888 75%),linear-gradient(45deg,#888 25%,transparent 25%,transparent 75%,#888 75%)", backgroundSize: "6px 6px", backgroundPosition: "0 0,3px 3px" }
          }
        />
      </button>
      <Popover open={open} anchorRef={btnRef} onClose={() => setOpen(false)}>
        <SwatchGrid
          value={value}
          onPick={(c) => { onChange(c); setOpen(false); }}
          onEyedropper={onEyedropper ? () => { setOpen(false); onEyedropper(); } : undefined}
          extra={
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={`rounded-md border px-2 py-1 text-[11px] ${
                value === null ? "border-nd-accent text-nd-accent" : "border-white/15 text-nd-muted hover:text-nd-text"
              }`}
            >
              None
            </button>
          }
        />
      </Popover>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label={label} title={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(clamp(value - step))}
        className="nd-hit flex h-8 w-7 items-center justify-center rounded-lg text-nd-muted hover:bg-white/5 hover:text-nd-text"
      >
        <Minus size={14} />
      </button>
      <span
        className="w-7 text-center text-xs tabular-nums text-nd-text"
        role="status"
        aria-live="polite"
        aria-label={`${label} ${Math.round(value)}`}
      >
        {Math.round(value)}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(clamp(value + step))}
        className="nd-hit flex h-8 w-7 items-center justify-center rounded-lg text-nd-muted hover:bg-white/5 hover:text-nd-text"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function OpacityControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 px-1" title="Opacity">
      <span className="text-[11px] text-nd-muted">Opacity</span>
      <input
        type="range"
        min={10}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="nd-range w-16"
        aria-label="Opacity"
      />
    </label>
  );
}

function Toggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`nd-hit flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-nd-accent/20 text-nd-accent" : "text-nd-muted hover:bg-white/5 hover:text-nd-text"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-lg bg-nd-surface-2 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
            value === o.value ? "bg-nd-accent/25 text-nd-accent" : "text-nd-muted hover:text-nd-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AlignControl({ value, onChange }: { value: TextAlign; onChange: (a: TextAlign) => void }) {
  const opts: { value: TextAlign; icon: React.ReactNode; label: string }[] = [
    { value: "left", icon: <AlignLeft size={15} />, label: "Align left" },
    { value: "center", icon: <AlignCenter size={15} />, label: "Align center" },
    { value: "right", icon: <AlignRight size={15} />, label: "Align right" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {opts.map((o) => (
        <Toggle key={o.value} label={o.label} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon}
        </Toggle>
      ))}
    </div>
  );
}
