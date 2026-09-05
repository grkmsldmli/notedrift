import type { NextConfig } from "next";

// Conservative, compatibility-first security headers. These are safe for the
// whole app surface — Fabric canvas, Supabase Auth cookies, Stripe Checkout/Portal
// redirects, Web Audio, the same-origin Sound Meter microphone, the self-hosted
// pdf.js worker, images and fonts. Notably we do NOT add a Content-Security-Policy
// here: a correct CSP for this app needs real deployment observation, so it is
// tracked as post-launch hardening rather than guessed (which would risk breaking
// the canvas, Stripe or Supabase).
const securityHeaders = [
  // Never let the browser MIME-sniff a response into a different type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send only the origin cross-site; full path stays same-origin.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Clickjacking protection: NoteDrift is never meant to be framed by others.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Powerful features: microphone is allowed for our OWN origin (Sound Meter,
  // §22), camera and geolocation are disabled. Others left at browser defaults.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
