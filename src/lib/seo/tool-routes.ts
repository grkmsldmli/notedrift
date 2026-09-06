// The single source of truth for FINISHED, indexable tool routes. The sitemap
// and the SEO guard tests both derive from this list, so a real tool can never be
// in one and missing from the other, and a phantom (unbuilt) route can never be
// indexed. "Index only finished tools" is enforced structurally: a route appears
// here only because it comes from a registry (converters, audio) or is an
// explicitly-listed standalone tool that actually has a page.

import { TOOLS } from "../convert/registry.ts";
import { AUDIO_TOOLS } from "../audio/tools.ts";

export interface ToolRoute {
  readonly path: string;
  readonly slug: string;
  /** The tool's unique SEO <title>. */
  readonly seoTitle: string;
}

/** Finished tools with their own hand-built route/page (not registry-driven).
 *  Add here ONLY when the page ships — never a placeholder. */
export const STANDALONE_TOOL_ROUTES: readonly ToolRoute[] = [
  {
    path: "/tools/edit-pdf",
    slug: "edit-pdf",
    seoTitle: "Edit PDF Online — Free & Private | NoteDrift",
  },
];

/** Every indexable tool route, derived from the registries + standalone list. */
export function allToolRoutes(): ToolRoute[] {
  return [
    ...STANDALONE_TOOL_ROUTES,
    ...TOOLS.map((t) => ({ path: `/tools/${t.slug}`, slug: t.slug, seoTitle: t.seoTitle })),
    ...AUDIO_TOOLS.map((t) => ({ path: `/tools/${t.slug}`, slug: t.slug, seoTitle: t.seoTitle })),
  ];
}
