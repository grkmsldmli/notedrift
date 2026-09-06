"use client";

// A dedicated, reserved advertisement region at the BOTTOM of a full-screen app
// shell (the NoteDrift editor and the PDF editor). It is a real flex-layout row,
// NOT an overlay: mount it as the LAST child of a `flex h-dvh flex-col` shell and
// the canvas/content region above it (flex-1) physically gives up the height, so
// the app's existing ResizeObserver re-measures and the canvas never sits under
// the ad. When ineligible (Pro, loading, ad-free) it renders nothing at all — no
// blank placeholder — and the canvas reclaims the full height.
//
// The band mounts at full height (non-zero) so Google can make a valid ad request.
// A MutationObserver watches OUR OWN <ins class="adsbygoogle"> for the ad status
// Google sets:
//   • data-ad-status="filled"   → keep the band exactly as intended.
//   • data-ad-status="unfilled" → collapse the band so the canvas reclaims the
//     height (no giant blank rectangle). We only touch our own container — never
//     Google's iframe, and we never re-push/refresh the ad.
// If Google never sets the attribute, the band stays visible (safe default).

import { useEffect, useRef, useState } from "react";
import { adsenseSlotEditorBottom, adsenseSlotToolPage } from "@/lib/ads/config";
import { useAdsEligible } from "./AdsProvider";
import { AdSlot } from "./AdSlot";

export function BottomAdBand({ variant }: { variant: "editor" | "tool-page" }) {
  const eligible = useAdsEligible();
  const slot = variant === "editor" ? adsenseSlotEditorBottom() : adsenseSlotToolPage();
  const asideRef = useRef<HTMLElement>(null);
  const [adStatus, setAdStatus] = useState<"filled" | "unfilled" | null>(null);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;
    const read = () => {
      const ins = aside.querySelector("ins.adsbygoogle");
      const st = ins?.getAttribute("data-ad-status");
      if (st === "filled" || st === "unfilled") setAdStatus(st);
    };
    read(); // catch a status already set before we attached
    const mo = new MutationObserver(read);
    mo.observe(aside, {
      subtree: true,
      childList: true, // the <ins> is inserted after mount
      attributes: true,
      attributeFilter: ["data-ad-status"],
    });
    return () => mo.disconnect();
  }, [eligible, slot]);

  if (!eligible || !slot) return null;
  // Google requested and returned no ad — reclaim the height for the canvas.
  if (adStatus === "unfilled") return null;

  return (
    <aside
      ref={asideRef}
      aria-label="Advertisement"
      className="relative shrink-0 border-t border-nd-border bg-nd-bg"
    >
      <span className="pointer-events-none absolute left-2.5 top-1 z-10 text-[9px] font-medium uppercase tracking-wider text-nd-muted/60">
        Advertisement
      </span>
      <div className="mx-auto flex h-[62px] w-full max-w-5xl items-center justify-center overflow-hidden px-2 sm:h-[96px]">
        <AdSlot
          slot={slot}
          placement={variant === "editor" ? "editor-bottom" : "tool-page"}
          format="horizontal"
          responsive={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </aside>
  );
}
