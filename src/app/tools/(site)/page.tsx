import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  toolsInCategory,
} from "@/lib/convert/registry";
import { AUDIO_TOOLS } from "@/lib/audio/tools";

export const metadata: Metadata = {
  title: "Free File Tools — Convert Images & PDFs in Your Browser | NoteDrift",
  description:
    "Free, private file tools: convert PNG, JPG, WebP, SVG, PDF and more. No signup. Files stay on your device.",
  alternates: { canonical: "/tools" },
  openGraph: {
    title: "NoteDrift Free File Tools",
    description:
      "Convert images and PDFs right in your browser. Free, no signup, files never leave your device.",
    type: "website",
  },
};

export default function ToolsLanding() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      <section className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-nd-text sm:text-4xl">
          Convert files. <span className="nd-gradient-text">Free.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-nd-muted sm:text-base">
          Fast browser-based file tools. No signup, and your files stay on your
          device — every conversion runs right here in your browser.
        </p>
      </section>

      <div className="mt-8">
        <Link
          href="/tools/edit-pdf"
          className="group flex items-center gap-4 rounded-2xl border border-nd-accent/40 bg-nd-surface/60 p-5 transition-colors hover:border-nd-accent hover:bg-nd-surface"
        >
          <span className="nd-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
            <FileText size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-nd-text">Edit PDF</span>
              <span className="rounded-full bg-nd-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-nd-accent">
                New
              </span>
            </span>
            <span className="mt-0.5 block text-xs text-nd-muted">
              Add text, highlight, draw, sign, add images, and arrange pages — free, right in your browser.
            </span>
          </span>
          <ArrowRight
            size={18}
            className="shrink-0 text-nd-muted transition-transform group-hover:translate-x-0.5 group-hover:text-nd-accent"
          />
        </Link>
      </div>

      <div className="mt-12 space-y-10">
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-nd-muted">
            Audio
          </h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIO_TOOLS.map((t) => (
              <Link
                key={t.slug}
                href={`/tools/${t.slug}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-nd-border bg-nd-surface/50 px-4 py-3.5 transition-colors hover:border-nd-accent/50 hover:bg-nd-surface"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-nd-text">{t.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-nd-muted">{t.tagline}</span>
                </span>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-nd-muted transition-transform group-hover:translate-x-0.5 group-hover:text-nd-accent"
                />
              </Link>
            ))}
          </div>
        </section>

        {CATEGORY_ORDER.map((cat) => {
          const tools = toolsInCategory(cat);
          if (tools.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-nd-muted">
                {CATEGORY_LABELS[cat]}
              </h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((t) => (
                  <Link
                    key={t.slug}
                    href={`/tools/${t.slug}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-nd-border bg-nd-surface/50 px-4 py-3.5 transition-colors hover:border-nd-accent/50 hover:bg-nd-surface"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-nd-text">
                        {t.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-nd-muted">
                        {t.acceptLabel} → {t.outputExt.toUpperCase()}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      className="shrink-0 text-nd-muted transition-transform group-hover:translate-x-0.5 group-hover:text-nd-accent"
                    />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
