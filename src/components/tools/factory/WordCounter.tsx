"use client";

import { useMemo, useState } from "react";
import { countTextStats } from "@/lib/tools/text-stats";

// Live text statistics. Pure client-side — the text never leaves the textarea.

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-nd-border bg-nd-surface/50 px-3 py-2.5 text-center">
      <div className="text-lg font-semibold tabular-nums text-nd-text">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-nd-muted">{label}</div>
    </div>
  );
}

export function WordCounter() {
  const [text, setText] = useState("");
  const s = useMemo(() => countTextStats(text), [text]);

  return (
    <div>
      <label htmlFor="wc-input" className="sr-only">
        Text to count
      </label>
      <textarea
        id="wc-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste your text here…"
        spellCheck={false}
        className="nd-scroll h-56 w-full resize-y rounded-xl border border-nd-border bg-nd-bg-2 p-3.5 text-sm leading-relaxed text-nd-text outline-none ring-nd-accent/50 transition focus:ring-2"
      />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Words" value={s.words.toLocaleString()} />
        <Stat label="Characters" value={s.characters.toLocaleString()} />
        <Stat label="No spaces" value={s.charactersNoSpaces.toLocaleString()} />
        <Stat label="Sentences" value={s.sentences.toLocaleString()} />
        <Stat label="Paragraphs" value={s.paragraphs.toLocaleString()} />
        <Stat label="Reading time" value={s.readingTime} />
      </div>
      {text.length > 0 && (
        <button
          type="button"
          onClick={() => setText("")}
          className="nd-hit mt-3 rounded-lg border border-nd-border px-3 py-1.5 text-sm text-nd-muted transition-colors hover:bg-white/5 hover:text-nd-text"
        >
          Clear
        </button>
      )}
    </div>
  );
}
