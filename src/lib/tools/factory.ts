// The Tool Factory registry — the single source of truth for every bespoke
// interactive tool (PDF / image / generator / writing). Like AUDIO_TOOLS, these
// are NOT format-converters, so they live in their own registry rather than the
// convert registry. Everything downstream derives from this list: the routes, the
// shared ToolFactoryShell (title/H1/content/cross-sell/related), the /tools hub,
// the sitemap, and the SEO guards. Add a tool here + build its component + add its
// route, and it automatically participates in SEO with unique, real content.
//
// RULE: a tool appears here ONLY when its page is genuinely functional. No phantom
// keyword routes, no templated substitution — every field is written per tool.

export type FactoryCategory = "pdf" | "image" | "generator" | "writing";

export interface CrossSell {
  readonly label: string;
  readonly href: string;
  readonly sub: string;
}

export interface FactoryTool {
  readonly slug: string;
  /** H1 + tab title stem. */
  readonly title: string;
  /** Unique SEO <title>. */
  readonly seoTitle: string;
  /** One line under the H1. */
  readonly tagline: string;
  /** Unique meta description. */
  readonly description: string;
  readonly category: FactoryCategory;
  /** Tool-specific privacy/local-processing sentence (only claim what's true). */
  readonly privacyNote: string;
  /** "How to use" — a few concrete steps. */
  readonly howTo: readonly string[];
  /** A concise, genuinely useful explanation (1–2 short paragraphs). */
  readonly about: readonly string[];
  /** Relevant real use cases. */
  readonly useCases: readonly string[];
  /** Related tool slugs (may reference any registry or edit-pdf). */
  readonly related: readonly string[];
  /** The contextual next-best-action after completing this tool. */
  readonly crossSell: CrossSell;
}

export const FACTORY_CATEGORY_LABELS: Record<FactoryCategory, string> = {
  pdf: "PDF",
  image: "Image",
  generator: "Generators",
  writing: "Writing",
};

export const FACTORY_CATEGORY_ORDER: readonly FactoryCategory[] = [
  "pdf",
  "image",
  "generator",
  "writing",
];

const EDIT_PDF_CTA: CrossSell = {
  label: "Add text or a signature in Edit PDF",
  href: "/tools/edit-pdf",
  sub: "Highlight, draw, sign and rearrange pages — still in your browser.",
};

