import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { getAudioTool, relatedAudioTools } from "@/lib/audio/tools";

// Server-rendered wrapper shared by every audio tool page: breadcrumb, title,
// one-line tagline, the interactive tool, a privacy note, and cross-links. Keeps
// the three pages DRY and consistent with the existing /tools pages.
export function AudioToolShell({ slug, children }: { slug: string; children: ReactNode }) {
  const tool = getAudioTool(slug);
  if (!tool) return null;
  const related = relatedAudioTools(slug);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
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

      <div className="mt-6">{children}</div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-nd-muted">
        <ShieldCheck size={14} className="text-nd-accent" />
        Runs in your browser — nothing is uploaded.
      </p>

      {related.length > 0 && (
        <section className="mt-10 border-t border-nd-border pt-6">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-nd-muted">
            Related tools
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
