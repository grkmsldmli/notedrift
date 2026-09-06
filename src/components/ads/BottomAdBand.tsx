"use client";

// A dedicated, reserved advertisement region at the BOTTOM of a full-screen app
// shell (the NoteDrift editor and the PDF editor). It is a real flex-layout row,
// NOT an overlay: mount it as the LAST child of a `flex h-dvh flex-col` shell and
// the canvas/content region above it (flex-1) physically gives up the height, so
// the app's existing ResizeObserver re-measures and the canvas never sits under
// the ad. When ineligible (Pro, loading, ad-free) it renders nothing at all — no
// blank placeholder — and the canvas reclaims the full height.

import { adsenseSlotEditorBottom, adsenseSlotToolPage } from "@/lib/ads/config";
import { useAdsEligible } from "./AdsProvider";
import { AdSlot } from "./AdSlot";

export function BottomAdBand({ variant }: { variant: "editor" | "tool-page" }) {
  const eligible = useAdsEligible();
  const slot = variant === "editor" ? adsenseSlotEditorBottom() : adsenseSlotToolPage();
  if (!eligible || !slot) return null;
  return (
    <aside
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
