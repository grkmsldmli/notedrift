import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { ExtractPdfPages } from "@/components/tools/factory/ExtractPdfPages";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("extract-pdf-pages")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/extract-pdf-pages" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/extract-pdf-pages` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="extract-pdf-pages">
      <ExtractPdfPages />
    </ToolFactoryShell>
  );
}
