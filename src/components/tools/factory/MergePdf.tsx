"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { ArrowDown, ArrowUp, Download, FilePlus, Loader2, X } from "lucide-react";
import { downloadBlob } from "@/lib/export/download";
import { readFileBytes } from "@/lib/tools/pdf";

type Item = { id: string; file: File };

export function MergePdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (files: FileList | null) => {
    if (!files) return;
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    setItems((prev) => [...prev, ...pdfs.map((file) => ({ id: `${file.name}-${Math.round(performance.now())}-${Math.random()}`, file }))]);
    setError(null);
  };
  const remove = (id: string) => setItems((p) => p.filter((i) => i.id !== id));
  const move = (i: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const merge = async () => {
    if (items.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await PDFDocument.create();
      for (const item of items) {
        const bytes = await readFileBytes(item.file);
        const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      }
      const merged = await out.save();
      downloadBlob(new Blob([new Uint8Array(merged)], { type: "application/pdf" }), "merged.pdf");
    } catch {
      setError("Couldn't merge these files. One may be password-protected or damaged.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-nd-border bg-nd-surface/40 px-6 py-8 text-center transition-colors hover:border-nd-accent/50 hover:bg-nd-surface">
        <FilePlus size={24} className="text-nd-muted" />
        <span className="text-sm font-medium text-nd-text">Add PDF files</span>
        <span className="text-xs text-nd-muted">Two or more — they stay on your device</span>
        <input type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>

      {items.length > 0 && (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-nd-border bg-nd-surface/50 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-nd-text">{item.file.name}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="nd-hit rounded p-1 text-nd-muted hover:text-nd-text disabled:opacity-30">
                <ArrowUp size={15} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="nd-hit rounded p-1 text-nd-muted hover:text-nd-text disabled:opacity-30">
                <ArrowDown size={15} />
              </button>
              <button type="button" onClick={() => remove(item.id)} aria-label="Remove" className="nd-hit rounded p-1 text-nd-muted hover:text-red-400">
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={merge}
        disabled={items.length < 2 || busy}
        className="nd-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <><Loader2 size={16} className="animate-spin" /> Merging…</> : <><Download size={16} /> Merge {items.length > 1 ? `${items.length} PDFs` : "PDFs"}</>}
      </button>
    </div>
  );
}
