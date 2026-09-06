"use client";

import { useCallback, useRef, useState } from "react";
import { Download, ImageUp } from "lucide-react";
import { downloadBlob } from "@/lib/export/download";

// Interactive image cropper. The original image is loaded into an <img> and
// cropped on a canvas at full resolution — nothing is uploaded. A crop rectangle
// (move + corner-resize) sits over a fit-to-width preview; ratio presets constrain
// it. Output keeps the source's real pixel dimensions.

type Rect = { x: number; y: number; w: number; h: number };
type Mode = "move" | "nw" | "ne" | "sw" | "se";

const RATIOS = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
] as const;

const HANDLE = 14; // px hit area
const MIN = 24;

export function CropImage() {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [ratio, setRatio] = useState<number | null>(null);
  const [fileName, setFileName] = useState("image");
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Mode; startX: number; startY: number; start: Rect } | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name.replace(/\.[^.]+$/, "") || "image");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const maxW = wrapRef.current?.clientWidth ?? 560;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const dw = Math.round(img.naturalWidth * scale);
      const dh = Math.round(img.naturalHeight * scale);
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setDisp({ w: dw, h: dh });
      // Default crop = centered 80%.
      const cw = Math.round(dw * 0.8);
      const ch = Math.round(dh * 0.8);
      setCrop({ x: Math.round((dw - cw) / 2), y: Math.round((dh - ch) / 2), w: cw, h: ch });
      setSrc(url);
    };
    img.src = url;
  };

  const applyRatio = useCallback(
    (r: number | null) => {
      setRatio(r);
      if (r == null) return;
      setCrop((c) => {
        let w = c.w;
        let h = w / r;
        if (h > disp.h) {
          h = disp.h;
          w = h * r;
        }
        const x = Math.min(c.x, disp.w - w);
        const y = Math.min(c.y, disp.h - h);
        return { x: Math.max(0, x), y: Math.max(0, y), w, h };
      });
    },
    [disp],
  );

  const pointerPos = (e: React.PointerEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitHandle = (px: number, py: number): Mode => {
    const near = (hx: number, hy: number) => Math.abs(px - hx) < HANDLE && Math.abs(py - hy) < HANDLE;
    if (near(crop.x, crop.y)) return "nw";
    if (near(crop.x + crop.w, crop.y)) return "ne";
    if (near(crop.x, crop.y + crop.h)) return "sw";
    if (near(crop.x + crop.w, crop.y + crop.h)) return "se";
    return "move";
  };

  const onDown = (e: React.PointerEvent) => {
    if (!src) return;
    e.preventDefault();
    const { x, y } = pointerPos(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: hitHandle(x, y), startX: x, startY: y, start: { ...crop } };
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { x, y } = pointerPos(e);
    const dx = x - drag.current.startX;
    const dy = y - drag.current.startY;
    const s = drag.current.start;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    setCrop(() => {
      if (drag.current!.mode === "move") {
        return {
          ...s,
          x: clamp(s.x + dx, 0, disp.w - s.w),
          y: clamp(s.y + dy, 0, disp.h - s.h),
        };
      }
      let { x: nx, y: ny, w: nw, h: nh } = s;
      const right = s.x + s.w;
      const bottom = s.y + s.h;
      if (drag.current!.mode === "se") {
        nw = clamp(s.w + dx, MIN, disp.w - s.x);
        nh = ratio ? nw / ratio : clamp(s.h + dy, MIN, disp.h - s.y);
        if (ratio && s.y + nh > disp.h) { nh = disp.h - s.y; nw = nh * ratio; }
      } else if (drag.current!.mode === "sw") {
        nw = clamp(s.w - dx, MIN, right);
        nx = right - nw;
        nh = ratio ? nw / ratio : clamp(s.h + dy, MIN, disp.h - s.y);
        if (ratio && s.y + nh > disp.h) { nh = disp.h - s.y; nw = nh * ratio; nx = right - nw; }
      } else if (drag.current!.mode === "ne") {
        nw = clamp(s.w + dx, MIN, disp.w - s.x);
        nh = ratio ? nw / ratio : clamp(s.h - dy, MIN, bottom);
        ny = bottom - nh;
        if (ratio && ny < 0) { ny = 0; nh = bottom; nw = nh * ratio; }
      } else { // nw
        nw = clamp(s.w - dx, MIN, right);
        nx = right - nw;
        nh = ratio ? nw / ratio : clamp(s.h - dy, MIN, bottom);
        ny = bottom - nh;
        if (ratio && ny < 0) { ny = 0; nh = bottom; nw = nh * ratio; nx = right - nw; }
      }
      return { x: nx, y: ny, w: nw, h: nh };
    });
  };

  const onUp = () => {
    drag.current = null;
  };

  const download = () => {
    if (!src) return;
    const scale = natural.w / disp.w;
    const sx = Math.round(crop.x * scale);
    const sy = Math.round(crop.y * scale);
    const sw = Math.max(1, Math.round(crop.w * scale));
    const sh = Math.max(1, Math.round(crop.h * scale));
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      out.toBlob((blob) => blob && downloadBlob(blob, `${fileName}-cropped.png`), "image/png");
    };
    img.src = src;
  };

  if (!src) {
    return (
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-nd-border bg-nd-surface/40 px-6 py-14 text-center transition-colors hover:border-nd-accent/50 hover:bg-nd-surface">
        <ImageUp size={26} className="text-nd-muted" />
        <span className="text-sm font-medium text-nd-text">Choose an image to crop</span>
        <span className="text-xs text-nd-muted">JPG, PNG or WebP — stays on your device</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
      </label>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-nd-muted">Ratio</span>
        {RATIOS.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => applyRatio(r.value)}
            aria-pressed={ratio === r.value}
            className={[
              "rounded-lg border px-2.5 py-1 text-xs transition-colors",
              ratio === r.value
                ? "border-nd-accent bg-nd-accent/10 text-nd-text"
                : "border-nd-border text-nd-muted hover:bg-white/5 hover:text-nd-text",
            ].join(" ")}
          >
            {r.label}
          </button>
        ))}
        <label className="nd-hit ml-auto cursor-pointer rounded-lg border border-nd-border px-2.5 py-1 text-xs text-nd-muted hover:text-nd-text">
          Change image
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFile} />
        </label>
      </div>

      <div className="flex justify-center overflow-hidden rounded-xl border border-nd-border bg-[#0e0f15] p-2">
        <div
          ref={wrapRef}
          className="relative select-none"
          style={{ width: disp.w, height: disp.h, touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="To crop" width={disp.w} height={disp.h} className="block" draggable={false} />
          <div className="pointer-events-none absolute inset-0 bg-black/50" />
          <div
            className="absolute cursor-move border-2 border-nd-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
            style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="absolute max-w-none"
              style={{ left: -crop.x, top: -crop.y, width: disp.w, height: disp.h }}
              draggable={false}
            />
            {(["nw", "ne", "sw", "se"] as const).map((h) => (
              <span
                key={h}
                className="absolute h-3 w-3 rounded-full border border-white bg-nd-accent"
                style={{
                  left: h.includes("w") ? -6 : undefined,
                  right: h.includes("e") ? -6 : undefined,
                  top: h.includes("n") ? -6 : undefined,
                  bottom: h.includes("s") ? -6 : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={download}
        className="nd-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        <Download size={16} /> Download cropped PNG
      </button>
    </div>
  );
}
