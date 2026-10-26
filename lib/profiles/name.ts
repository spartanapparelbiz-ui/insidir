/* Who is behind a move, in words (pure). SEC filers are named as filed; Polymarket wallets by their public username or
 * short address, never anything more; Kalshi trades are anonymous ("Someone").
 *   personName("HUANG JEN HSUN")        → "Jen Hsun Huang"   (EDGAR files people as LAST FIRST MIDDLE, in any case)
 *   personName("Cook Timothy D")        → "Timothy D. Cook"
 *   personName("Smith, John A. Jr.")    → "John A. Smith Jr."
 *   personName("BERKSHIRE HATHAWAY INC") → "Berkshire Hathaway" (an entity keeps its own order)
 *   roleOf("The CEO") → "CEO"; roleOf("A director") → "a director"
 *   insiderWho → "Jen Hsun Huang, CEO of Nvidia" */
import { companyName } from "@/lib/stocks/form4";

const ENTITY = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|l\.?l\.?c|lp|l\.?p|llp|fund|funds|trust|capital|partners|partnership|holdings?|group|management|advisors|advisers|investments?|ventures|bank|associates|foundation|n\.?v|s\.?a|ag|gmbh|se)\.?\b|&/i;
const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "V", "MD", "PHD", "ESQ"]);

/** One word of a name in normal case: "MCDONALD" → "McDonald", "O'BRIEN" → "O'Brien", "SMITH-JONES" → "Smith-Jones". */
function word(w: string): string {
  if (/^[A-Z]$/i.test(w)) return `${w.toUpperCase()}.`;
  if (/^[A-Z]\.$/i.test(w)) return w.toUpperCase();
  const up = w.toUpperCase().replace(/\.$/, "");
  if (SUFFIXES.has(up)) return up === "JR" || up === "SR" ? `${up[0]}${up[1]!.toLowerCase()}.` : up === "PHD" ? "PhD" : up === "MD" ? "MD" : up === "ESQ" ? "Esq." : up;
  return w.toLowerCase().split(/([-'])/).map(p => {
    if (p === "-" || p === "'") return p;
    if (/^mc[a-z]{2,}/.test(p)) return `Mc${p[2]!.toUpperCase()}${p.slice(3)}`;
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join("");
}

export const isEntity = (raw: string): boolean => ENTITY.test(raw);

export function personName(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "An insider";
  if (isEntity(s)) return companyName(s);
  let parts: string[];
  if (s.includes(",")) {
    // "Last, First Middle[, Jr.]"
    const [last, ...rest] = s.split(",").map(x => x.trim()).filter(Boolean);
    const restWords = rest.join(" ").split(" ").filter(Boolean);
    const suffix = restWords.filter(w => SUFFIXES.has(w.toUpperCase().replace(/\.$/, "")));
    parts = [...restWords.filter(w => !suffix.includes(w)), ...(last ?? "").split(" "), ...suffix];
  } else {
    // EDGAR: "LAST FIRST MIDDLE [SUFFIX]"
    const words = s.split(" ");
    const suffix = words.filter((w, i) => i > 0 && SUFFIXES.has(w.replace(/\.$/, "")));
    const core = words.filter(w => !suffix.includes(w));
    parts = core.length > 1 ? [...core.slice(1), core[0]!, ...suffix] : [...core, ...suffix];
  }
  return parts.filter(Boolean).map(word).join(" ");
}

/** The filed relationship without its article, for "<name>, <role> of <company>". */
export function roleOf(roleWord: string): string {
  const m = /^(The|A|An)\s+(.*)$/.exec(roleWord.trim());
  if (!m) return roleWord;
  return m[1] === "The" ? m[2]! : `${m[1]!.toLowerCase()} ${m[2]}`;
}

/** "Jen Hsun Huang, CEO of Nvidia" */
export const insiderWho = (ownerName: string, roleWord: string, company: string): string => `${personName(ownerName)}, ${roleOf(roleWord)} of ${company}`;

/* ---------- profile ids (/p/[id]) ---------- */

export type ProfileRef = { kind: "trader"; wallet: string } | { kind: "insider"; cik: string } | { kind: "fund"; cik: string };

export function profileHref(ref: ProfileRef): string {
  if (ref.kind === "trader") return `/p/${ref.wallet.toLowerCase()}`;
  return `/p/${ref.kind}-${Number(ref.cik)}`;
}

/** "/p/0xabc…" (a Polymarket wallet), "/p/insider-1045810", "/p/fund-1067983"; null when it is none of these. */
export function parseProfileId(id: string): ProfileRef | null {
  const s = decodeURIComponent(id).trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(s)) return { kind: "trader", wallet: s };
  const m = /^(insider|fund)-(\d{1,10})$/.exec(s);
  if (!m || Number(m[2]) <= 0) return null;
  return { kind: m[1] as "insider" | "fund", cik: String(Number(m[2])) };
}
