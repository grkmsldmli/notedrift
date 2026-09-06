// Renders a JSON-LD structured-data block. Server component (no "use client"):
// the script is emitted in the initial HTML so crawlers see it without running JS.
// `data` is our OWN structured data (never user input), so serializing it is safe;
// we escape "<" to prevent any "</script>" sequence from breaking out of the tag.

export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
