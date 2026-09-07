"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, ImageIcon, RotateCcw } from "lucide-react";
import type { ConvertResult, ToolDef } from "@/lib/convert/types";
import { accepts, acceptError } from "@/lib/convert/mime";
import { checkFileSize } from "@/lib/convert/limits";
import {
  compressionOutcome,
  converterCtaLabel,
  formatBytes,
  formatDimensions,
  formatLabel,
  resizeDims,
} from "@/lib/convert/format";
import { defaultTargetKb, validateTargetKb } from "@/lib/convert/target";
import { outputName } from "@/lib/convert/filenames";
import {
  compressImageToTarget,
  compressOutputFor,
  convertRaster,
  readImageDimensions,
  resizeImage,
} from "@/lib/convert/image";
import { createIco } from "@/lib/convert/ico";
import { triggerDownload } from "@/lib/convert/download";
import { FileDrop } from "./FileDrop";

type Status = "idle" | "reading" | "ready" | "working" | "done" | "error";

interface ImageMeta {
  width: number;
  height: number;
  bytes: number;
}

export function ToolConverter({ tool }: { tool: ToolDef }) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ImageMeta | null>(null);
  const [results, setResults] = useState<ConvertResult[]>([]);
  // Compress-to-target extras (set only for the compress flow).
  const [compressInfo, setCompressInfo] = useState<{
    targetBytes: number;
    reachedTarget: boolean;
  } | null>(null);
  const [alreadyUnder, setAlreadyUnder] = useState<{
    targetBytes: number;
    originalBytes: number;
  } | null>(null);

  // Options
  const [targetKb, setTargetKb] = useState<number | "">("");
  const [width, setWidth] = useState<number | "">("");
  const [height, setHeight] = useState<number | "">("");
  const [lockAspect, setLockAspect] = useState(true);

  const previewUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const setPreviewFor = useCallback((file: File | null) => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = file ? URL.createObjectURL(file) : null;
    setPreview(previewUrl.current);
  }, []);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const isMulti = tool.kind === "images-to-pdf";

  const reset = () => {
    setFiles([]);
    setStatus("idle");
    setError(null);
    setMeta(null);
    setResults([]);
    setCompressInfo(null);
    setAlreadyUnder(null);
    setTargetKb("");
    setWidth("");
    setHeight("");
    setPreviewFor(null);
  };

  const onFiles = useCallback(
    async (picked: File[]) => {
      setError(null);
      setResults([]);
      const chosen = isMulti ? picked : [picked[0]];
      for (const f of chosen) {
        if (!accepts(tool, f)) {
          setError(acceptError(tool));
          return;
        }
        const sizeErr = checkFileSize(f.size);
        if (sizeErr) {
          setError(sizeErr);
          return;
        }
      }
      setFiles(chosen);
      setStatus("reading");
      try {
        if (!isMulti) {
          const dims = await readImageDimensions(chosen[0]);
          setMeta({ width: dims.width, height: dims.height, bytes: chosen[0].size });
          setWidth(dims.width);
          setHeight(dims.height);
          // Default the compress target to a useful ~half the original size.
          setTargetKb(defaultTargetKb(chosen[0].size));
        }
        setPreviewFor(chosen[0]);
        setStatus("ready");
      } catch {
        setError("This file could not be read. It may be corrupt or unsupported.");
        setStatus("error");
      }
    },
    [tool, isMulti, setPreviewFor],
  );

  const convert = useCallback(async () => {
    if (files.length === 0) return;
    setStatus("working");
    setError(null);
    try {
      const file = files[0];
      let out: ConvertResult[] = [];
      switch (tool.kind) {
        case "raster": {
          const useW = tool.slug === "svg-to-png" && typeof width === "number" ? width : undefined;
          const useH = tool.slug === "svg-to-png" && typeof height === "number" ? height : undefined;
          const r = await convertRaster(file, tool.output === "jpeg" ? "jpeg" : "png", {
            filename: outputName(file.name, tool.outputExt ?? "png"),
            quality: 0.92,
            width: useW,
            height: useH,
          });
          out = [r];
          break;
        }
        case "compress": {
          const originalBytes = file.size;
          const target =
            typeof targetKb === "number" ? targetKb : defaultTargetKb(originalBytes);
          const v = validateTargetKb(target, originalBytes);
          if (!v.valid) {
            setError(v.error ?? "Enter a valid target size.");
            setStatus("ready");
            return;
          }
          if (v.alreadyUnder) {
            // The original already meets the target — never wastefully re-encode.
            setAlreadyUnder({ targetBytes: target * 1024, originalBytes });
            setCompressInfo(null);
            setResults([]);
            setStatus("done");
            return;
          }
          const { ext } = compressOutputFor(file);
          const r = await compressImageToTarget(
            file,
            target * 1024,
            outputName(file.name, ext, "-compressed"),
          );
          setCompressInfo({ targetBytes: r.targetBytes, reachedTarget: r.reachedTarget });
          setAlreadyUnder(null);
          out = [r];
          break;
        }
        case "resize": {
          if (!meta) break;
          const dims = resizeDims(
            meta.width,
            meta.height,
            typeof width === "number" ? width : null,
            typeof height === "number" ? height : null,
            lockAspect,
          );
          const { ext } = compressOutputFor(file);
          const r = await resizeImage(
            file,
            dims.width,
            dims.height,
            outputName(file.name, ext, `-${dims.width}x${dims.height}`),
          );
          out = [r];
          break;
        }
        case "png-to-ico": {
          const r = await createIco(file, outputName(file.name, "ico"));
          out = [r];
          break;
        }
        case "images-to-pdf": {
          const { imagesToPdf } = await import("@/lib/convert/pdf");
          const r = await imagesToPdf(files, outputName(files[0].name, "pdf"));
          out = [r];
          break;
        }
      }
      if (out.length === 0) {
        setError("Nothing to convert. Please check your options.");
        setStatus("ready");
        return;
      }
      setResults(out);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conversion failed. Please try a different file.");
      setStatus("error");
    }
  }, [files, tool, targetKb, width, height, lockAspect, meta]);

  const acceptAttr = tool.accept.join(",");
  const busy = status === "working" || status === "reading";

  return (
    <div className="flex flex-col gap-5">
      {status === "idle" && (
        <FileDrop
          accept={acceptAttr}
          multiple={isMulti}
          acceptLabel={tool.acceptLabel}
          onFiles={onFiles}
        />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {status !== "idle" && files.length > 0 && (
        <div className="flex items-start gap-4 rounded-2xl border border-nd-border bg-nd-surface/60 p-4">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview}
              alt=""
              className="h-16 w-16 shrink-0 rounded-lg border border-nd-border object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-nd-border bg-nd-surface-2 text-nd-muted">
              <ImageIcon size={22} />
            </span>
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium text-nd-text">
              {isMulti ? `${files.length} file${files.length > 1 ? "s" : ""}` : files[0].name}
            </p>
            <p className="mt-0.5 text-nd-muted">
              {isMulti
                ? `${formatBytes(files.reduce((s, f) => s + f.size, 0))} total`
                : meta
                  ? `${formatDimensions(meta.width, meta.height)} · ${formatBytes(meta.bytes)}`
                  : formatBytes(files[0].size)}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="nd-hit flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
          >
            <RotateCcw size={13} /> Start over
          </button>
        </div>
      )}

      {(status === "ready" || status === "working") && (
        <Options
          tool={tool}
          targetKb={targetKb}
          setTargetKb={setTargetKb}
          originalBytes={meta?.bytes ?? files[0]?.size ?? 0}
          width={width}
          setWidth={setWidth}
          height={height}
          setHeight={setHeight}
          lockAspect={lockAspect}
          setLockAspect={setLockAspect}
          meta={meta}
        />
      )}

      {(status === "ready" || status === "working" || status === "error") && files.length > 0 && (
        <button
          type="button"
          onClick={convert}
          disabled={busy}
          className="nd-gradient inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {tool.kind === "compress" && status === "working"
            ? `Compressing to ${typeof targetKb === "number" ? targetKb : ""} KB…`
            : converterCtaLabel(tool.kind, status === "working", tool.outputExt)}
        </button>
      )}

      {status === "done" && alreadyUnder && (
        <AlreadyUnderTarget
          originalBytes={alreadyUnder.originalBytes}
          targetBytes={alreadyUnder.targetBytes}
          onReset={reset}
        />
      )}
      {status === "done" && !alreadyUnder && results.length > 0 && (
        <Results
          tool={tool}
          result={results[0]}
          originalBytes={meta?.bytes ?? files.reduce((s, f) => s + f.size, 0)}
          compressInfo={compressInfo}
          onReset={reset}
        />
      )}
    </div>
  );
}

