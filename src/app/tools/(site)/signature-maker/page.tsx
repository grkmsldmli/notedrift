import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { SignatureMaker } from "@/components/tools/factory/SignatureMaker";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("signature-maker")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/signature-maker" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/signature-maker` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="signature-maker">
      <SignatureMaker />
    </ToolFactoryShell>
  );
}
