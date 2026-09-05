import type { Metadata } from "next";
import { getAudioTool } from "@/lib/audio/tools";
import { AudioToolShell } from "@/components/tools/audio/AudioToolShell";
import { SoundMeter } from "@/components/tools/audio/SoundMeter";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getAudioTool("sound-meter")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.seoDescription,
  alternates: { canonical: "/tools/sound-meter" },
  openGraph: {
    title: tool.seoTitle,
    description: tool.seoDescription,
    type: "website",
    url: `${SITE}/tools/sound-meter`,
  },
};

export default function SoundMeterPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${tool.title} — NoteDrift`,
    description: tool.seoDescription,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (web browser)",
    url: `${SITE}/tools/sound-meter`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isAccessibleForFree: true,
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <AudioToolShell slug="sound-meter">
        <SoundMeter />
      </AudioToolShell>
    </>
  );
}
