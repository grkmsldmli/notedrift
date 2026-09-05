// The three audio Free Tools. Self-contained (they are not file converters, so they
// don't belong in the convert registry). Drives the /tools "Audio" section, the
// per-page cross-links, and each route's SEO metadata. Semantic terms are woven into
// the SEO descriptions naturally — never keyword-stuffed into visible UI.

export interface AudioTool {
  slug: string;
  title: string;
  /** One-line blurb for cards + under the page title. */
  tagline: string;
  seoTitle: string;
  seoDescription: string;
}

export const AUDIO_TOOLS: readonly AudioTool[] = [
  {
    slug: "sound-meter",
    title: "Sound Meter",
    tagline: "Check the approximate sound level around you.",
    seoTitle: "Sound Meter Online — Check Noise Level | NoteDrift",
    seoDescription:
      "Measure the approximate sound level around you with your microphone. A browser sound meter and decibel meter (noise / dB / sound level meter) that runs locally — audio is not uploaded.",
  },
  {
    slug: "tap-bpm",
    title: "Tap BPM",
    tagline: "Tap along with the beat to calculate BPM.",
    seoTitle: "Tap BPM — BPM Counter & Calculator | NoteDrift",
    seoDescription:
      "Tap along with a beat to find its tempo. A free BPM counter and calculator — a tempo finder for beats per minute — that runs in your browser.",
  },
  {
    slug: "metronome",
    title: "Metronome",
    tagline: "Set a tempo and keep a steady beat.",
    seoTitle: "Online Metronome — Free BPM Click | NoteDrift",
    seoDescription:
      "A free online metronome with an accurate BPM click, accent, and tap tempo. A practice metronome for any tempo, right in your browser.",
  },
];

export function getAudioTool(slug: string): AudioTool | undefined {
  return AUDIO_TOOLS.find((t) => t.slug === slug);
}

export function relatedAudioTools(slug: string): AudioTool[] {
  return AUDIO_TOOLS.filter((t) => t.slug !== slug);
}
