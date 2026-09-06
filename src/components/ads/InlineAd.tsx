"use client";

// An in-flow advertisement for document-style pages (the /tools hub and each
// tool page). Sits in normal page flow between content blocks — never beside a
// clickable control. Renders nothing when ineligible (Pro, loading, ad-free) or
// when its slot isn't configured, so the page layout is unchanged for those users.

import { adsenseSlotTools, adsenseSlotToolPage } from "@/lib/ads/config";
import { useAdsEligible } from "./AdsProvider";
import { AdSlot } from "./AdSlot";

export function InlineAd({
  placement,
  className,
}: {
  placement: "tools" | "tool-page";
  className?: string;
}) {
  const eligible = useAdsEligible();
  const slot = placement === "tools" ? adsenseSlotTools() : adsenseSlotToolPage();
  if (!eligible || !slot) return null;
  return (
    <div className={`my-8 ${className ?? ""}`.trim()}>
      <div className="mb-1 text-center text-[10px] font-medium uppercase tracking-wider text-nd-muted/60">
        Advertisement
      </div>
      <div className="overflow-hidden rounded-xl border border-nd-border/60 bg-nd-surface/30">
        <AdSlot
          slot={slot}
          placement={placement}
          format="auto"
          responsive
          className="block"
          style={{ display: "block", minHeight: 90 }}
        />
      </div>
    </div>
  );
}
