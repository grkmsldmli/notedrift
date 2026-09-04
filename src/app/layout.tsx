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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com",
  ),
  title: "NoteDrift — Open. Think. Create.",
  description:
    "A blank space for whatever's on your mind. An instant, local-first infinite canvas — no login, no clutter.",
  applicationName: "NoteDrift",
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
