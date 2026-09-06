import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { QrCodeGenerator } from "@/components/tools/factory/QrCodeGenerator";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("qr-code-generator")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/qr-code-generator" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/qr-code-generator` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="qr-code-generator">
      <QrCodeGenerator />
    </ToolFactoryShell>
  );
}
