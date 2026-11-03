/* The headline's word-wrap, shared by the writers that count lines (lib/market/races.ts) and the component that draws
 * them (components/system Insight): sentences split at full stops, lines of at most `max` characters at word
 * boundaries, never a short word alone on the last line. Pure; safe on the client. */
export function headlineLines(text: string, max = 24): string[] {
  return text.split(/(?<=\.)\s+/).filter(Boolean).flatMap(sentence => {
    const out: string[] = [];
    let line = "";
    for (const w of sentence.split(/\s+/)) { if (line && (line + " " + w).length > max) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
    if (line) out.push(line);
    if (out.length > 1 && out.at(-1)!.length < 8) { const last = out.pop()!; out[out.length - 1] += ` ${last}`; }
    return out;
  });
}
