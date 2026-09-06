import type { Metadata } from "next";
import { getFactoryTool } from "@/lib/tools/factory";
import { ToolFactoryShell } from "@/components/tools/ToolFactoryShell";
import { WordCounter } from "@/components/tools/factory/WordCounter";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://notedrift.com";
const tool = getFactoryTool("word-counter")!;

export const metadata: Metadata = {
  title: tool.seoTitle,
  description: tool.description,
  alternates: { canonical: "/tools/word-counter" },
  openGraph: { title: tool.seoTitle, description: tool.description, type: "website", url: `${SITE}/tools/word-counter` },
};

export default function Page() {
  return (
    <ToolFactoryShell slug="word-counter">
      <WordCounter />
    </ToolFactoryShell>
  );
}
