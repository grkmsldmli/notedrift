import { ImageResponse } from "next/og";

// NoteDrift social share card (Open Graph + Twitter). Generated with next/og at
// build time (statically optimized), so link previews on X, Slack, iMessage,
// LinkedIn, Facebook, etc. get a real 1200x630 branded card. Edit here — no binary
// asset to regenerate. The default font is Geist (bundled by next/og), matching
// the site. twitter-image.tsx re-exports this so both use one design.

export const alt = "NoteDrift — Open. Think. Create.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand mark: the gradient rounded-square + wave "N" from components/editor/Logo.
function Mark({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="ogmark" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b8cff" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="3.2" y="3.2" width="25.6" height="25.6" rx="8" fill="rgba(124,140,255,0.12)" stroke="url(#ogmark)" strokeWidth="2" />
      <path
        d="M8.6 22.4 C 9.1 13.4, 11.5 12.3, 13.6 15.9 C 14.9 18.1, 16 18.3, 17.1 16 C 18.6 12.8, 20.3 11.1, 22.4 10"
        stroke="url(#ogmark)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0b10",
          position: "relative",
          fontFamily: "Geist",
        }}
      >
        {/* Ambient blue + purple glows for a premium dark aesthetic. */}
        <div
          style={{
            position: "absolute",
            top: -220,
            left: -160,
            width: 760,
            height: 760,
            display: "flex",
            backgroundImage: "radial-gradient(circle, rgba(91,140,255,0.38), rgba(10,11,16,0) 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -240,
            right: -160,
            width: 820,
            height: 820,
            display: "flex",
            backgroundImage: "radial-gradient(circle, rgba(168,85,247,0.34), rgba(10,11,16,0) 60%)",
          }}
        />

        {/* Mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <Mark px={128} />
          <div style={{ display: "flex", marginLeft: 28, fontSize: 108, letterSpacing: -3 }}>
            <span style={{ color: "#ffffff" }}>Note</span>
            <span style={{ color: "#a78bfa" }}>Drift</span>
          </div>
        </div>

        {/* Tagline */}
        <div style={{ display: "flex", marginTop: 30, fontSize: 46, letterSpacing: -0.5 }}>
          <span style={{ color: "#d7dae1" }}>Open.&#8202;</span>
          <span style={{ color: "#8b9dff" }}>&#8194;Think.</span>
          <span style={{ color: "#d7dae1" }}>&#8194;Create.</span>
        </div>

        {/* Subtext */}
        <div style={{ display: "flex", marginTop: 20, fontSize: 29, color: "#8b8f9a" }}>
          Instant digital paper + free browser tools
        </div>

        <div style={{ position: "absolute", bottom: 44, display: "flex", fontSize: 23, color: "rgba(255,255,255,0.4)" }}>
          notedrift.com
        </div>
      </div>
    ),
    { ...size },
  );
}
