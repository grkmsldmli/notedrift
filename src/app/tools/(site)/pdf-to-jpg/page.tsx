import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { PdfToJpg } from "@/components/tools/factory/PdfToJpg";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("pdf-to-jpg")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/pdf-to-jpg" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/pdf-to-jpg` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="pdf-to-jpg">
      <PdfToJpg />
    </ToolFactoryShell>
  );
}
