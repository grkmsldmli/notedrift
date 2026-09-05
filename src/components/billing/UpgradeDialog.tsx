"use client";

// Compact NoteDrift Pro upgrade sheet (Phase 2.0D-C). NOT a pricing page — a small
// dismissible modal. Free (3 cloud canvases) vs Pro (unlimited cloud canvases), a
// monthly/yearly choice, and one CTA that opens Stripe-hosted Checkout. Prices are
// derived from the canonical PRICING constants (never hardcoded). No free trial,
// no invented discounts — the yearly saving is computed truthfully.

import { useEffect, useState } from "react";
import { Check, Cloud, Loader2, X } from "lucide-react";
import { PRICING, annualMonthlyEquivalent, annualSavingsPercent } from "@/lib/plans";
import { startCheckout } from "@/lib/billing/client";
import type { BillingInterval } from "@/lib/billing/types";

const money = (n: number) => `$${n.toFixed(2)}`;

export function UpgradeDialog({
  onClose,
  onNotice,
}: {
  onClose: () => void;
  onNotice: (msg: string) => void;
}) {
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const [busy, setBusy] = useState(false);
  const titleId = "nd-upgrade-title";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const savePct = Math.round(annualSavingsPercent() * 100);
  const yearlyPerMonth = annualMonthlyEquivalent();

  async function upgrade() {
    if (busy) return;
    setBusy(true);
    const res = await startCheckout(interval);
    if (res.ok) {
      window.location.href = res.url; // hand off to Stripe-hosted Checkout
      return;
    }
    setBusy(false);
    onNotice(
      res.error === "already_subscribed"
        ? "You're already on Pro. Use “Manage billing” to review your subscription."
        : "Couldn't start checkout just now. Please try again in a moment.",
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-nd-border bg-nd-surface p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="nd-hit absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          <X size={16} />
        </button>

        <div className="mb-1 flex items-center gap-2">
          <span className="nd-gradient flex h-7 items-center rounded-md px-2 text-xs font-semibold text-white">
            Pro
          </span>
          <h2 id={titleId} className="text-base font-semibold text-nd-text">
            NoteDrift Pro
          </h2>
        </div>
        <p className="text-sm text-nd-muted">
          Keep <span className="text-nd-text">unlimited cloud canvases</span> and open them on any
          device. Your local canvases are always unlimited and free.
        </p>

        {/* Free vs Pro, cloud-count difference only (no future features promised). */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-nd-border p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-nd-muted">Free</div>
            <div className="mt-1 flex items-center gap-1.5 text-nd-text">
              <Cloud size={15} className="text-nd-muted" /> 3 cloud canvases
            </div>
          </div>
          <div className="rounded-xl border border-nd-accent/40 bg-nd-accent/5 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-nd-accent">Pro</div>
            <div className="mt-1 flex items-center gap-1.5 text-nd-text">
              <Check size={15} className="text-emerald-400" /> Unlimited cloud canvases
            </div>
          </div>
        </div>

        {/* Interval selector */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <IntervalOption
            selected={interval === "monthly"}
            onSelect={() => setInterval("monthly")}
            label="Monthly"
            price={`${money(PRICING.monthly)}/mo`}
          />
          <IntervalOption
            selected={interval === "yearly"}
            onSelect={() => setInterval("yearly")}
            label="Yearly"
            price={`${money(PRICING.annual)}/yr`}
            note={`≈ ${money(yearlyPerMonth)}/mo · save ~${savePct}%`}
          />
        </div>

        <button
          type="button"
          onClick={upgrade}
          disabled={busy}
          className="nd-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Opening checkout…
            </>
          ) : (
            <>Upgrade — {interval === "monthly" ? `${money(PRICING.monthly)}/mo` : `${money(PRICING.annual)}/yr`}</>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-nd-muted">
          Secure checkout by Stripe. Cancel anytime. No free trial.
        </p>
      </div>
    </div>
  );
}

function IntervalOption({
  selected,
  onSelect,
  label,
  price,
  note,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  price: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "rounded-xl border p-3 text-left transition-colors",
        selected
          ? "border-nd-accent bg-nd-accent/10"
          : "border-nd-border hover:bg-white/5",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-nd-text">{label}</span>
        <span
          className={[
            "flex h-4 w-4 items-center justify-center rounded-full border",
            selected ? "border-nd-accent bg-nd-accent text-white" : "border-nd-border",
          ].join(" ")}
        >
          {selected && <Check size={11} />}
        </span>
      </div>
      <div className="mt-1 text-sm text-nd-text">{price}</div>
      {note && <div className="mt-0.5 text-[11px] text-emerald-400">{note}</div>}
    </button>
  );
}
