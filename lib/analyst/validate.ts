/* The analyst note validator: a note passes only if every number in it appears in one of its facts, every name in it is
 * one of the facts' names (or text), it has at most 3 sentences, and it says nothing banned (advice, predictions,
 * certainty, who is behind an account, AI talk). Pure. */
import { BANNED } from "@/lib/copy";
import type { Facts } from "./types";

/** Advice, predictions and certainty: a note describes data, it never recommends or forecasts. */
const BANNED_NOTE = [
  ...BANNED,
  /\b(should|must|recommend\w*|advise\w*|suggest\w*|consider|buy|sell|bet on|take the|fade|tail|lock|locks?\b|sure|certain(ly)?|definitely|guarantee\w*|likely|unlikely|expect\w*|predict\w*|forecast\w*|projected?|will (win|lose|cover|hit|go|rise|fall)|going to)\b/i,
  /\b(smart money|sharp money|insider (info|knowledge|tip)|knows something|inside information|who is behind|real name|identity)\b/i,
  /\b(AI|artificial intelligence|model|algorithm|LLM|GPT|as an assistant)\b/,
  /https?:\/\/|www\./i,
  /[!?]/,
];

/** Numbers as written: "$48.5K", "3.1×", "+12%", "14–6", "4th", "40". Signs and dashes normalised. */
export function numbersIn(s: string): string[] {
  const out: string[] = [];
  const re = /([−+-]?)\$?\d[\d,]*(?:\.\d+)?(?:[KMB]\b|×|%|st\b|nd\b|rd\b|th\b)?(?:\s?[–-]\s?\d+)?/g;
  for (const m of s.matchAll(re)) {
    let t = m[0].replace(/[−]/g, "-").replace(/,/g, "").replace(/(\d)\s?[–-]\s?(?=\d)/g, "$1–").replace(/^\+/, "");
    if (/^-/.test(t) && !/^-\$?\d/.test(t)) t = t.slice(1);
    out.push(t);
  }
  return out;
}

/** Sentence starters that aren't names. */
const STARTERS = new Set("their the this that it its a an since price size of on in at with and but also one two three they none both together combined so as only here across over after before overall from by for each all every no yes".split(" "));
/** Capitalised words that are never names to check. */
const ALWAYS = new Set(["ET", "Insidir", "Form", "SEC", "I"]);

export interface Verdict { ok: boolean; problems: string[] }

export function validateNote(note: string, facts: Facts): Verdict {
  const problems: string[] = [];
  const text = note.trim();
  if (!text) return { ok: false, problems: ["empty"] };
  const sentences = text.split(/(?<=[.])\s+/).filter(Boolean);
  if (sentences.length > 3) problems.push(`${sentences.length} sentences (at most 3)`);
  if (text.length > 360) problems.push(`${text.length} characters (at most 360)`);
  for (const re of BANNED_NOTE) { const m = re.exec(text); if (m) problems.push(`banned: "${m[0]}"`); }
  const allowedNums = new Set(facts.facts.flatMap(f => numbersIn(f.text)).flatMap(n => [n, n.replace(/^-/, "")]));
  for (const n of numbersIn(text)) if (!allowedNums.has(n)) problems.push(`number not in the facts: ${n}`);
  const corpus = [...facts.names, ...facts.facts.map(f => `${f.text} ${f.label}`)].join(" ").toLowerCase();
  for (const s of sentences) {
    const words = [...s.matchAll(/[A-Z][\p{L}\d'’.&-]*/gu)];
    for (const w of words) {
      const word = w[0].replace(/[.'’]+$/, "").replace(/['’]s$/, "");
      if (!word || ALWAYS.has(word)) continue;
      const first = w.index === 0;
      if (first && STARTERS.has(word.toLowerCase())) continue;
      if (!corpus.includes(word.toLowerCase())) problems.push(`name not in the facts: ${word}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
