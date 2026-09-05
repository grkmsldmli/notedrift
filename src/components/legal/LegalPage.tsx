import type { ReactNode } from "react";

// Shared presentation for the legal pages (/privacy, /terms). Server component —
// no client JS. Selectable text (the global body sets user-select:none for the
// canvas, so legal prose opts back in) and a readable measure. Dark, consistent
// with NoteDrift; intentionally not a marketing redesign.

/** NoteDrift's contact address for privacy / support questions. Owner-controlled
 *  (@notedrift.com). Confirm this mailbox is live before launch — see the launch
 *  docs; it is flagged as a USER ACTION REQUIRED. */
export const LEGAL_CONTACT_EMAIL = "support@notedrift.com";

/** When the current legal copy was last revised. */
export const LEGAL_LAST_UPDATED = "September 5, 2026";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl select-text px-4 py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-nd-text sm:text-3xl">
        {title}
      </h1>
      <p className="mt-2 text-xs text-nd-muted">Last updated: {LEGAL_LAST_UPDATED}</p>
      <div className="mt-8 space-y-8 text-sm leading-relaxed text-nd-muted">
        {children}
      </div>
    </article>
  );
}

/** One titled section of a legal document. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-nd-text">{heading}</h2>
      {children}
    </section>
  );
}

/** A tidy bulleted list within a section. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5 marker:text-nd-border">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
