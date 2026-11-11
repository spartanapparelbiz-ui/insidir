/* The customer-facing text in the app's source, with where each piece is, for the voice tests (test/voice.test.ts) and
 * the banned-word report. Text = string literals that read as prose, and JSX text; never comments, code names, SQL,
 * regular expressions or class lists. Internal pages (admin, dev) are left out. Not a test itself. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isIdentifier } from "./copy-text";

export const ROOT = join(__dirname, "..");
const DIRS = ["app", "components", "lib", "worker"];
const SKIP = /(^|\/)(admin|dev|__tests__)(\/|$)|lib\/db\/schema\.ts$|lib\/db\/migrate|lib\/billing\/(setup|whop)\.ts$|\.css$/; // the last: server logs, never shown to a customer
const files = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : /\.(tsx?)$/.test(f) ? [p] : []; });

export interface Piece { file: string; line: number; text: string }
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, m => " ".repeat(m.length)).replace(/([^:"'`])\/\/[^\n"'`]*$/gm, (m, a) => a + " ".repeat(m.length - 1));
const CODE = /^\s*(select|insert|update|delete|with|create|alter|drop)\b|\bfrom terminal\.|terminal\.\w+|^[\w.-]+\(|^\s*[#.]?[\w-]+\s*\{|https?:\/\/\S+$|^[\w-]+(\s+[\w-]+)*\s*$/i;

export function pieces(): Piece[] {
  const out: Piece[] = [];
  for (const abs of DIRS.flatMap(d => files(join(ROOT, d)))) {
    const file = relative(ROOT, abs);
    if (SKIP.test(file)) continue;
    const src = stripComments(readFileSync(abs, "utf8"));
    for (const m of src.matchAll(/(?<![\w$])"([^"\n]{2,})"|(?<![\w$])'([^'\n]{2,})'|(?<!sql|css|html)`([^`]{2,})`|>([^<>{}\n]{2,})</g)) {
      const raw = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").replace(/\$\{[^}]*\}/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
      if (!/[A-Za-z]{2,}/.test(raw) || isIdentifier(raw) || CODE.test(raw)) continue;
      // Quotes that paired across code (a mismatch), not a piece of copy.
      if (/=>|\b(const|let|await|return|export|function|import)\b|[;{}]\s*$|\)\)|\.\w+\(|\w+\(\w*\)|\?\?|&&|\|\||===?/m.test(raw)) continue;
      // A one-word string is a key, a kind or a class, not copy (e.g. "bet" as a tape kind).
      if (!/\s/.test(raw.trim()) && !m[4]) continue;
      out.push({ file, line: src.slice(0, m.index).split("\n").length, text: raw.trim() });
    }
  }
  return out;
}

/** The voice's banned words (2026-11-11). Exclamation marks and emojis count. */
export const VOICE_BANNED: Array<[string, RegExp]> = [
  ["bet", /\bbet(s|ting|tor|tors)?\b/i], ["gamble", /\bgambl(e|es|ed|ing|er|ers)\b/i], ["odds", /\bodds\b/i], ["lock", /\block(s|ed|ing)?\b/i],
  ["guaranteed", /\bguarantee(d|s)?\b/i], ["free money", /\bfree money\b/i], ["insane", /\binsane(ly)?\b/i], ["secret", /\bsecrets?\b/i],
  ["cheat code", /\bcheat ?codes?\b/i], ["pov", /\bpov\b/i], ["exclamation mark", /[A-Za-z]![\s"'”’)]|[A-Za-z]!$/],
  ["emoji", /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u],
];

export function voiceViolations(): Array<Piece & { word: string }> {
  return pieces().flatMap(p => VOICE_BANNED.filter(([, r]) => r.test(p.text)).map(([word]) => ({ ...p, word })));
}
