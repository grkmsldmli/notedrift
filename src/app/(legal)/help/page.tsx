import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PRICING } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Help & Shortcuts | NoteDrift",
  description:
    "Get started with NoteDrift: tools, keyboard shortcuts, gestures, cloud sync, and Free vs Pro.",
  alternates: { canonical: "/help" },
};

const money = (n: number) => `$${n.toFixed(2)}`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-nd-text">{title}</h2>
      {children}
    </section>
  );
}

function Keys({ k, action }: { k: string; action: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-nd-muted">{action}</span>
      <kbd className="shrink-0 rounded-md border border-nd-border bg-nd-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-nd-text">
        {k}
      </kbd>
    </div>
  );
}

export default function HelpPage() {
  return (
    <article className="mx-auto w-full max-w-3xl select-text px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-nd-text sm:text-3xl">
        Help &amp; shortcuts
      </h1>
      <p className="mt-2 text-sm text-nd-muted">
        NoteDrift is instant digital paper. Open it and start — no setup needed.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-nd-muted">
        <Section title="Quick start">
          <ul className="ml-4 list-disc space-y-1.5 marker:text-nd-border">
            <li>Draw or type anywhere on the page.</li>
            <li>Pick a tool from the toolbar — a bottom dock on phones, a left rail on desktop.</li>
            <li>Open <span className="text-nd-text">All Tools</span> (the grid icon) for shapes, sticky notes, images and more.</li>
            <li>Pages save on your device automatically.</li>
          </ul>
        </Section>

        <Section title="Tools">
          <ul className="ml-4 list-disc space-y-1.5 marker:text-nd-border">
            <li><span className="text-nd-text">Draw</span> — pen, pencil, marker, highlighter, brush, technical.</li>
            <li><span className="text-nd-text">Text &amp; sticky notes</span> for writing and labels.</li>
            <li><span className="text-nd-text">Shapes</span> — basic shapes plus flowchart blocks; lines and arrows.</li>
            <li><span className="text-nd-text">Images</span> — insert, paste, or drag &amp; drop; crop and flip.</li>
            <li><span className="text-nd-text">Eraser</span> — erase whole objects or just ink strokes.</li>
            <li><span className="text-nd-text">Lasso, Select, Hand</span> — select, arrange, and pan the canvas.</li>
            <li><span className="text-nd-text">Mind maps</span> — press Tab/Enter on a node to branch.</li>
          </ul>
        </Section>

        <Section title="Keyboard shortcuts">
          <div className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
            <div>
              <Keys k="V" action="Select" />
              <Keys k="P" action="Pen" />
              <Keys k="T" action="Text" />
              <Keys k="R" action="Rectangle" />
              <Keys k="L" action="Line" />
              <Keys k="A" action="Arrow" />
              <Keys k="N" action="Sticky note" />
              <Keys k="E" action="Eraser" />
              <Keys k="Q" action="Lasso" />
              <Keys k="H" action="Hand (pan)" />
            </div>
            <div>
              <Keys k="Ctrl/⌘ Z" action="Undo" />
              <Keys k="Ctrl/⌘ ⇧ Z" action="Redo" />
              <Keys k="Ctrl/⌘ D" action="Duplicate" />
              <Keys k="Ctrl/⌘ G" action="Group / ungroup" />
              <Keys k="Ctrl/⌘ A" action="Select all" />
              <Keys k="Ctrl/⌘ +/−/0" action="Zoom in / out / reset" />
              <Keys k="Del" action="Delete selection" />
              <Keys k="Space + drag" action="Pan" />
              <Keys k="Tab / Enter" action="Mind-map branch" />
              <Keys k="Double-click title" action="Rename page" />
            </div>
          </div>
        </Section>

        <Section title="Cloud &amp; sync">
          <p>
            Signing in is optional. Your canvases stay on this device until you
            choose <span className="text-nd-text">Save to cloud</span> — then you
            can open them on your other devices. Free keeps up to 3 cloud canvases;
            Pro keeps unlimited. Local canvases are always unlimited.
          </p>
        </Section>

        <Section title="Free vs Pro">
          <ul className="ml-4 list-disc space-y-1.5 marker:text-nd-border">
            <li><span className="text-nd-text">Free</span> — the full editor, unlimited local canvases, PNG export, and 3 cloud canvases.</li>
            <li>
              <span className="text-nd-text">Pro</span> ({money(PRICING.monthly)}/mo or {money(PRICING.annual)}/yr) — unlimited cloud canvases,
              open on any device.
            </li>
          </ul>
        </Section>

        <Section title="More">
          <p>
            Free browser tools (image &amp; PDF converters, a PDF editor, audio
            tools) live at{" "}
            <Link href="/tools" className="text-nd-accent hover:underline">
              /tools
            </Link>
            . See our{" "}
            <Link href="/privacy" className="text-nd-accent hover:underline">
              Privacy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-nd-accent hover:underline">
              Terms
            </Link>
            .
          </p>
        </Section>
      </div>
    </article>
  );
}
