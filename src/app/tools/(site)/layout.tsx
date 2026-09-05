import type { ReactNode } from "react";
import Link from "next/link";
import { ToolsHeader } from "@/components/tools/ToolsHeader";

// The global <body> is overflow:hidden for the editor canvas, so the tools
// section owns its own full-height scroll container.
export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="nd-scroll h-dvh overflow-y-auto bg-nd-bg text-nd-text">
      <div className="flex min-h-full flex-col">
        <ToolsHeader />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-nd-border px-4 py-6 text-center text-xs text-nd-muted">
          <p>Files stay on your device — every conversion runs in your browser.</p>
          <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/" className="text-nd-accent hover:underline">
              NoteDrift
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