export const FACTORY_TOOLS: readonly FactoryTool[] = [
  {
    slug: "merge-pdf",
    title: "Merge PDF",
    seoTitle: "Merge PDF — Combine PDF Files Free & Private | NoteDrift",
    tagline: "Combine several PDFs into one — reorder them first, then download.",
    description:
      "Merge multiple PDF files into a single document, right in your browser. Reorder before combining. Free, no signup, and your files never leave your device.",
    category: "pdf",
    privacyNote:
      "Your PDFs are merged in your browser — nothing is uploaded to NoteDrift.",
    howTo: [
      "Add two or more PDF files.",
      "Drag or use the arrows to put them in the order you want.",
      "Click Merge, then download your single combined PDF.",
    ],
    about: [
      "Merging PDFs is one of those tasks that shouldn't need an account or an upload. NoteDrift combines your files locally using your browser, so the documents stay on your device the whole time.",
      "Pages are copied exactly as they are — no re-compression, no quality loss, no watermark.",
    ],
    useCases: [
      "Combine a cover letter and résumé into one file to send.",
      "Merge scanned pages that came out as separate PDFs.",
      "Assemble chapters or invoices into a single document.",
    ],
    related: ["split-pdf", "extract-pdf-pages", "edit-pdf"],
    crossSell: EDIT_PDF_CTA,
  },
  {
    slug: "split-pdf",
    title: "Split PDF",
    seoTitle: "Split PDF — Split a PDF into Parts Free | NoteDrift",
    tagline: "Split one PDF into separate files by page ranges.",
    description:
      "Split a PDF into multiple files by page ranges, in your browser. Free, no signup, private — your file is never uploaded.",
    category: "pdf",
    privacyNote:
      "Your PDF is split in your browser — nothing is uploaded to NoteDrift.",
    howTo: [
      "Open a PDF and see how many pages it has.",
      "Enter the page ranges to split into (for example 1-3, 4-6, 7).",
      "Split and download each part as its own PDF.",
    ],
    about: [
      "Splitting a PDF locally keeps a sensitive document — a contract, a statement, a scan — on your own machine. NoteDrift reads the page count and builds each new PDF from the ranges you choose.",
      "Every output keeps the original page quality; nothing is re-rendered or compressed.",
    ],
    useCases: [
      "Pull a single chapter out of a long report.",
      "Break a scanned stack into per-document files.",
      "Separate an invoice bundle into one file per invoice.",
    ],
    related: ["extract-pdf-pages", "merge-pdf", "pdf-to-jpg"],
    crossSell: EDIT_PDF_CTA,
  },
  {
    slug: "extract-pdf-pages",
    title: "Extract PDF Pages",
    seoTitle: "Extract PDF Pages — Pick Pages into a New PDF | NoteDrift",
    tagline: "Select the exact pages you want and save them as a new PDF.",
    description:
      "Extract specific pages from a PDF into a new document, in your browser. Pick any pages, in any order. Free, no signup, nothing uploaded.",
    category: "pdf",
    privacyNote:
      "Pages are extracted in your browser — your PDF is never uploaded.",
    howTo: [
      "Open a PDF to see its pages.",
      "Tick the pages you want to keep.",
      "Extract and download them as one new PDF.",
    ],
    about: [
      "Sometimes you only need a few pages out of a big file. This tool lets you pick exactly the pages you want and combines them into a fresh PDF — locally, with no upload.",
      "Selected pages are copied at full quality in the order you choose.",
    ],
    useCases: [
      "Keep only the signed pages of a contract.",
      "Grab the two pages a colleague actually needs.",
      "Build a short excerpt from a long document.",
    ],
    related: ["split-pdf", "merge-pdf", "pdf-to-jpg"],
    crossSell: EDIT_PDF_CTA,
  },
  {
    slug: "pdf-to-jpg",
    title: "PDF to JPG",
    seoTitle: "PDF to JPG — Convert PDF Pages to Images Free | NoteDrift",
    tagline: "Turn each PDF page into a JPG image you can download.",
    description:
      "Convert PDF pages to JPG images in your browser. Download pages individually or all at once. Free, no signup, and your PDF is never uploaded.",
    category: "pdf",
    privacyNote:
      "Pages are rendered to images in your browser — your PDF is never uploaded.",
    howTo: [
      "Open a PDF and let the pages render to previews.",
      "Download any page as a JPG, or download them all as a ZIP.",
    ],
    about: [
      "Turning a PDF into images is handy for sharing a page as a picture, dropping it into a slide, or posting it where PDFs aren't allowed. NoteDrift renders each page in your browser and hands you clean JPGs.",
      "Rendering happens locally with the same engine that powers the NoteDrift PDF editor — no server, no upload.",
    ],
    useCases: [
      "Share one PDF page as an image in a chat.",
      "Add a document page to a presentation or canvas.",
      "Create thumbnails/previews of a PDF.",
    ],
    related: ["image-compressor", "image-resizer", "extract-pdf-pages"],
    crossSell: {
      label: "Compress your images",
      href: "/tools/image-compressor",
      sub: "Shrink the JPGs you just made without visible quality loss.",
    },
  },
  {
    slug: "crop-image",
    title: "Crop Image",
    seoTitle: "Crop Image Online — Free & Private Image Cropper | NoteDrift",
    tagline: "Crop JPG, PNG or WebP with free-form or preset ratios.",
    description:
      "Crop an image in your browser — drag to select, or use ratio presets like 1:1 and 16:9. Free, no signup, and your image is never uploaded.",
    category: "image",
    privacyNote:
      "Your image is cropped in your browser — nothing is uploaded to NoteDrift.",
    howTo: [
      "Drop in a JPG, PNG or WebP.",
      "Drag the crop box, or pick a ratio preset.",
      "Download the cropped image.",
    ],
    about: [
      "A quick crop shouldn't mean uploading your photo to a stranger's server. NoteDrift crops locally on a canvas, so the original never leaves your device and the output keeps its real pixel dimensions.",
      "Free-form cropping and common ratio presets cover profile pictures, thumbnails and banners alike.",
    ],
    useCases: [
      "Square-crop a photo for a profile picture.",
      "Trim a screenshot down to just the part that matters.",
      "Cut a banner to 16:9 for a slide or header.",
    ],
    related: ["image-compressor", "image-resizer", "png-to-jpg"],
    crossSell: {
      label: "Compress your cropped image",
      href: "/tools/image-compressor",
      sub: "Make the file smaller before you upload or send it.",
    },
  },
  {
    slug: "qr-code-generator",
    title: "QR Code Generator",
    seoTitle: "QR Code Generator — Free QR Maker, No Tracking | NoteDrift",
    tagline: "Turn any link or text into a QR code and download it as a PNG.",
    description:
      "Generate a QR code from a URL or text in your browser and download it as a PNG. Free, no signup, no tracking — the code points exactly where you say.",
    category: "generator",
    privacyNote:
      "Your QR code is generated in your browser — nothing is sent to NoteDrift, and the code contains no tracking.",
    howTo: [
      "Type or paste a link or any text.",
      "Pick a size.",
      "Download your QR code as a PNG.",
    ],
    about: [
      "A QR code is just an encoding of your text — so there's no reason it should route through someone's tracking redirect. NoteDrift builds the code entirely in your browser, and it links straight to what you typed.",
      "The PNG is transparent-friendly and scales cleanly for print or screen.",
    ],
    useCases: [
      "Put a link to your site on a poster or business card.",
      "Share a Wi-Fi or menu link at an event.",
      "Add a scannable link to a slide or handout.",
    ],
    related: ["signature-maker", "word-counter", "edit-pdf"],
    crossSell: {
      label: "Add it to a NoteDrift canvas",
      href: "/",
      sub: "Drop your QR onto an infinite canvas and design around it.",
    },
  },
  {
    slug: "word-counter",
    title: "Word Counter",
    seoTitle: "Word Counter — Free Word & Character Counter | NoteDrift",
    tagline: "Words, characters, sentences, paragraphs and reading time — live.",
    description:
      "Count words, characters, sentences, paragraphs and estimated reading time as you type. Instant, free, no signup — your text stays in your browser.",
    category: "writing",
    privacyNote: "Your text stays in your browser — nothing is sent to NoteDrift.",
    howTo: [
      "Type or paste your text.",
      "Watch the counts update instantly as you write.",
    ],
    about: [
      "Whether you're staying under a character limit or hitting a word target, a fast, private counter beats pasting your draft into a random website. Everything updates live as you type, with nothing sent anywhere.",
      "Reading time is estimated at about 200 words per minute.",
    ],
    useCases: [
      "Stay under a social post or meta-description limit.",
      "Hit a word count for an essay or article.",
      "Estimate how long a piece takes to read.",
    ],
    related: ["signature-maker", "qr-code-generator", "edit-pdf"],
    crossSell: {
      label: "Keep writing in NoteDrift",
      href: "/",
      sub: "An instant, distraction-free canvas — no login, no clutter.",
    },
  },
  {
    slug: "signature-maker",
    title: "Signature Maker",
    seoTitle: "Signature Maker — Draw & Download a Signature PNG | NoteDrift",
    tagline: "Draw your signature and export it as a transparent PNG.",
    description:
      "Draw your signature with a mouse, finger or stylus and download it as a transparent PNG. Free, no signup — your signature is created in your browser.",
    category: "generator",
    privacyNote:
      "Your signature is drawn and exported in your browser — nothing is uploaded to NoteDrift.",
    howTo: [
      "Draw your signature in the box with your mouse, finger or stylus.",
      "Adjust the pen thickness, or undo/clear if needed.",
      "Download it as a transparent PNG.",
    ],
    about: [
      "A signature image is useful for signing documents, forms and emails — but it's personal, so it shouldn't be uploaded anywhere. NoteDrift lets you draw one on a canvas and export a clean, transparent PNG that drops onto any document.",
      "The transparent background means it sits naturally on top of a page or form.",
    ],
    useCases: [
      "Make a reusable signature to add to PDFs.",
      "Sign a form without printing and scanning.",
      "Add a handwritten signature to an email footer.",
    ],
    related: ["edit-pdf", "crop-image", "qr-code-generator"],
    crossSell: {
      label: "Add your signature to a PDF",
      href: "/tools/edit-pdf",
      sub: "Open Edit PDF, drop your signature in, and download the signed file.",
    },
  },
];

export function getFactoryTool(slug: string): FactoryTool | undefined {
  return FACTORY_TOOLS.find((t) => t.slug === slug);
}

export function factoryToolsInCategory(category: FactoryCategory): FactoryTool[] {
  return FACTORY_TOOLS.filter((t) => t.category === category);
}
