"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type, Upload, X } from "lucide-react";
import { loadImageFromDataUrl, loadImageFromFile, type LoadedImage } from "@/lib/pdf/imageInput";

type Mode = "draw" | "type" | "upload";
const TYPE_FONTS = [
  { key: "hand", label: "Handwritten", css: '"Patrick Hand", cursive' },
  { key: "serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
  { key: "sans", label: "Sans", css: 'system-ui, sans-serif' },
];

export function PdfSignatureDialog({
  onClose,
  onInsert,
}: {
  onClose: () => void;
  onInsert: (img: LoadedImage) => void;
}) {
  const [mode, setMode] = useState<Mode>("draw");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function insert(dataUrl: string) {
    try {
      onInsert(await loadImageFromDataUrl(dataUrl, "png"));
    } catch {
      setError("Couldn't create the signature. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Add signature">
      <div className="w-full max-w-md rounded-2xl border border-nd-border bg-nd-surface p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-nd-text">Add your signature</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted hover:bg-white/5 hover:text-nd-text">
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-lg bg-nd-surface-2 p-0.5">
          <Tab active={mode === "draw"} onClick={() => setMode("draw")} icon={<PenLine size={14} />}>Draw</Tab>
          <Tab active={mode === "type"} onClick={() => setMode("type")} icon={<Type size={14} />}>Type</Tab>
          <Tab active={mode === "upload"} onClick={() => setMode("upload")} icon={<Upload size={14} />}>Upload</Tab>
        </div>

        {mode === "draw" && <DrawPad onInsert={insert} />}
        {mode === "type" && <TypePad onInsert={insert} />}
        {mode === "upload" && (
          <UploadPad
            onError={setError}
            onInsert={async (file) => {
              try {
                onInsert(await loadImageFromFile(file));
              } catch (e) {
                setError((e as Error).message || "Couldn't load that image.");
              }
            }}
          />
        )}

        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <p className="mt-3 text-[11px] text-nd-muted">A visual signature you place on the page — not a certified digital signature.</p>
      </div>
    </div>
  );
}

function Tab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs transition-colors ${active ? "bg-nd-accent/25 text-nd-accent" : "text-nd-muted hover:text-nd-text"}`}>
      {icon}
      {children}
    </button>
  );
}

function DrawPad({ onInsert }: { onInsert: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const bboxRef = useRef({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const [dirty, setDirty] = useState(false);
  const W = 400;
  const H = 150;

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function extend(x: number, y: number) {
    const b = bboxRef.current;
    b.minX = Math.min(b.minX, x); b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x); b.maxY = Math.max(b.maxY, y);
  }
  function down(e: React.PointerEvent) {
    drawingRef.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    extend(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    extend(p.x, p.y);
    setDirty(true);
  }
  function up() {
    drawingRef.current = false;
  }
  function clear() {
    canvasRef.current!.getContext("2d")!.clearRect(0, 0, W, H);
    bboxRef.current = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    setDirty(false);
  }
  function add() {
    const b = bboxRef.current;
    if (!isFinite(b.minX)) return;
    const pad = 8;
    const x = Math.max(0, b.minX - pad);
    const y = Math.max(0, b.minY - pad);
    const w = Math.min(W, b.maxX + pad) - x;
    const h = Math.min(H, b.maxY + pad) - y;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w));
    out.height = Math.max(1, Math.round(h));
    out.getContext("2d")!.drawImage(canvasRef.current!, x, y, w, h, 0, 0, out.width, out.height);
    onInsert(out.toDataURL("image/png"));
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="w-full touch-none rounded-lg border border-nd-border bg-white"
        style={{ aspectRatio: `${W}/${H}` }}
      />
      <div className="mt-2 flex justify-between">
        <button type="button" onClick={clear} className="nd-hit inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-nd-muted hover:bg-white/5 hover:text-nd-text">
          <Eraser size={14} /> Clear
        </button>
        <button type="button" disabled={!dirty} onClick={add} className="nd-hit nd-gradient rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Add signature
        </button>
      </div>
    </div>
  );
}

function TypePad({ onInsert }: { onInsert: (dataUrl: string) => void }) {
  const [text, setText] = useState("");
  const [font, setFont] = useState(TYPE_FONTS[0]);

  async function add() {
    if (!text.trim()) return;
    const size = 64;
    const css = `${size}px ${font.css}`;
    try {
      await document.fonts.load(css);
    } catch {
      /* fall back to whatever is available */
    }
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = css;
    const w = Math.ceil(measure.measureText(text).width) + 24;
    const h = Math.ceil(size * 1.5);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.font = css;
    ctx.fillStyle = "#111827";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 12, h / 2);
    onInsert(canvas.toDataURL("image/png"));
  }

  return (
    <div>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your name"
        aria-label="Signature text"
        className="w-full rounded-lg border border-nd-border bg-nd-surface-2 px-3 py-2 text-sm text-nd-text outline-none focus:border-nd-accent"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {TYPE_FONTS.map((f) => (
          <button key={f.key} type="button" aria-pressed={font.key === f.key} onClick={() => setFont(f)} className={`rounded-md border px-2 py-1 text-xs ${font.key === f.key ? "border-nd-accent text-nd-accent" : "border-nd-border text-nd-muted hover:text-nd-text"}`} style={{ fontFamily: f.css }}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex min-h-12 items-center justify-center rounded-lg border border-nd-border bg-white p-2 text-3xl text-nd-bg" style={{ fontFamily: font.css }}>
        {text || <span className="text-neutral-300">Preview</span>}
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" disabled={!text.trim()} onClick={add} className="nd-hit nd-gradient rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          Add signature
        </button>
      </div>
    </div>
  );
}

function UploadPad({ onInsert, onError }: { onInsert: (file: File) => void; onError: (m: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <button type="button" onClick={() => inputRef.current?.click()} className="nd-hit flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-nd-border px-6 py-8 text-nd-muted transition-colors hover:border-nd-accent/50 hover:text-nd-text">
        <Upload size={22} />
        <span className="text-sm">Choose an image of your signature</span>
        <span className="text-[11px]">PNG, JPG or WebP</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onInsert(f);
          else onError("No file selected.");
        }}
      />
    </div>
  );
}
