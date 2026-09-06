"use client";

// A single AdSense unit. Renders the standard <ins class="adsbygoogle"> and calls
// adsbygoogle.push({}) EXACTLY ONCE per mounted instance. Safe against StrictMode
// double-invoke, re-renders, route changes and plan changes:
//   • Renders nothing (and never pushes) unless ads are eligible + a slot exists.
//   • A `mounted` gate keeps SSR/first-render output empty, so no hydration drift.
//   • A ref + try/catch guarantee we never push the same element twice, and any
//     "already have ads" / ad-blocker error is swallowed.
// Google's ad iframe is never touched directly.

import { useEffect, useRef } from "react";
import { adsenseClientId } from "@/lib/ads/config";
import { useAdsEligible } from "./AdsProvider";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({
  slot,
  placement,
  format = "auto",
  responsive = true,
  className,
  style,
}: {
  /** Numeric AdSense slot id. */
  slot: string;
  /** Human placement name, for aria/debugging (e.g. "editor-bottom"). */
  placement?: string;
  /** AdSense data-ad-format. "auto" for in-flow, "horizontal" for the band. */
  format?: "auto" | "horizontal" | "rectangle" | "vertical";
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const eligible = useAdsEligible();
  const client = adsenseClientId();
  const pushed = useRef(false);

  // `eligible` is false during SSR and on the first client render (the provider
  // resolves eligibility only after mount), so no <ins> is ever server-rendered —
  // no separate "mounted" gate is needed to avoid hydration drift.
  const active = eligible && !!client && !!slot;

  useEffect(() => {
    if (!active || pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      /* ad blocker, or element already has an ad — safe to ignore */
    }
  }, [active]);

  if (!active) return null;

  return (
    <ins
      className={`adsbygoogle ${className ?? ""}`.trim()}
      style={{ display: "block", ...style }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive={responsive ? "true" : "false"}
      aria-label={placement ? `Advertisement (${placement})` : "Advertisement"}
    />
  );
}
