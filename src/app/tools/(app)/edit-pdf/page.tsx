import type { Metadata } from "next";
import { PdfWorkspace } from "@/components/pdf/PdfWorkspace";

// NOINDEX for now: this is the P1 viewer shell. It gets indexed once the actual
// editing capability ships (a later phase), so search results never point at a
// half-built feature.
export const metadata: Metadata = {
  title: "Edit PDF — NoteDrift",
  description:
    "Open and page through any PDF right in your browser. Private and instant — nothing is uploaded.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/tools/edit-pdf" },
};

export default function EditPdfPage() {
  return <PdfWorkspace />;
}
