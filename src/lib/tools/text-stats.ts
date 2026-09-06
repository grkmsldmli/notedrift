// Pure text statistics for the Word Counter — no DOM, unit-tested. Simple,
// predictable rules: whitespace-delimited words, sentence-ending punctuation,
// blank-line-separated paragraphs, reading time at ~200 wpm.

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  readingTime: string;
}

export function countTextStats(text: string): TextStats {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, "").length;
  const sentences = trimmed ? (trimmed.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.length ?? 0) : 0;
  const paragraphs = trimmed
    ? trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).length
    : 0;
  const minutes = words / 200;
  const readingTime =
    words === 0
      ? "0 sec"
      : minutes < 1
        ? `${Math.max(1, Math.round(minutes * 60))} sec`
        : `${Math.ceil(minutes)} min`;
  return { words, characters, charactersNoSpaces, sentences, paragraphs, readingTime };
}
