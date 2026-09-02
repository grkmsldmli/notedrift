"use client";

import { NODE_ACCENT_LIST, NODE_ACCENTS, STROKE_WIDTHS } from "@/lib/constants";

const CHECKER =
  "linear-gradient(45deg,#9aa0ae 25%,transparent 25%,transparent 75%,#9aa0ae 75%)," +
  "linear-gradient(45deg,#9aa0ae 25%,#e5e7eb 25%,#e5e7eb 75%,#9aa0ae 75%)";

interface SwatchRowProps {
  options: { name: string; value: string }[];
  value?: string;
  onChange: (value: string) => void;
}

export function SwatchRow({ options, value, onChange }: SwatchRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        const transparent = o.value === "transparent";
        return (
          <button
            key={o.value}
            type="button"
            title={o.name}
            aria-label={o.name}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={[
              "h-5 w-5 rounded-full border transition",
              active
                ? "ring-2 ring-white/80 ring-offset-2 ring-offset-nd-surface"
                : "border-black/20 hover:scale-110",
            ].join(" ")}
            style={
              transparent
                ? {
                    backgroundImage: CHECKER,
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0,4px 4px",
                  }
                : { backgroundColor: o.value }
            }
          />
        );
      })}
    </div>
  );
}

interface WidthPickerProps {
  value?: number;
  onChange: (width: number) => void;
}

export function WidthPicker({ value, onChange }: WidthPickerProps) {
  const opts: { key: string; w: number }[] = [
    { key: "Thin", w: STROKE_WIDTHS.thin },
    { key: "Medium", w: STROKE_WIDTHS.medium },
    { key: "Thick", w: STROKE_WIDTHS.thick },
  ];
  return (
    <div className="flex items-center gap-1">
      {opts.map((o) => {
        const active = value === o.w;
        return (
          <button
            key={o.key}
            type="button"
            title={o.key}
            aria-label={o.key}
            aria-pressed={active}
            onClick={() => onChange(o.w)}
            className={[
              "flex h-7 w-8 items-center justify-center rounded-md transition-colors",
              active ? "bg-nd-accent/15 ring-1 ring-nd-accent/40" : "hover:bg-white/5",
            ].join(" ")}
          >
            <span
              className="rounded-full"
              style={{
                width: 16,
                height: o.w,
                background: active ? "#fff" : "#8b90a1",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

interface AccentRowProps {
  value?: string;
  onChange: (key: string) => void;
}

/** Soft-accent swatches for mind-map nodes (fill tinted, border from accent). */
export function AccentRow({ value, onChange }: AccentRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      {NODE_ACCENT_LIST.map((a) => {
        const acc = NODE_ACCENTS[a.key];
        const active = value === a.key;
        return (
          <button
            key={a.key}
            type="button"
            title={a.name}
            aria-label={`${a.name} accent`}
            aria-pressed={active}
            onClick={() => onChange(a.key)}
            className={[
              "h-5 w-5 rounded-full border-2 transition",
              active
                ? "ring-2 ring-white/80 ring-offset-2 ring-offset-nd-surface"
                : "hover:scale-110",
            ].join(" ")}
            style={{ backgroundColor: acc.fill, borderColor: acc.border }}
          />
        );
      })}
    </div>
  );
}

interface SegmentedProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

/** Compact segmented control (e.g. stabilization Off/Low/Med/High). */
export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-nd-surface-2 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={[
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-nd-surface text-nd-text shadow-sm ring-1 ring-nd-border"
                : "text-nd-muted hover:text-nd-text",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Divider() {
  return <div className="mx-0.5 h-6 w-px bg-nd-border" />;
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-nd-muted">
      {children}
    </span>
  );
}
