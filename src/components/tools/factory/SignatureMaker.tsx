"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eraser, Undo2 } from "lucide-react";
import { downloadBlob } from "@/lib/export/download";

// Draw a signature with mouse / finger / stylus and export a TRANSPARENT PNG.
// Strokes are kept as point lists so Undo and crisp re-draw (and a clean
// transparent export) are trivial. Everything is local — nothing is uploaded.

type Point = { x: number; y: number };
type Stroke = { width: number; points: Point[] };

const INK = "#111827";
const HEIGHT = 200;

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const p = stroke.points;
  if (p.length === 0) return;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (p.length === 1) {
    ctx.beginPath();
    ctx.arc(p[0].x, p[0].y, stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0].x, p[0].y);
  for (let i = 1; i < p.length - 1; i++) {
    const mid = { x: (p[i].x + p[i + 1].x) / 2, y: (p[i].y + p[i + 1].y) / 2 };
    ctx.quadraticCurveTo(p[i].x, p[i].y, mid.x, mid.y);
  }
  ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
  ctx.stroke();
}

export function SignatureMaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const dprRef = useRef(1);
  const [penWidth, setPenWidth] = useState(3);
  const [isEmpty, setIsEmpty] = useState(true);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    for (const s of strokesRef.current) drawStroke(ctx, s);
  }, []);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    dprRef.current = dpr;
    const cssWidth = canvas.clientWidth || 300;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    redraw();
  }, [redraw]);

  useEffect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  const pointFrom = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    currentRef.current = { width: penWidth, points: [pointFrom(e)] };
    strokesRef.current.push(currentRef.current);
    setIsEmpty(false);
    redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!currentRef.current) return;
    e.preventDefault();
    currentRef.current.points.push(pointFrom(e));
    redraw();
  };
  const onUp = (e: React.PointerEvent) => {
    if (!currentRef.current) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    currentRef.current = null;
  };

  const undo = () => {
    strokesRef.current.pop();
    setIsEmpty(strokesRef.current.length === 0);
    redraw();
  };
  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    setIsEmpty(true);
    redraw();
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return;
    // Export from an offscreen canvas that has NO background → transparent PNG.
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const dpr = dprRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const s of strokesRef.current) drawStroke(ctx, s);
    out.toBlob((blob) => blob && downloadBlob(blob, "signature.png"), "image/png");
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        style={{ height: HEIGHT, touchAction: "none" }}
        className="w-full cursor-crosshair rounded-xl border border-nd-border bg-white"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label="Signature drawing area"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-nd-muted">
          Pen
          <input
            type="range"
            min={1}
            max={8}
            value={penWidth}
            onChange={(e) => setPenWidth(Number(e.target.value))}
            className="accent-nd-accent"
            aria-label="Pen thickness"
          />
        </label>
        <button
          type="button"
          onClick={undo}
          disabled={isEmpty}
          className="nd-hit flex items-center gap-1.5 rounded-lg border border-nd-border px-3 py-1.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:opacity-40"
        >
          <Undo2 size={15} /> Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          className="nd-hit flex items-center gap-1.5 rounded-lg border border-nd-border px-3 py-1.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text disabled:opacity-40"
        >
          <Eraser size={15} /> Clear
        </button>
        <button
          type="button"
          onClick={download}
          disabled={isEmpty}
          className="nd-gradient ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Download size={16} /> Download PNG
        </button>
      </div>
    </div>
  );
}
