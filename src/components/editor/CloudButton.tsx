"use client";

// Compact cloud control for the current canvas (Phase 2.0C). Signed-in only —
// anonymous users sign in via the account button first, then this appears. It
// shows the current canvas's sync state and the per-canvas actions (Save to
// Cloud, Remove from cloud, resolve a conflict). The browse-all dialog lives in
// CloudCanvasesDialog.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  FolderOpen,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { getCloudEngine } from "@/lib/cloud/engine";
import { onAuthChange } from "@/lib/auth/client";
import { isSupabaseConfigured } from "@/lib/auth/config";
import type { SyncState } from "@/lib/cloud/link";
import { useAuth } from "../auth/AuthProvider";
import { UpgradeDialog } from "../billing/UpgradeDialog";

export function CloudButton({
  currentId,
  currentTitle,
  onOpenCloudList,
  onNotice,
}: {
  currentId: string;
  currentTitle: string;
  onOpenCloudList: () => void;
  onNotice: (msg: string) => void;
}) {
  const { plan } = useAuth();
  const [signedIn, setSignedIn] = useState(false);
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [atLimit, setAtLimit] = useState(false);

  useEffect(() => onAuthChange((u) => setSignedIn(!!u)), []);
  useEffect(() => getCloudEngine().subscribe(() => force((n) => n + 1)), []);

  if (!isSupabaseConfigured() || !signedIn) return null;

  const isPro = plan === "pro";

  const engine = getCloudEngine();
  const link = engine.status(currentId);
  const owns = engine.ownsCurrent(currentId);
  const state: SyncState | "local-only" = link && owns ? link.syncState : "local-only";
  const foreign = !!link && !owns; // linked to another account

  async function saveToCloud() {
    setBusy(true);
    const res = await engine.saveToCloud(currentId, currentTitle);
    setBusy(false);
    setOpen(false);
    if (!res.ok) {
      if (res.kind === "limit" && !isPro) {
        // The strongest intent moment: show ONE focused upgrade state, never a
        // toast covered by a modal (§13B).
        setAtLimit(true);
        setUpgradeOpen(true);
      } else {
        onNotice(res.kind === "limit" ? "You're at 3 cloud canvases." : res.message);
      }
    }
  }

  async function removeFromCloud() {
    if (!window.confirm("Remove this canvas from the cloud? Your local copy stays on this device.")) return;
    setBusy(true);
    const res = await engine.removeFromCloud(currentId);
    setBusy(false);
    setOpen(false);
    if (!res.ok && res.message) onNotice(res.message);
  }

  async function resolve(choice: "keep" | "cloud") {
    setBusy(true);
    const res = await engine.resolveConflict(currentId, choice);
    setBusy(false);
    setOpen(false);
    if (!res.ok && res.message) onNotice(res.message);
  }

  const visual = STATE_VISUAL[foreign ? "foreign" : state];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Cloud — ${visual.label}`}
        title={visual.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="nd-hit flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : visual.icon}
        <span className={`hidden sm:inline ${visual.className}`}>{visual.short}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-nd-border bg-nd-surface p-1 shadow-2xl">
            {state === "local-only" && !foreign && (
              <MenuItem icon={<UploadCloud size={16} />} onClick={saveToCloud}>
                Save to cloud
              </MenuItem>
            )}
            {foreign && (
              <p className="px-2.5 py-2 text-xs text-nd-muted">
                This canvas is linked to a different account. Sign in with that account to sync it.
              </p>
            )}
            {state === "conflict" && (
              <div className="p-1">
                <p className="px-1.5 pb-2 pt-1 text-xs text-nd-text">This canvas changed on another device.</p>
                <MenuItem icon={<Check size={16} />} onClick={() => resolve("keep")}>
                  Keep this version
                </MenuItem>
                <MenuItem icon={<Cloud size={16} />} onClick={() => resolve("cloud")}>
                  Use cloud version
                </MenuItem>
                <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-nd-muted">
                  Using the cloud version keeps your current work as a local backup.
                </p>
              </div>
            )}
            {(state === "synced" || state === "syncing" || state === "dirty" || state === "offline" || state === "error") && (
              <>
                <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-nd-text">
                  {visual.icon}
                  {visual.detail}
                </p>
                <MenuItem icon={<Trash2 size={16} className="text-nd-muted" />} onClick={removeFromCloud}>
                  Remove from cloud
                </MenuItem>
              </>
            )}
            <div className="my-1 h-px bg-nd-border" />
            <MenuItem icon={<FolderOpen size={16} className="text-nd-muted" />} onClick={() => { setOpen(false); onOpenCloudList(); }}>
              Cloud canvases…
            </MenuItem>
            {!isPro && (
              <MenuItem icon={<Sparkles size={16} className="text-nd-accent" />} onClick={() => { setOpen(false); setAtLimit(false); setUpgradeOpen(true); }}>
                Upgrade to Pro
              </MenuItem>
            )}
          </div>
        </>
      )}

      {upgradeOpen && (
        <UpgradeDialog
          atLimit={atLimit}
          onClose={() => {
            setUpgradeOpen(false);
            setAtLimit(false);
          }}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}

function MenuItem({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-nd-text transition-colors hover:bg-white/5"
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
}

const STATE_VISUAL: Record<
  SyncState | "local-only" | "foreign",
  { icon: React.ReactNode; short: string; label: string; detail: string; className: string }
> = {
  "local-only": { icon: <UploadCloud size={15} />, short: "Save", label: "Not in the cloud", detail: "On this device only.", className: "" },
  dirty: { icon: <Cloud size={15} />, short: "Saving", label: "Syncing soon", detail: "Saved locally · syncing…", className: "" },
  syncing: { icon: <Loader2 size={15} className="animate-spin" />, short: "Syncing", label: "Syncing", detail: "Syncing to cloud…", className: "" },
  synced: { icon: <Check size={15} className="text-emerald-400" />, short: "Synced", label: "Synced to cloud", detail: "Synced to your cloud account.", className: "text-emerald-400" },
  offline: { icon: <CloudOff size={15} />, short: "Offline", label: "Offline", detail: "Saved locally · cloud sync resumes when you're online.", className: "" },
  error: { icon: <CloudOff size={15} className="text-amber-400" />, short: "Retrying", label: "Sync error", detail: "Saved locally · cloud sync will retry.", className: "text-amber-400" },
  conflict: { icon: <AlertTriangle size={15} className="text-amber-400" />, short: "Conflict", label: "Changed elsewhere", detail: "Changed on another device.", className: "text-amber-400" },
  foreign: { icon: <Cloud size={15} className="text-nd-muted" />, short: "Cloud", label: "Other account", detail: "Linked to another account.", className: "" },
};
