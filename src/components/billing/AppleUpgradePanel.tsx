"use client";

// Native iOS Pro purchase UI (StoreKit 2). Shows Apple's LOCALIZED product names
// and prices, drives the purchase/restore through the platform seam, and grants
// Pro only after server verification (purchaseApplePro/restoreApplePro reconcile
// with /api/billing/apple/verify). No Stripe, no web prices, no external CTA.

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import {
  getAppleProducts,
  purchaseApplePro,
  restoreApplePro,
} from "@/lib/billing/apple/client";
import { appleProductIdFor } from "@/lib/billing/apple/products";
import type { NativeProduct } from "@/lib/billing/native";
import type { BillingInterval } from "@/lib/billing/types";

export function AppleUpgradePanel({
  onClose,
  onNotice,
}: {
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const { user, refreshBilling } = useAuth();
  const [products, setProducts] = useState<NativeProduct[] | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("yearly");
  const [busy, setBusy] = useState<null | "buy" | "restore">(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const list = await getAppleProducts();
      if (active) setProducts(list);
    })();
    return () => {
      active = false;
    };
  }, []);

  const monthly = products?.find((p) => p.interval === "monthly") ?? null;
  const yearly = products?.find((p) => p.interval === "yearly") ?? null;
  const selected = interval === "monthly" ? monthly : yearly;
  const unavailable = products !== null && products.length === 0;

  async function buy() {
    if (busy) return;
    if (!user) {
      onNotice("Sign in first, then buy NoteDrift Pro.");
      return;
    }
    const productId = selected?.id ?? appleProductIdFor(interval);
    setBusy("buy");
    const res = await purchaseApplePro(productId);
    setBusy(null);
    if (res.ok) {
      await refreshBilling();
      onClose();
      return;
    }
    if (res.reason === "cancelled") return; // user backed out — no message
    if (res.reason === "not_signed_in") {
      onNotice("Sign in first, then buy NoteDrift Pro.");
      return;
    }
    onNotice("Couldn't complete the purchase. Please try again.");
  }

  async function restore() {
    if (busy) return;
    if (!user) {
      onNotice("Sign in first to restore your purchases.");
      return;
    }
    setBusy("restore");
    const res = await restoreApplePro();
    setBusy(null);
    if (res.ok) {
      await refreshBilling();
      onNotice("Purchases restored.");
      onClose();
      return;
    }
    if (res.reason === "no_subscription") {
      onNotice("No active NoteDrift Pro subscription found.");
      return;
    }
    onNotice("Couldn't restore purchases right now.");
  }

  return (
    <div className="mt-4">
      {!user && (
        <p className="mb-3 rounded-lg bg-nd-accent/10 px-3 py-2 text-[13px] text-nd-text">
          Sign in with your email to buy or restore Pro on this device.
        </p>
      )}

      {products === null ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-nd-border py-6 text-sm text-nd-muted">
          <Loader2 size={16} className="animate-spin" /> Loading plans…
        </div>
      ) : unavailable ? (
        <div className="rounded-xl border border-nd-border bg-nd-surface-2 p-4 text-sm text-nd-muted">
          Subscriptions aren&apos;t available right now. If you already have Pro, try
          Restore Purchases below.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <AppleOption
            label="Monthly"
            product={monthly}
            selected={interval === "monthly"}
            onSelect={() => setInterval("monthly")}
          />
          <AppleOption
            label="Yearly"
            product={yearly}
            selected={interval === "yearly"}
            onSelect={() => setInterval("yearly")}
            badge="Best value"
          />
        </div>
      )}

      {!unavailable && (
        <button
          type="button"
          onClick={buy}
          disabled={busy !== null || !user || products === null}
          className="nd-gradient mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy === "buy" ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Processing…
            </>
          ) : (
            <>Get Pro{selected ? ` — ${selected.displayPrice}` : ""}</>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={restore}
        disabled={busy !== null}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-nd-border py-2 text-sm text-nd-text transition-colors hover:bg-white/5 disabled:opacity-60"
      >
        {busy === "restore" ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Restoring…
          </>
        ) : (
          <>Restore Purchases</>
        )}
      </button>

      <p className="mt-2 text-center text-[11px] text-nd-muted">
        Billed through your Apple ID · Manage or cancel anytime in the App Store
      </p>
    </div>
  );
}

function AppleOption({
  label,
  product,
  selected,
  onSelect,
  badge,
}: {
  label: string;
  product: NativeProduct | null;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!product}
      className={`relative rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
        selected
          ? "border-nd-accent/60 bg-nd-accent/[0.08]"
          : "border-nd-border hover:bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-nd-muted">
          {label}
        </span>
        {selected && <Check size={13} className="text-nd-accent" />}
      </div>
      <div className="mt-1 text-sm font-semibold text-nd-text">
        {product ? product.displayPrice : "—"}
      </div>
      {badge && product && <div className="mt-0.5 text-[11px] text-nd-accent">{badge}</div>}
    </button>
  );
}
