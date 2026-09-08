import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_DESCRIPTION =
  "A blank space for whatever's on your mind. An instant, local-first infinite canvas — no login, no clutter.";

// One EXPLICIT social share image for every platform (X, LinkedIn, Slack,
// iMessage, Facebook). We point og:image and twitter:image at a deterministic,
// stable, un-hashed route (/social-card) instead of relying on Next's automatic
// metadata-image discovery, which emits an opaque content-hashed URL that some
// crawlers (notably X) render inconsistently. metadataBase makes these absolute.
const SOCIAL_IMAGE = {
  url: "/social-card",
  width: 1200,
  height: 630,
  alt: "NoteDrift — Open. Think. Create.",
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com",
  ),
  title: "NoteDrift — Open. Think. Create.",
  description: SITE_DESCRIPTION,
  applicationName: "NoteDrift",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "NoteDrift",
    title: "NoteDrift — Open. Think. Create.",
    description: SITE_DESCRIPTION,
    url: "/",
    images: [SOCIAL_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "NoteDrift — Open. Think. Create.",
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0b10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Extend under notches/rounded corners so env(safe-area-inset-*) is meaningful.
  // User scaling is intentionally NOT disabled — the page stays accessible; the
  // canvas owns its own gestures via touch-action instead.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
