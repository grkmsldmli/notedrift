import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { CropImage } from "@/components/tools/factory/CropImage";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("crop-image")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/crop-image" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/crop-image` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="crop-image">
      <CropImage />
    </ToolFactoryShell>
  );
}
