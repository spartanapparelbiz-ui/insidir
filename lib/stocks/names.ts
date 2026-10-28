/* How a company, a fund or an insider is written on the site: title case instead of the SEC's ALL CAPS, without the
 * legal suffix, and with the share class when a company has more than one (Alphabet Class A vs Class C). Pure. */
const SUFFIX = /[,.]?\s+(inc|incorporated|corp|corporation|co|company|companies|ltd|limited|llc|l\.?l\.?c|lp|l\.?p|plc|n\.?v|s\.?a|ag|se|holdings?|group|financial|insurance|trust|bancorp|the)\.?$/i;
const SMALL = new Set(["of", "and", "the", "&", "de", "for", "in"]);

/** "NIPPON LIFE INSURANCE" → "Nippon Life"; "COREBRIDGE FINANCIAL, INC." → "Corebridge". Keeps short all-caps acronyms (IBM, AT&T). */
export function niceName(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4 && SUFFIX.test(s); i++) s = s.replace(SUFFIX, "").trim();
  if (s === s.toUpperCase() && /[A-Z]{4,}/.test(s)) {
    s = s.toLowerCase().split(" ").map((w, i) => (i > 0 && SMALL.has(w) ? w : w.length <= 3 && !/[aeiouy]/.test(w) ? w.toUpperCase() : w.replace(/(^|[-'.])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()))).join(" ");
  }
  return s.replace(/,$/, "");
}

/** Share classes by CUSIP for companies with more than one listed class (13F rows name the class only in a free-text
 *  issuer name, which older moves didn't keep). */
const CLASS_BY_CUSIP: Record<string, string> = {
  "02079K305": "A", "02079K107": "C", // Alphabet
  "084670108": "A", "084670702": "B", // Berkshire Hathaway
  "35137L105": "A", "35137L204": "B", // Fox
  "65249B109": "A", "65249B208": "B", // News Corp
  "92556H107": "A", "92556H206": "B", // Paramount
  "531229854": "A", "531229870": "C", // Liberty / Formula One (Series A/C)
  "60871R209": "B", // Molson Coors
  "G87110105": "A", // Telephone & Data
};

/** "A" / "B" / "C" from the issuer name ("ALPHABET INC CAP STK CL A", "CLASS C", "CL B") or a known CUSIP. */
export function shareClassOf(issuerName?: string | null, cusip?: string | null): string | null {
  const m = issuerName?.match(/\b(?:cl|class|ser(?:ies)?)\.?\s+([a-c])\b/i);
  if (m) return m[1]!.toUpperCase();
  return (cusip && CLASS_BY_CUSIP[cusip.toUpperCase()]) || null;
}

/** "Alphabet Class A": the company's nice name, plus its share class when it has one. */
export function companyWithClass(company: string, cls: string | null): string {
  const n = niceName(company);
  return cls ? `${n} Class ${cls}` : n;
}
