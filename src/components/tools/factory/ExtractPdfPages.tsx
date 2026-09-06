"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Download, FileText, Loader2 } from "lucide-react";
import { downloadBlob } from "@/lib/export/download";
import { readFileBytes } from "@/lib/tools/pdf";

export function ExtractPdfPages() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setFile(f);
    setSelected(new Set());
    try {
      const doc = await PDFDocument.load(await readFileBytes(f));
      setPageCount(doc.getPageCount());
    } catch {
      setError("Couldn't open this PDF. It may be password-protected or damaged.");
      setFile(null);
      setPageCount(0);
    }
  };

  const toggle = (p: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  const chosen = pages.filter((p) => selected.has(p));

  const extract = async () => {
    if (!file || chosen.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const src = await PDFDocument.load(await readFileBytes(file));
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, chosen.map((p) => p - 1));
      copied.forEach((p) => out.addPage(p));
      const base = file.name.replace(/\.pdf$/i, "") || "document";
      downloadBlob(new Blob([new Uint8Array(await out.save())], { type: "application/pdf" }), `${base}-pages.pdf`);
    } catch {
      setError("Couldn't extract these pages. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-nd-border bg-nd-surface/40 px-6 py-12 text-center transition-colors hover:border-nd-accent/50 hover:bg-nd-surface">
        <FileText size={24} className="text-nd-muted" />
        <span className="text-sm font-medium text-nd-text">Choose a PDF</span>
        <span className="text-xs text-nd-muted">Stays on your device</span>
        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
        {error && <span className="text-xs text-red-400">{error}</span>}
      </label>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-nd-border bg-nd-surface/50 px-3 py-2 text-sm">
        <FileText size={15} className="text-nd-muted" />
        <span className="min-w-0 flex-1 truncate text-nd-text">{file.name}</span>
        <span className="shrink-0 text-xs text-nd-muted">{pageCount} pages</span>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-nd-muted">Tap the pages to keep</p>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={() => setSelected(new Set(pages))} className="text-nd-accent hover:underline">All</button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-nd-muted hover:text-nd-text">None</button>
        </div>
      </div>

      <div className="nd-scroll grid max-h-64 grid-cols-6 gap-1.5 overflow-y-auto sm:grid-cols-8">
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            aria-pressed={selected.has(p)}
            className={[
              "aspect-square rounded-md border text-xs font-medium tabular-nums transition-colors",
              selected.has(p)
                ? "border-nd-accent bg-nd-accent/15 text-nd-text"
                : "border-nd-border text-nd-muted hover:bg-white/5 hover:text-nd-text",
            ].join(" ")}
          >
            {p}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={extract}
        disabled={chosen.length === 0 || busy}
        className="nd-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <><Loader2 size={16} className="animate-spin" /> Extracting…</> : <><Download size={16} /> Extract {chosen.length || ""} page{chosen.length === 1 ? "" : "s"}</>}
      </button>
    </div>
  );
}
