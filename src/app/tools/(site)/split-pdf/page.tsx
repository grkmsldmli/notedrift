import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { SplitPdf } from "@/components/tools/factory/SplitPdf";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("split-pdf")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/split-pdf" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/split-pdf` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="split-pdf">
      <SplitPdf />
    </ToolFactoryShell>
  );
}
