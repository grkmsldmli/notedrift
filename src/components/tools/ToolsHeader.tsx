import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/editor/Logo";

export function ToolsHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-nd-border bg-nd-bg/95 px-4 backdrop-blur">
      <Link href="/tools" className="flex items-center gap-2">
        <Logo size={24} />
        <span className="text-[15px] font-semibold tracking-tight text-nd-text">
          NoteDrift
        </span>
        <span className="hidden text-xs text-nd-muted sm:inline">Free Tools</span>
      </Link>
      <Link
        href="/"
        className="nd-hit inline-flex items-center gap-1.5 rounded-lg border border-nd-border px-3 py-1.5 text-sm text-nd-text transition-colors hover:bg-white/5"
      >
        Open NoteDrift <ArrowRight size={15} />
      </Link>
    </header>
  );
}
