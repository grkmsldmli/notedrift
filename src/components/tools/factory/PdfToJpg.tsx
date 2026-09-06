"use client";

import { useState } from "react";
import JSZip from "jszip";
import { Download, FileText, Loader2, Package } from "lucide-react";
import { downloadBlob } from "@/lib/export/download";
import { readFileBytes } from "@/lib/tools/pdf";
import { renderPdfToJpegs, type RenderedPage } from "@/lib/tools/pdf-raster";

export function PdfToJpg() {
  const [base, setBase] = useState("page");
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setPages([]);
    setBusy(true);
    setBase(f.name.replace(/\.pdf$/i, "") || "page");
    setProgress({ done: 0, total: 0 });
    try {
      const rendered = await renderPdfToJpegs(await readFileBytes(f), {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setPages(rendered);
    } catch {
      setError("Couldn't render this PDF. It may be password-protected or damaged.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const downloadAllZip = async () => {
    const zip = new JSZip();
    for (const p of pages) zip.file(`${base}-${p.pageNumber}.jpg`, p.blob);
    downloadBlob(await zip.generateAsync({ type: "blob" }), `${base}-jpg.zip`);
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-nd-border bg-nd-surface/40 px-6 py-8 text-center transition-colors hover:border-nd-accent/50 hover:bg-nd-surface">
        <FileText size={24} className="text-nd-muted" />
        <span className="text-sm font-medium text-nd-text">Choose a PDF</span>
        <span className="text-xs text-nd-muted">Rendered to JPGs in your browser</span>
        <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </label>

      {busy && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-nd-muted">
          <Loader2 size={16} className="animate-spin" />
          {progress && progress.total > 0 ? `Rendering page ${progress.done} of ${progress.total}…` : "Opening PDF…"}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {pages.length > 0 && (
        <>
          <button
            type="button"
            onClick={downloadAllZip}
            className="nd-gradient flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Package size={16} /> Download all {pages.length} as ZIP
          </button>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {pages.map((p) => (
              <div key={p.pageNumber} className="overflow-hidden rounded-lg border border-nd-border bg-nd-surface/50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.previewUrl} alt={`Page ${p.pageNumber}`} className="block w-full bg-white" />
                <button
                  type="button"
                  onClick={() => downloadBlob(p.blob, `${base}-${p.pageNumber}.jpg`)}
                  className="nd-hit flex w-full items-center justify-center gap-1.5 border-t border-nd-border py-1.5 text-xs text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
                >
                  <Download size={13} /> Page {p.pageNumber}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