/* ------------------------------- sub-views -------------------------------- */

interface OptionsProps {
  tool: ToolDef;
  targetKb: number | "";
  setTargetKb: (n: number | "") => void;
  originalBytes: number;
  width: number | "";
  setWidth: (n: number | "") => void;
  height: number | "";
  setHeight: (n: number | "") => void;
  lockAspect: boolean;
  setLockAspect: (b: boolean) => void;
  meta: ImageMeta | null;
}

function Options(p: OptionsProps) {
  const { tool } = p;
  if (tool.kind === "compress") {
    // Target FILE SIZE is the whole interaction — no quality percentage to reason
    // about. Presets are capped just under the original (a target ≥ original is a
    // no-op). Format is always preserved.
    const presets = [100, 200, 500, 1024].filter((kb) => kb * 1024 < p.originalBytes);
    return (
      <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-4">
        <label htmlFor="nd-target" className="block text-sm text-nd-text">
          Target file size
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id="nd-target"
            type="number"
            inputMode="numeric"
            min={10}
            value={p.targetKb}
            onChange={(e) =>
              p.setTargetKb(e.target.value === "" ? "" : Math.max(1, Math.round(Number(e.target.value))))
            }
            className="w-28 rounded-lg border border-nd-border bg-nd-bg px-3 py-2 text-sm tabular-nums text-nd-text outline-none focus:ring-1 focus:ring-nd-accent/50"
          />
          <span className="text-sm text-nd-muted">KB</span>
        </div>
        {presets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {presets.map((kb) => (
              <button
                key={kb}
                type="button"
                onClick={() => p.setTargetKb(kb)}
                className={`nd-hit rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  p.targetKb === kb
                    ? "border-nd-accent/40 bg-nd-accent/15 text-nd-accent"
                    : "border-nd-border text-nd-muted hover:bg-white/5 hover:text-nd-text"
                }`}
              >
                {kb >= 1024 ? "1 MB" : `${kb} KB`}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-nd-muted">
          We keep the highest quality and resolution that fits at or below your
          target. The format stays the same.
        </p>
      </div>
    );
  }
  if (tool.kind === "resize") {
    const onW = (v: string) => {
      const n = v === "" ? "" : Math.max(1, Math.round(Number(v)));
      p.setWidth(n);
      if (p.lockAspect && p.meta && typeof n === "number") {
        p.setHeight(Math.max(1, Math.round(n / (p.meta.width / p.meta.height))));
      }
    };
    const onH = (v: string) => {
      const n = v === "" ? "" : Math.max(1, Math.round(Number(v)));
      p.setHeight(n);
      if (p.lockAspect && p.meta && typeof n === "number") {
        p.setWidth(Math.max(1, Math.round(n * (p.meta.width / p.meta.height))));
      }
    };
    return (
      <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <NumField id="nd-w" label="Width" value={p.width} onChange={onW} />
          <span className="pb-2 text-nd-muted">×</span>
          <NumField id="nd-h" label="Height" value={p.height} onChange={onH} />
          <label className="flex items-center gap-2 pb-2 text-xs text-nd-muted">
            <input
              type="checkbox"
              checked={p.lockAspect}
              onChange={(e) => p.setLockAspect(e.target.checked)}
              className="accent-nd-accent"
            />
            Lock aspect ratio
          </label>
        </div>
        {p.meta && (
          <p className="mt-2 text-xs text-nd-muted">
            Original: {formatDimensions(p.meta.width, p.meta.height)}
          </p>
        )}
      </div>
    );
  }
  if (tool.slug === "svg-to-png") {
    return (
      <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <NumField id="nd-w" label="Width" value={p.width} onChange={(v) => p.setWidth(v === "" ? "" : Math.max(1, Math.round(Number(v))))} />
          <span className="pb-2 text-nd-muted">×</span>
          <NumField id="nd-h" label="Height" value={p.height} onChange={(v) => p.setHeight(v === "" ? "" : Math.max(1, Math.round(Number(v))))} />
        </div>
        <p className="mt-2 text-xs text-nd-muted">Output size (defaults to the SVG&apos;s own size).</p>
      </div>
    );
  }
  return null;
}

function NumField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | "";
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-nd-muted">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-lg border border-nd-border bg-nd-surface-2 px-2.5 py-1.5 text-sm text-nd-text outline-none focus-visible:border-nd-accent"
      />
    </div>
  );
}

function Results({
  tool,
  result,
  originalBytes,
  compressInfo,
  onReset,
}: {
  tool: ToolDef;
  result: ConvertResult;
  originalBytes: number;
  compressInfo: { targetBytes: number; reachedTarget: boolean } | null;
  onReset: () => void;
}) {
  // Format ALWAYS comes from the produced file (MIME → extension fallback), never
  // from fixed tool metadata — so a PNG result reads "PNG", not the tool's slug.
  const fmt = formatLabel(result.mime, result.filename);
  const dims = result.width ? formatDimensions(result.width, result.height ?? 0) : null;

  const downloadBtn = (
    <button
      type="button"
      onClick={() => triggerDownload(result.blob, result.filename)}
      className="nd-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
    >
      <Download size={16} /> Download
    </button>
  );
  const homeLink = (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 rounded-xl border border-nd-border px-4 py-2.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
    >
      Open NoteDrift <ArrowRight size={15} />
    </Link>
  );

  if (tool.kind === "compress" && compressInfo) {
    const { savedBytes, percent } = compressionOutcome(originalBytes, result.bytes);
    const targetKb = Math.round(compressInfo.targetBytes / 1024);

    // Target unreachable: never claim success. Show the closest result honestly and
    // let the user decide — the download is offered but labelled as above target.
    if (!compressInfo.reachedTarget) {
      return (
        <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-4">
          <p className="text-sm font-semibold text-nd-text">
            Couldn&apos;t reach {targetKb} KB while keeping this image usable.
          </p>
          <div className="mt-2 space-y-1.5 text-sm text-nd-muted">
            <p>Here&apos;s the closest we could get without breaking the image:</p>
            <div className="grid w-max grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 tabular-nums">
              <span>Target</span>
              <span className="text-right text-nd-text">{formatBytes(compressInfo.targetBytes)}</span>
              <span>Closest result</span>
              <span className="text-right text-nd-text">{formatBytes(result.bytes)}</span>
            </div>
            <p className="pt-0.5">
              {fmt}
              {dims ? ` · ${dims}` : ""}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {downloadBtn}
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-nd-border px-4 py-2.5 text-sm text-nd-text transition-colors hover:bg-white/5"
            >
              <RotateCcw size={15} /> Start over
            </button>
            {homeLink}
          </div>
          <p className="mt-2 text-xs text-nd-muted">
            This file is above your {targetKb} KB target.
          </p>
        </div>
      );
    }

    // Target reached — the result is at or below the requested size.
    return (
      <div className="rounded-2xl border border-nd-accent/30 bg-nd-accent/[0.06] p-4">
        <p className="text-sm font-semibold text-nd-text">Done ✓</p>
        <div className="mt-2 space-y-1 text-sm text-nd-muted">
          <div className="grid w-max grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 tabular-nums">
            <span>Original</span>
            <span className="text-right text-nd-text">{formatBytes(originalBytes)}</span>
            <span>Target</span>
            <span className="text-right text-nd-text">{formatBytes(compressInfo.targetBytes)}</span>
            <span>Compressed</span>
            <span className="text-right text-nd-text">{formatBytes(result.bytes)}</span>
            {savedBytes > 0 && (
              <>
                <span>Saved</span>
                <span className="text-right text-emerald-400">
                  {formatBytes(savedBytes)} ({percent}%)
                </span>
              </>
            )}
          </div>
          <p className="pt-0.5">
            {fmt}
            {dims ? ` · ${dims}` : ""}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {downloadBtn}
          {homeLink}
        </div>
        <p className="mt-2 text-xs text-nd-muted">
          Optimized to stay under your {targetKb} KB target.
        </p>
      </div>
    );
  }

  // Non-compress tools (raster / resize / images-to-pdf / png-to-ico).
  return (
    <div className="rounded-2xl border border-nd-accent/30 bg-nd-accent/[0.06] p-4">
      <p className="text-sm font-semibold text-nd-text">Done ✓</p>
      <div className="mt-2 space-y-1 text-sm text-nd-muted">
        <p className="truncate text-nd-text">{result.filename}</p>
        <p>
          {fmt} · {formatBytes(result.bytes)}
          {dims ? ` · ${dims}` : ""}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {downloadBtn}
        {homeLink}
      </div>
    </div>
  );
}

/** Shown when the requested target is already ≥ the original size — there is
 *  nothing to gain by re-encoding, so we don't. */
function AlreadyUnderTarget({
  originalBytes,
  targetBytes,
  onReset,
}: {
  originalBytes: number;
  targetBytes: number;
  onReset: () => void;
}) {
  const targetKb = Math.round(targetBytes / 1024);
  return (
    <div className="rounded-2xl border border-nd-border bg-nd-surface/60 p-4">
      <p className="text-sm font-semibold text-nd-text">
        This image is already under your target size.
      </p>
      <div className="mt-2 space-y-1.5 text-sm text-nd-muted">
        <p>
          It&apos;s already smaller than {targetKb} KB, so there&apos;s nothing to
          compress — using the original keeps the best quality.
        </p>
        <div className="grid w-max grid-cols-[auto_1fr] gap-x-6 gap-y-0.5 tabular-nums">
          <span>Original</span>
          <span className="text-right text-nd-text">{formatBytes(originalBytes)}</span>
          <span>Target</span>
          <span className="text-right text-nd-text">{formatBytes(targetBytes)}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-xl border border-nd-border px-4 py-2.5 text-sm text-nd-text transition-colors hover:bg-white/5"
        >
          <RotateCcw size={15} /> Start over
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-nd-border px-4 py-2.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          Open NoteDrift <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
