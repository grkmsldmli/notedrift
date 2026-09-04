import type { Metadata } from "next";
import { PdfWorkspace } from "@/components/pdf/PdfWorkspace";

const DESCRIPTION =
  "Add text, highlight, draw, sign, add images, and rotate, reorder or delete PDF pages — directly in your browser. Free, no signup, and your files never leave your device.";

export const metadata: Metadata = {
  title: "Edit PDF Online — Free & Private | NoteDrift",
  description: DESCRIPTION,
  alternates: { canonical: "/tools/edit-pdf" },
  openGraph: {
    title: "Edit PDF Online — Free & Private",
    description: DESCRIPTION,
    type: "website",
    url: "/tools/edit-pdf",
  },
  twitter: {
    card: "summary_large_image",
    title: "Edit PDF Online — Free & Private | NoteDrift",
    description: DESCRIPTION,
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "NoteDrift PDF Editor",
  url: "https://notedrift.com/tools/edit-pdf",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web browser",
  browserRequirements: "Requires a modern web browser",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description: DESCRIPTION,
  featureList: [
    "Add text to a PDF",
    "Highlight",
    "Draw with a pen",
    "Rectangles, ellipses, lines and arrows",
    "Add images",
    "Whiteout / cover content",
    "Add a signature",
    "Rotate, reorder, duplicate and delete pages",
    "Download the edited PDF",
  ],
};

export default function EditPdfPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <PdfWorkspace />
    </>
  );
}
