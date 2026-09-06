import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandHome } from "@/components/nav/HeaderNav";

// The global <body> is overflow:hidden for the editor canvas, so the legal
// section (/privacy, /terms) owns its own full-height scroll container — the same
// pattern the /tools section uses. Route group "(legal)" does not affect URLs.
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="nd-scroll h-dvh overflow-y-auto bg-nd-bg text-nd-text">
      <div className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-nd-border bg-nd-bg/95 px-4 backdrop-blur">
          <BrandHome wordmarkClassName="hidden sm:inline" />
          <Link
            href="/"
            className="nd-hit inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-3 py-1.5 text-sm text-nd-text transition-colors hover:bg-white/5"
          >
            Open NoteDrift <ArrowRight size={15} />
          </Link>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-nd-border px-4 py-6 text-center text-xs text-nd-muted">
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/" className="transition-colors hover:text-nd-text">
              NoteDrift
            </Link>
            <Link href="/tools" className="transition-colors hover:text-nd-text">
              Free Tools
            </Link>
            <Link href="/help" className="transition-colors hover:text-nd-text">
              Help
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-nd-text">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-nd-text">
              Terms
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
