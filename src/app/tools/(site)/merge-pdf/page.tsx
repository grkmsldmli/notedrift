import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { MergePdf } from "@/components/tools/factory/MergePdf";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("merge-pdf")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/merge-pdf" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/merge-pdf` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="merge-pdf">
      <MergePdf />
    </ToolFactoryShell>
  );
}
