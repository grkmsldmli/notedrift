// Shim for `next/font/google` (defensive — only the web layout uses it). Returns
// the shape next/font produces; the actual font stacks are defined in styles.css.
type FontResult = { className: string; variable: string; style: { fontFamily: string } };

function font(): FontResult {
  return { className: "", variable: "", style: { fontFamily: "" } };
}

export function Geist(): FontResult {
  return font();
}
export function Geist_Mono(): FontResult {
  return font();
}
