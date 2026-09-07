"use client";

// A dedicated, reserved advertisement region at the BOTTOM of a full-screen app
// shell (the NoteDrift editor and the PDF editor). It is a real flex-layout row,
// NOT an overlay: mount it as the LAST child of a `flex h-dvh flex-col` shell and
// the canvas/content region above it (flex-1) physically gives up the height, so
// the app's existing ResizeObserver re-measures and the canvas never sits under
// the ad. When ineligible (Pro, loading, ad-free) it renders nothing at all — no
// blank placeholder — and the canvas reclaims the full height.
//
// Lifecycle (via Google's data-ad-status on our OWN <ins class="adsbygoogle">):
//   • PENDING (no status yet): the <ins> is mounted at full, non-zero size so
//     Google can make a valid request — but a dark cover sits over it so the user
//     never sees Google's white loading iframe flash on the dark UI.
//   • FILLED: the cover is removed instantly so the real ad is fully visible and
//     never obscured; the band stays exactly as intended.
//   • UNFILLED: collapse our outer band so the canvas/PDF workspace reclaims the
//     height (no blank/white rectangle).
// We never touch Google's iframe, never re-push/refresh, never hide a filled ad.
// If Google never sets the attribute, the cover simply stays (dark, no ad shown)
// and the canvas keeps working — a safe default.

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

  const filled = adStatus === "filled";

  return (
    <aside
      ref={asideRef}
      aria-label="Advertisement"
      className="relative shrink-0 border-t border-nd-border bg-nd-bg"
    >
      {filled && (
        <span className="pointer-events-none absolute left-2.5 top-1 z-10 text-[9px] font-medium uppercase tracking-wider text-nd-muted/60">
          Advertisement
        </span>
      )}
      <div className="relative mx-auto flex h-[62px] w-full max-w-5xl items-center justify-center overflow-hidden px-2 sm:h-[96px]">
        <AdSlot
          slot={slot}
          placement={variant === "editor" ? "editor-bottom" : "tool-page"}
          format="horizontal"
          responsive={false}
          style={{ width: "100%", height: "100%" }}
        />
        {/* Dark cover over the slot until Google reports "filled" — hides the
            white loading iframe. pointer-events-none, and removed on fill so the
            real ad is never obscured or blocked. */}
        {!filled && <div aria-hidden className="pointer-events-none absolute inset-0 bg-nd-bg" />}
      </div>
    </aside>
  );
}
