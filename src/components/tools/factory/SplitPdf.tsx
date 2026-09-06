"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { Download, FileText, Loader2 } from "lucide-react";
import { downloadBlob } from "@/lib/export/download";
import { readFileBytes, parsePageRangeGroups } from "@/lib/tools/pdf";

export function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [ranges, setRanges] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setFile(f);
    try {
      const doc = await PDFDocument.load(await readFileBytes(f));
      setPageCount(doc.getPageCount());
      setRanges(`1-${doc.getPageCount()}`);
    } catch {
      setError("Couldn't open this PDF. It may be password-protected or damaged.");
      setFile(null);
      setPageCount(0);
    }
  };

  const groups = file ? parsePageRangeGroups(ranges, pageCount) : [];

  const split = async () => {
    if (!file || groups.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const srcBytes = await readFileBytes(file);
      const base = file.name.replace(/\.pdf$/i, "") || "document";
      const parts: { name: string; bytes: Uint8Array }[] = [];
      for (let g = 0; g < groups.length; g++) {
        const src = await PDFDocument.load(srcBytes);
        const out = await PDFDocument.create();
        const pages = await out.copyPages(src, groups[g].map((p) => p - 1));
        pages.forEach((p) => out.addPage(p));
        parts.push({ name: `${base}-part-${g + 1}.pdf`, bytes: await out.save() });
      }
      if (parts.length === 1) {
        downloadBlob(new Blob([new Uint8Array(parts[0].bytes)], { type: "application/pdf" }), parts[0].name);
      } else {
        const zip = new JSZip();
        for (const p of parts) zip.file(p.name, p.bytes);
        downloadBlob(await zip.generateAsync({ type: "blob" }), `${base}-split.zip`);
      }
    } catch {
      setError("Couldn't split this PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!file) {
    return (
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-nd-border bg-nd-surface/40 px-6 py-12 text-center transition-colors hover:border-nd-accent/50 hover:bg-nd-surface">
        <FileText size={24} className="text-nd-muted" />
        <span className="text-sm font-medium text-nd-text">Choose a PDF to split</span>
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

      <div>
        <label htmlFor="split-ranges" className="mb-1 block text-xs text-nd-muted">
          Page ranges — each becomes its own file (e.g. 1-3, 4-6, 7)
        </label>
        <input
          id="split-ranges"
          value={ranges}
          onChange={(e) => setRanges(e.target.value)}
          placeholder="1-3, 4-6, 7"
          className="w-full rounded-lg border border-nd-border bg-nd-bg-2 px-3 py-2.5 text-sm text-nd-text outline-none ring-nd-accent/50 transition focus:ring-2"
        />
        <p className="mt-1 text-xs text-nd-muted">
          {groups.length > 0 ? `${groups.length} file${groups.length > 1 ? "s" : ""} will be created.` : "Enter at least one valid page range."}
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={split}
        disabled={groups.length === 0 || busy}
        className="nd-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <><Loader2 size={16} className="animate-spin" /> Splitting…</> : <><Download size={16} /> Split PDF</>}
      </button>
    </div>
  );
}
