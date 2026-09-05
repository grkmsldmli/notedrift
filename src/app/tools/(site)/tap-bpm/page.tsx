import type { Metadata } from "next";
import { getAudioTool } from "@/lib/audio/tools";
import { AudioToolShell } from "@/components/tools/audio/AudioToolShell";
import { TapBpm } from "@/components/tools/audio/TapBpm";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getAudioTool("tap-bpm")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.seoDescription,
  alternates: { canonical: "/tools/tap-bpm" },
  openGraph: {
    title: tool.seoTitle,
    description: tool.seoDescription,
    type: "website",
    url: `${SITE}/tools/tap-bpm`,
  },
};

export default function TapBpmPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${tool.title} — NoteDrift`,
    description: tool.seoDescription,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (web browser)",
    url: `${SITE}/tools/tap-bpm`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isAccessibleForFree: true,
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <AudioToolShell slug="tap-bpm">
        <TapBpm />
      </AudioToolShell>
    </>
  );
}
