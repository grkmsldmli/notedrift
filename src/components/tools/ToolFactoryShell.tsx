import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { getFactoryTool } from "@/lib/tools/factory";
import { resolveToolLinks } from "@/lib/tools/links";
import { InlineAd } from "@/components/ads/InlineAd";
import { JsonLd } from "@/components/seo/JsonLd";
import { toolBreadcrumb, webApplication } from "@/lib/seo/structured-data";

// Server-rendered shell shared by every Tool Factory page. Lays out the standard
// search-intent structure: H1 + working tool above the fold, a truthful privacy
// note, one in-flow ad (hidden for Pro), a contextual cross-sell, then the
// explanatory content (how-to, about, use cases) and related tools. The
// interactive tool is passed as `children`; everything else derives from the
// registry, so a new tool inherits the whole SEO/monetization mold for free.
export function ToolFactoryShell({ slug, children }: { slug: string; children: ReactNode }) {
  const tool = getFactoryTool(slug);
  if (!tool) return null;
  const related = resolveToolLinks(tool.related);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <JsonLd
        data={webApplication({
          name: `${tool.title} — NoteDrift`,
          description: tool.description,
          path: `/tools/${tool.slug}`,
        })}
      />
      <JsonLd data={toolBreadcrumb(tool.title, `/tools/${tool.slug}`)} />

      <nav className="mb-5 text-xs text-nd-muted">
        <Link href="/tools" className="hover:text-nd-text">
          Free Tools
        </Link>{" "}
        <span aria-hidden>/</span> <span className="text-nd-text">{tool.title}</span>
      </nav>

      <h1 className="text-2xl font-semibold tracking-tight text-nd-text sm:text-3xl">
        {tool.title}
      </h1>
      <p className="mt-2 text-sm text-nd-muted">{tool.tagline}</p>

      {/* Working tool — above the fold. */}
      <div className="mt-6">{children}</div>

      <p className="mt-4 flex items-start gap-1.5 text-xs text-nd-muted">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-nd-accent" />
        {tool.privacyNote}
      </p>

      {/* One in-flow ad, AFTER the tool + privacy note, BEFORE the content. Pro-free. */}
      <InlineAd placement="tool-page" />

      {/* Contextual cross-sell — the next-best action, never a blocking gate. */}
      <Link
        href={tool.crossSell.href}
        className="group mt-2 flex items-center gap-3 rounded-xl border border-nd-accent/40 bg-nd-accent/5 p-4 transition-colors hover:border-nd-accent hover:bg-nd-accent/10"
      >
        <span className="nd-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white">
          <Sparkles size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-nd-text">{tool.crossSell.label}</span>
          <span className="mt-0.5 block text-xs text-nd-muted">{tool.crossSell.sub}</span>
        </span>
        <ArrowRight
          size={16}
          className="shrink-0 text-nd-muted transition-transform group-hover:translate-x-0.5 group-hover:text-nd-accent"
        />
      </Link>

      {/* Explanatory content. */}
      <section className="mt-10 space-y-8 border-t border-nd-border pt-8 text-sm leading-relaxed text-nd-muted">
        <div>
          <h2 className="mb-2 text-base font-semibold text-nd-text">How to use it</h2>
          <ol className="ml-4 list-decimal space-y-1 marker:text-nd-border">
            {tool.howTo.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-nd-text">About this tool</h2>
          {tool.about.map((p) => (
            <p key={p} className="mb-2">
              {p}
            </p>
          ))}
        </div>

        <div>
          <h2 className="mb-2 text-base font-semibold text-nd-text">Common uses</h2>
          <ul className="ml-4 list-disc space-y-1 marker:text-nd-border">
            {tool.useCases.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
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
                href={r.href}
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
