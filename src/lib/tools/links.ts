// Resolve a tool slug to a link ({slug, title, href}) across EVERY registry —
// Tool Factory, converters, audio, and the standalone edit-pdf. "Related tools"
// and cross-sells can point anywhere in the catalog, and the SEO guards use this
// to prove no related link is broken. Relative .ts imports keep it node-testable.

import { getTool } from "../convert/registry.ts";
import { getAudioTool } from "../audio/tools.ts";
import { getFactoryTool } from "./factory.ts";

export interface ToolLink {
  slug: string;
  title: string;
  href: string;
}

const STANDALONE: Record<string, string> = { "edit-pdf": "Edit PDF" };

/** The link for a slug, or null if it doesn't resolve to a real tool. */
export function resolveToolLink(slug: string): ToolLink | null {
  const f = getFactoryTool(slug);
  if (f) return { slug, title: f.title, href: `/tools/${slug}` };
  const c = getTool(slug);
  if (c) return { slug, title: c.title, href: `/tools/${slug}` };
  const a = getAudioTool(slug);
  if (a) return { slug, title: a.title, href: `/tools/${slug}` };
  if (STANDALONE[slug]) return { slug, title: STANDALONE[slug], href: `/tools/${slug}` };
  return null;
}

/** Resolve a list of slugs, dropping any that don't exist. */
export function resolveToolLinks(slugs: readonly string[]): ToolLink[] {
  return slugs.map(resolveToolLink).filter((l): l is ToolLink => l !== null);
}
