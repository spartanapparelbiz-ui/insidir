/* Where two markets' rule texts differ, word by word: the longest common subsequence of their words, and every word
 * outside it marked. Pure. Long texts are capped (the LCS table is n×m) and then come back unmarked rather than
 * marked wrongly. */
export interface DiffPart { text: string; same: boolean }

const MAX_WORDS = 1500;
const tokens = (s: string): string[] => s.split(/(\s+)/).filter(t => t.length);
const norm = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}%$.]/gu, "");

/** Both texts as runs of same / different words. `null` when a text is too long to compare. */
export function ruleDiff(a: string, b: string): { a: DiffPart[]; b: DiffPart[] } | null {
  const ta = tokens(a), tb = tokens(b);
  const wa = ta.filter(t => !/^\s+$/.test(t)), wb = tb.filter(t => !/^\s+$/.test(t));
  if (wa.length > MAX_WORDS || wb.length > MAX_WORDS) return null;
  const n = wa.length, m = wb.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i]![j] = norm(wa[i]!) === norm(wb[j]!) ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const sameA = new Array<boolean>(n).fill(false), sameB = new Array<boolean>(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (norm(wa[i]!) === norm(wb[j]!)) { sameA[i++] = true; sameB[j++] = true; }
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) i++;
    else j++;
  }
  return { a: runs(ta, sameA), b: runs(tb, sameB) };
}

/** Rebuild the text with its whitespace, merging neighbours with the same mark. */
function runs(toks: string[], same: boolean[]): DiffPart[] {
  const out: DiffPart[] = [];
  let w = 0, prev = true;
  for (const t of toks) {
    const s = /^\s+$/.test(t) ? prev : (prev = same[w++] ?? true);
    const last = out[out.length - 1];
    if (last && last.same === s) last.text += t; else out.push({ text: t, same: s });
  }
  return out;
}
