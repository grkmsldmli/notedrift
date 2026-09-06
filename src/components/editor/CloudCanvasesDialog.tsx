"use client";

// Cloud Canvases browser (Phase 2.0C). A compact sheet — NOT a dashboard. Lists
// the signed-in user's cloud canvases (metadata only), shows the 3-of-N usage,
// and lets them Open (download + hydrate into a local page) or Remove from cloud
// (keeps the local copy). Fetched fresh on open + on demand.

import { useCallback, useEffect, useState } from "react";
import { Cloud, FolderOpen, Loader2, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { getCloudEngine, type CloudCanvasMeta } from "@/lib/cloud/engine";
import { useAuth } from "../auth/AuthProvider";
import { UpgradeDialog } from "../billing/UpgradeDialog";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s) || s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function CloudCanvasesDialog({
  onClose,
  onOpen,
  onNotice,
}: {
  onClose: () => void;
  onOpen: (cloudId: string) => void;
  onNotice: (msg: string) => void;
}) {
  const engine = getCloudEngine();
  const { plan } = useAuth();
  const isPro = plan === "pro";
  const [rows, setRows] = useState<CloudCanvasMeta[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const refresh = useCallback(async () => {
    setRows(null);
    setRows(await engine.list());
  }, [engine]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await engine.list();
      if (!cancelled) setRows(data);
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [engine, onClose]);

  async function remove(cloudId: string) {
    if (!window.confirm("Remove this canvas from the cloud? Your local copy stays on this device.")) return;
    setBusyId(cloudId);
    const res = await engine.removeCloudCanvas(cloudId);
    setBusyId(null);
    if (!res.ok && res.message) onNotice(res.message);
    void refresh();
  }

  const count = rows?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Cloud canvases">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-nd-border bg-nd-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-nd-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Cloud size={16} className="text-nd-accent" />
            <h2 className="text-sm font-semibold text-nd-text">Cloud canvases</h2>
            {rows &&
              (isPro ? (
                <span className="nd-gradient inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Sparkles size={10} /> Pro · {count}
                </span>
              ) : (
                <span className="rounded-full bg-nd-surface-2 px-2 py-0.5 text-[11px] tabular-nums text-nd-muted">
                  {count} of 3
                </span>
              ))}
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" aria-label="Refresh" onClick={() => void refresh()} className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted hover:bg-white/5 hover:text-nd-text">
              <RefreshCw size={15} />
            </button>
            <button type="button" aria-label="Close" onClick={onClose} className="nd-hit flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted hover:bg-white/5 hover:text-nd-text">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="nd-scroll min-h-24 flex-1 overflow-y-auto p-2">
          {rows === null && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-nd-muted">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          )}
          {rows && rows.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-nd-muted">
              No cloud canvases yet. Use <span className="text-nd-text">Save to cloud</span> on a canvas to keep it in your account.
            </p>
          )}
          {rows?.map((r) => {
            const cached = engine.localIdForCloud(r.id);
            return (
              <div key={r.id} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5">
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <FolderOpen size={16} className="shrink-0 text-nd-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-nd-text">{r.title || "Untitled"}</span>
                    <span className="block text-[11px] text-nd-muted">
                      Updated {timeAgo(r.updatedAt)}
                      {cached ? " · on this device" : ""}
                    </span>
                  </span>
                </button>
                <button type="button" onClick={() => onOpen(r.id)} className="nd-hit rounded-md border border-nd-border px-2.5 py-1 text-xs text-nd-text hover:bg-white/5">
                  Open
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${r.title || "Untitled"} from cloud`}
                  onClick={() => remove(r.id)}
                  disabled={busyId === r.id}
                  className="nd-hit flex h-8 w-8 items-center justify-center rounded-md text-nd-muted opacity-0 transition hover:bg-white/10 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                >
                  {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            );
          })}
        </div>

        {rows && !isPro && count >= 3 && (
          <div className="border-t border-nd-border bg-nd-accent/5 px-4 py-3 text-[11px]">
            <p className="text-nd-text">
              {count > 3
                ? `Your ${count} Pro canvases still open and sync. Free saves 3 — resubscribe or remove some to save more.`
                : "You've used your 3 free cloud canvases. Go Pro for unlimited, or remove one below."}
            </p>
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className="nd-gradient mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <Sparkles size={13} /> {count > 3 ? "Resubscribe to Pro" : "Upgrade to Pro"}
            </button>
          </div>
        )}

        <p className="border-t border-nd-border px-4 py-2.5 text-[11px] text-nd-muted">
          Stored privately in your NoteDrift account. Local canvases stay unlimited.
        </p>
      </div>

      {upgradeOpen && (
        <UpgradeDialog onClose={() => setUpgradeOpen(false)} onNotice={onNotice} />
      )}
    </div>
  );
}
