import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NavArrows, BrandHome } from "@/components/nav/HeaderNav";

export function ToolsHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-nd-border bg-nd-bg/95 px-4 backdrop-blur">
      <div className="flex min-w-0 items-center gap-1.5">
        <NavArrows />
        <BrandHome wordmarkClassName="hidden sm:inline" />
        <Link
          href="/tools"
          className="hidden text-xs text-nd-muted transition-colors hover:text-nd-text sm:inline"
        >
          Free Tools
        </Link>
      </div>
      <Link
        href="/"
        className="nd-hit inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-3 py-1.5 text-sm text-nd-text transition-colors hover:bg-white/5"
      >
        Open NoteDrift <ArrowRight size={15} />
      </Link>
    </header>
  );
}
