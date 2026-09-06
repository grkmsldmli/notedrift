"use client";

// Compact NoteDrift Pro conversion sheet. NOT a pricing page — a small dismissible
// modal. Every benefit is rendered from SHIPPED_PRO_BENEFITS (the truth source), so
// it can never advertise an unbuilt feature. Prices derive from canonical PRICING;
// the yearly saving is computed, never hardcoded. No fake original price, no
// countdown, no fabricated scarcity.

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  PRICING,
  SHIPPED_PRO_BENEFITS,
  annualMonthlyEquivalent,
  annualSavingsPercent,
} from "@/lib/plans";
import { startCheckout } from "@/lib/billing/client";
import type { BillingInterval } from "@/lib/billing/types";

const money = (n: number) => `$${n.toFixed(2)}`;

export function UpgradeDialog({
  onClose,
  onNotice,
  atLimit = false,
}: {
  onClose: () => void;
  onNotice: (msg: string) => void;
  /** Opened at the Free 3-cloud-canvas limit — leads with an earned headline. */
  atLimit?: boolean;
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
  const price = interval === "monthly" ? `${money(PRICING.monthly)}/month` : `${money(PRICING.annual)}/year`;

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

        {atLimit && (
          <p className="mb-3 rounded-lg bg-nd-accent/10 px-3 py-2 text-sm font-medium text-nd-text">
            You&apos;ve used your 3 free cloud canvases.
          </p>
        )}

        <span className="inline-flex items-center rounded-full border border-nd-accent/40 bg-nd-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-nd-accent">
          Founding price
        </span>
        <h2 id={titleId} className="mt-2 text-lg font-semibold text-nd-text">
          NoteDrift Pro
        </h2>
        <p className="mt-1 text-sm text-nd-muted">Keep every canvas, on every device.</p>

        <ul className="mt-4 space-y-2">
          {SHIPPED_PRO_BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-nd-text">
              <Check size={16} className="mt-0.5 shrink-0 text-emerald-400" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {/* Interval selector — annual recommended. */}
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
            note={`${money(yearlyPerMonth)}/mo`}
            badge={`Save ${savePct}%`}
          />
        </div>

        <button
          type="button"
          onClick={upgrade}
          disabled={busy}
          className="nd-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Opening checkout…
            </>
          ) : (
            <>Get Pro — {price}</>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-nd-muted">
          Secure checkout · Cancel anytime ·{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="hover:text-nd-text hover:underline">
            Terms
          </a>{" "}
          ·{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-nd-text hover:underline">
            Privacy
          </a>
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
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  price: string;
  note?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "relative rounded-xl border p-3 text-left transition-colors",
        selected ? "border-nd-accent bg-nd-accent/10" : "border-nd-border hover:bg-white/5",
      ].join(" ")}
    >
      {badge && (
        <span className="absolute -top-2 right-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
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
      {note && <div className="mt-0.5 text-[11px] text-nd-muted">{note}</div>}
    </button>
  );
}
