import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { TOOLS, getTool, relatedTools } from "@/lib/convert/registry";
import { ToolConverter } from "@/components/tools/ToolConverter";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  return {
    title: tool.seoTitle,
    description: tool.description,
    alternates: { canonical: `/tools/${tool.slug}` },
    openGraph: {
      title: tool.seoTitle,
      description: tool.description,
      type: "website",
      url: `${SITE}/tools/${tool.slug}`,
    },
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const related = relatedTools(tool);

  const ld = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: `${tool.title} — NoteDrift`,
    description: tool.description,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any (web browser)",
    url: `${SITE}/tools/${tool.slug}`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isAccessibleForFree: true,
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      {/* Structured data (own content, not user input). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />

      <nav className="mb-5 text-xs text-nd-muted">
        <Link href="/tools" className="hover:text-nd-text">
          Free Tools
        </Link>{" "}
        <span aria-hidden>/</span> <span className="text-nd-text">{tool.title}</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight text-nd-text sm:text-3xl">
        {tool.title}
      </h1>
      <p className="mt-2 text-sm text-nd-muted">{tool.description}</p>

      <div className="mt-6">
        <ToolConverter tool={tool} />
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-nd-muted">
        <ShieldCheck size={14} className="text-nd-accent" />
        Files stay on your device. NoteDrift processes this file in your browser —
        nothing is uploaded.
      </p>

      <section className="mt-10 border-t border-nd-border pt-6 text-sm text-nd-muted">
        <h2 className="mb-2 text-base font-semibold text-nd-text">
          How it works
        </h2>
        <p>
          Choose or drop a {tool.acceptLabel} file above. It&apos;s read straight
          into your browser&apos;s memory, converted to{" "}
          {tool.outputExt.toUpperCase()} on this page, and offered back to you as a
          download. No account is needed and the file never leaves your device.
        </p>
      </section>

      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-nd-muted">
            Related tools
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/tools/${r.slug}`}
                className="group flex items-center justify-between gap-2 rounded-lg border border-nd-border bg-nd-surface/50 px-3 py-2.5 text-sm text-nd-text transition-colors hover:border-nd-accent/50 hover:bg-nd-surface"
              >
                <span className="truncate">{r.title}</span>
                <ArrowRight
                  size={14}
                  className="shrink-0 text-nd-muted transition-colors group-hover:text-nd-accent"
                />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
