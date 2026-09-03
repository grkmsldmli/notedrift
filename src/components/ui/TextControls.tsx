"use client";

import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListChecks,
  Minus,
  Plus,
  Underline,
} from "lucide-react";
import { FONT_OPTIONS, FONT_STACKS, type FontFamilyKey } from "@/lib/fonts";
import { FONT_SIZES, LINE_HEIGHTS } from "@/lib/constants";
import type { SelectionInfo, StylePatch } from "@/lib/types";

const iconBtn =
  "flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text";

const toggle = (active: boolean) =>
  [
    iconBtn,
    active ? "bg-nd-accent/15 !text-white ring-1 ring-nd-accent/40" : "",
  ].join(" ");

function nearestFontIndex(size: number): number {
  let best = 0;
  let bestD = Infinity;
  FONT_SIZES.forEach((s, i) => {
    const d = Math.abs(s - size);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function lhKey(value: number | undefined): string {
  if (value === undefined) return "normal";
  let best = LINE_HEIGHTS[1].key;
  let bestD = Infinity;
  for (const p of LINE_HEIGHTS) {
    const d = Math.abs(p.value - value);
    if (d < bestD) {
      bestD = d;
      best = p.key;
    }
  }
  return best;
}

const secLabel = "px-0.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-nd-muted";

/** Compact font-family picker (shows "Aa" in the current face) — used in the
 *  tool-options bar to set the default font for new text. */
export function FontPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (key: FontFamilyKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = (value as FontFamilyKey) ?? "sans";
  return (
    <div className="relative">
      <button
        type="button"
        className={[iconBtn, open ? "bg-white/10 text-nd-text" : ""].join(" ")}
        title="Font"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[15px] leading-none" style={{ fontFamily: FONT_STACKS[current] }}>
          Aa
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-lg border border-nd-border bg-nd-surface p-1 shadow-2xl">
            {FONT_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => {
                  onChange(o.key);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[15px] transition-colors",
                  current === o.key ? "bg-nd-accent/15 text-nd-text" : "text-nd-text hover:bg-white/5",
                ].join(" ")}
                style={{ fontFamily: FONT_STACKS[o.key] }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The whole-object text formatting panel behind a single "Aa" button — font,
 * size, bold/italic/underline, alignment, line spacing, and bullet/checklist.
 * One button keeps the contextual toolbar calm (progressive disclosure).
 */
export function TextFormatButton({
  selection,
  onStyle,
}: {
  selection: SelectionInfo;
  onStyle: (patch: StylePatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const fam = (selection.fontFamily as FontFamilyKey) ?? "sans";
  const fontIdx = nearestFontIndex(selection.fontSize ?? 24);
  const lh = lhKey(selection.lineHeight);
  const list = selection.listStyle ?? "none";

  return (
    <div className="relative">
      <button
        type="button"
        className={[iconBtn, open ? "bg-white/10 text-nd-text" : ""].join(" ")}
        title="Text formatting"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[15px] leading-none" style={{ fontFamily: FONT_STACKS[fam] }}>
          Aa
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-xl border border-nd-border bg-nd-surface p-2.5 shadow-2xl">
            {/* Font family */}
            <div className={secLabel}>Font</div>
            <div className="grid grid-cols-2 gap-1">
              {FONT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => onStyle({ fontFamily: FONT_STACKS[o.key] })}
                  className={[
                    "flex items-center justify-center rounded-md py-1.5 text-[15px] transition-colors",
                    fam === o.key
                      ? "bg-nd-accent/15 text-nd-text ring-1 ring-nd-accent/40"
                      : "text-nd-text hover:bg-white/5",
                  ].join(" ")}
                  style={{ fontFamily: FONT_STACKS[o.key] }}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* Size + style + align, one compact row each */}
            <div className={`${secLabel} mt-2.5`}>Size</div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={iconBtn}
                title="Smaller"
                onClick={() => onStyle({ fontSize: FONT_SIZES[Math.max(0, fontIdx - 1)] })}
              >
                <Minus size={15} />
              </button>
              <span className="w-8 text-center text-sm tabular-nums text-nd-text">
                {selection.fontSize ?? 24}
              </span>
              <button
                type="button"
                className={iconBtn}
                title="Larger"
                onClick={() =>
                  onStyle({ fontSize: FONT_SIZES[Math.min(FONT_SIZES.length - 1, fontIdx + 1)] })
                }
              >
                <Plus size={15} />
              </button>
              <div className="mx-1 h-5 w-px bg-nd-border" />
              <button
                type="button"
                className={toggle(!!selection.bold)}
                title="Bold"
                onClick={() => onStyle({ bold: !selection.bold })}
              >
                <Bold size={15} />
              </button>
              <button
                type="button"
                className={toggle(!!selection.italic)}
                title="Italic"
                onClick={() => onStyle({ italic: !selection.italic })}
              >
                <Italic size={15} />
              </button>
              <button
                type="button"
                className={toggle(!!selection.underline)}
                title="Underline"
                onClick={() => onStyle({ underline: !selection.underline })}
              >
                <Underline size={15} />
              </button>
            </div>

            {/* Alignment */}
            <div className={`${secLabel} mt-2.5`}>Align</div>
            <div className="flex items-center gap-1">
              {(["left", "center", "right"] as const).map((a) => {
                const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                return (
                  <button
                    key={a}
                    type="button"
                    className={toggle(selection.textAlign === a)}
                    title={`Align ${a}`}
                    onClick={() => onStyle({ textAlign: a })}
                  >
                    <Icon size={15} />
                  </button>
                );
              })}
              <div className="mx-1 h-5 w-px bg-nd-border" />
              <button
                type="button"
                className={toggle(list === "bullet")}
                title="Bullet list"
                onClick={() => onStyle({ listStyle: list === "bullet" ? "none" : "bullet" })}
              >
                <List size={15} />
              </button>
              <button
                type="button"
                className={toggle(list === "check")}
                title="Checklist"
                onClick={() => onStyle({ listStyle: list === "check" ? "none" : "check" })}
              >
                <ListChecks size={15} />
              </button>
            </div>

            {/* Line spacing */}
            <div className={`${secLabel} mt-2.5`}>Line spacing</div>
            <div className="flex items-center gap-1">
              {LINE_HEIGHTS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onStyle({ lineHeight: p.value })}
                  className={[
                    "flex-1 rounded-md py-1.5 text-xs transition-colors",
                    lh === p.key
                      ? "bg-nd-accent/15 text-nd-text ring-1 ring-nd-accent/40"
                      : "text-nd-muted hover:bg-white/5 hover:text-nd-text",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
