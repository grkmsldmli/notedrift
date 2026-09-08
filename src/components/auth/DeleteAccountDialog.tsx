"use client";

// In-app account deletion confirmation (App Store Guideline 5.1.1(v)). Requires an
// explicit destructive confirmation and truthfully states that deletion does NOT
// cancel an active App Store / Stripe subscription.

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { deleteAccount } from "@/lib/account/client";
import { billingPlatform } from "@/lib/platform";

export function DeleteAccountDialog({
  isPro,
  onClose,
  onDeleted,
}: {
  isPro: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const native = billingPlatform() === "apple";
  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function onConfirm() {
    if (!canDelete || busy) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccount();
    if (res.ok) {
      onDeleted();
      return;
    }
    setBusy(false);
    setError(
      res.reason === "unauthorized"
        ? "Please sign in again and retry."
        : "Couldn't delete your account right now. Please try again.",
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nd-delete-title"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-nd-border bg-nd-surface p-5 shadow-2xl">
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-label="Close"
          className="nd-hit absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          <X size={16} />
        </button>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-300">
          <AlertTriangle size={18} />
        </div>
        <h2 id="nd-delete-title" className="mt-3 text-lg font-semibold text-nd-text">
          Delete your account?
        </h2>
        <p className="mt-1 text-sm text-nd-muted">
          This permanently deletes your NoteDrift account and all of your data —
          cloud canvases, uploaded images, and preferences. This can&apos;t be undone.
        </p>

        {isPro && (
          <p className="mt-3 rounded-lg border border-nd-border bg-nd-surface-2 px-3 py-2 text-[13px] text-nd-muted">
            {native
              ? "Deleting your account does not cancel your App Store subscription. Cancel it in Settings › Apple ID › Subscriptions to stop future charges."
              : "Deleting your account does not cancel your subscription. Cancel it first from “Manage billing”."}
          </p>
        )}

        <label htmlFor="nd-delete-confirm" className="mt-4 block text-xs font-medium text-nd-muted">
          Type <span className="font-semibold text-nd-text">DELETE</span> to confirm
        </label>
        <input
          id="nd-delete-confirm"
          type="text"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-nd-border bg-nd-bg px-3 py-2 text-sm text-nd-text outline-none focus:ring-1 focus:ring-red-500/50"
        />

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="rounded-lg border border-nd-border px-4 py-2 text-sm text-nd-text transition-colors hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canDelete || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Deleting…
              </>
            ) : (
              <>Delete account</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
