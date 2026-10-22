/* Plain language over SEC terms. A reader who has never seen a Form 4 sees a headline ("Insider share sale
 * disclosed") and one sentence with the figures as filed; the filing's own terms (form, transaction codes, fields)
 * stay one step away in the item's detail and evidence. A headline only names what the record reports. It never
 * judges it, and the qualifications that change its reading (a Rule 10b5-1 plan, shares held indirectly, an
 * amended filing, derivative securities) are kept in the sentence, not dropped to make it shorter. */

// Each transaction code as a noun phrase, in the order a headline names them.
const KINDS = [
  ["P", "share purchase"], ["S", "share sale"], ["M", "option exercise"], ["X", "option exercise"], ["O", "option exercise"],
  ["A", "stock award"], ["F", "tax withholding"], ["G", "gift of shares"], ["D", "disposition to the company"], ["C", "conversion"],
  ["W", "inheritance"], ["U", "tender of shares"]
];
const RANK = new Map(KINDS.map(([code], i) => [code, i]));
const NOUN = Object.fromEntries(KINDS);
// What the reporting person did, for the sentence, by code ("q" is the quantity with its unit).
const VERB = { P: q => "bought " + q, S: q => "sold " + q, M: q => "exercised " + q, X: q => "exercised " + q, O: q => "exercised " + q,
  A: q => "received " + q + " as an award", F: q => "had " + q + " withheld to pay taxes", G: q => "gave " + q + " as a gift",
  D: q => "returned " + q + " to the company", C: q => "converted " + q, W: q => "inherited " + q, U: q => "tendered " + q };

const group = n => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });
const money = n => (n < 0 ? "−$" : "$") + Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 });
// A price per share as filed: cents at least, up to four places, never rounded ($23.725 stays $23.725).
const price4 = n => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const isoDay = v => v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
// The SEC dates a filing in US Eastern time: a filing at 9 pm New York time on the 19th is filed on the 19th.
export const filedDay = v => { if (v == null) return null; const s = v instanceof Date ? v.toISOString() : String(v);
  if (!/T\d/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); };
export const longDay = v => { const d = isoDay(v); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null; };

/* Code M (and X, O) covers options and also restricted or performance stock units converting into shares, so the
   words follow the derivative security the filing names; the shares received on it are the same event, not another. */
const EXERCISE = new Set(["M", "X", "O"]);
const isUnits = title => /\b(units?|RSUs?|PSUs?)\b/i.test(String(title || ""));
const exerciseOf = (l, lines) => {
  const title = l.derivative ? l.security_title : (lines || []).find(x => x.derivative && EXERCISE.has(x.transaction_code))?.security_title;
  return title == null ? "unknown" : isUnits(title) ? "units" : "options";
};
const nounOf = (l, lines) => EXERCISE.has(l.transaction_code) ? { units: "stock unit conversion", options: "option exercise", unknown: "option exercise or conversion" }[exerciseOf(l, lines)]
  : (l.derivative && (l.transaction_code === "P" || l.transaction_code === "S")) ? (l.transaction_code === "P" ? "derivative purchase" : "derivative sale")
  : NOUN[l.transaction_code] || "other transaction";
const rankOf = l => RANK.has(l.transaction_code) ? RANK.get(l.transaction_code) + (l.derivative && (l.transaction_code === "P" || l.transaction_code === "S") ? 0.5 : 0) : 99;

/* "Insider share sale disclosed", "Insider option exercise and share sale disclosed", "Insider holdings report filed". */
export function form4Headline(lines, { amended = false } = {}) {
  const nouns = [...new Map([...(lines || [])].sort((a, b) => rankOf(a) - rankOf(b)).map(l => [nounOf(l, lines), true])).keys()];
  const what = !nouns.length ? "Insider holdings report filed"
    : nouns.length === 1 && nouns[0] === "other transaction" ? "Other insider transaction disclosed"
    : "Insider " + (nouns.length > 2 ? nouns.slice(0, 2).join(", ") + " and other transactions" : nouns.join(" and ")) + " disclosed";
  return amended ? what + " (amended filing)" : what;
}

// Indirect holdings, in the filer's own words where they give them ("By Trust"), else what indirect means.
const NOT_A_NATURE = /^(see footnote|see remarks|footnote|_+|-+|n\/?a)\b/i;
function indirect(lines) {
  const ind = (lines || []).filter(l => l.direct_ownership === "I");
  if (!ind.length) return null;
  const natures = [...new Set(ind.map(l => String(l.nature_of_ownership || "").replace(/\s+/g, " ").trim().replace(/^held\s+(?=by\b)/i, "")).filter(n => n.length > 2 && !NOT_A_NATURE.test(n)))];
  return natures.length ? "Held indirectly, as filed: " + natures.slice(0, 3).map(n => n.replace(/\.$/, "")).join("; ") + (natures.length > 3 ? "; and others" : "") + "."
    : "Some of these shares are held indirectly, for example through a trust, fund or family member.";
}
function cites(lines) {
  const n = new Set((lines || []).flatMap(l => l.footnote_ids || [])).size;
  return n ? "The filing adds " + (n === 1 ? "a footnote" : n + " footnotes") + " to these lines; read " + (n === 1 ? "it" : "them") + " in the filing detail." : null;
}

/* One sentence: who, what by code with shares, prices and value as filed, when traded and filed, and the
   qualifications. lines: sec_transactions rows; owners: [{owner_name, role}]. */
export function form4Summary(lines, { owners = [], issuer, filedOn, plan = false, amended = false, originalFiledOn = null } = {}) {
  const named = owners.filter(o => o && o.owner_name);
  const who = !named.length ? "A reporting insider" : named[0].owner_name + (named[0].role ? " (" + named[0].role + ")" : "")
    + (named.length > 1 ? " and " + (named.length - 1) + " other reporting " + (named.length > 2 ? "people" : "person") : "");
  const by = new Map();
  for (const l of lines || []) {
    const key = (l.derivative ? "d" : "n") + (l.transaction_code || "?");
    if (!by.has(key)) by.set(key, { l, shares: 0, value: 0, valued: 0, lines: 0, prices: [], security: l.security_title });
    const g = by.get(key); g.lines++; g.shares += Number(l.shares) || 0;
    if (l.estimated_value != null) { g.value += Number(l.estimated_value); g.valued++; }
    if (Number(l.price_per_share) > 0) g.prices.push(Number(l.price_per_share));
  }
  let namedIssuer = false; // the company is named once, on the first quantity of its shares
  const parts = [...by.values()].sort((a, b) => rankOf(a.l) - rankOf(b.l)).map(g => {
    const kind = EXERCISE.has(g.l.transaction_code) ? exerciseOf(g.l, lines) : null;
    const verb = !kind ? VERB[g.l.transaction_code] || (q => "reported a transaction in " + q)
      : g.l.derivative ? (kind === "units" ? q => "converted " + q + " into shares" : q => "exercised " + q)
      : q => "received " + q + " on " + (kind === "units" ? "that conversion" : kind === "options" ? "that exercise" : "an exercise or conversion");
    const unit = g.l.derivative ? (g.security ? " units of " + g.security : " derivative securities")
      : " shares" + (issuer && !namedIssuer ? (namedIssuer = true, " of " + issuer) : "");
    const lo = Math.min(...g.prices), hi = Math.max(...g.prices);
    const per = g.l.derivative ? " a unit" : " a share";
    const price = g.prices.length ? (lo === hi ? " at " + price4(lo) + per : " at " + price4(lo) + " to " + price4(hi) + per) : "";
    const value = g.valued ? ", " + money(g.value) + " as filed" + (g.valued < g.lines ? " (some lines have no price)" : "") : "";
    return verb(group(g.shares) + unit) + price + value;
  });
  const traded = [...new Set((lines || []).map(l => isoDay(l.transaction_date)).filter(Boolean))].sort();
  const when = [traded.length ? "Traded " + longDay(traded[0]) + (traded.length > 1 ? " to " + longDay(traded[traded.length - 1]) : "") : null,
    filedOn ? (traded.length ? "filed " : "Filed ") + longDay(filedDay(filedOn)) : null].filter(Boolean).join(", ");
  const notes = [
    plan ? "The filing marks transactions made under a pre-arranged trading plan (Rule 10b5-1)." : null,
    indirect(lines),
    cites(lines),
    amended ? "This amends an earlier filing" + (originalFiledOn ? " made " + longDay(originalFiledOn) : "") + "." : null
  ].filter(Boolean);
  const body = parts.length ? who + " " + (parts.length === 1 ? parts[0] : parts.slice(0, -1).join("; ") + "; and " + parts[parts.length - 1]) + (issuer && !namedIssuer ? " (" + issuer + ")" : "")
    : who + " filed a holdings report" + (issuer ? " for " + issuer : "") + " with no transactions";
  return body + "." + (when ? " " + when + "." : "") + (notes.length ? " " + notes.join(" ") : "");
}

/* A person's name as people write it. SEC filings list people surname first ("COOK TIMOTHY D", "Al-Nahyan Tahnoon Bin
 * Zayed S."); this puts the given names first ("Timothy D. Cook", "Tahnoon bin Zayed S. Al-Nahyan"), keeps a suffix last
 * and leaves organizations as filed. Use it for people only; the name as filed stays in the record. */
const ORGISH = /\b(INC|INCORPORATED|CORP|CORPORATION|LLC|L\.?L\.?C|LP|L\.?P|LLP|LTD|LIMITED|PLC|TRUST|FUND|FUNDS|PARTNERS|PARTNERSHIP|CAPITAL|HOLDINGS?|GROUP|MANAGEMENT|BANK|BANCORP|FOUNDATION|COMPANY|CO|ADVISORS|ADVISERS|ASSOCIATES|VENTURES|INVESTMENTS?|SECURITIES|ESTATE|AUTHORITY|S\.?A|AG|N\.?V|GMBH|SPV)\b\.?/i;
const PARTICLES = new Set(["BIN", "BINT", "IBN", "AL", "EL", "DE", "DA", "DI", "DEL", "DER", "DEN", "VAN", "VON", "LA", "LE", "DU", "DOS", "DAS"]);
const capWord = w => /^[A-Z]\.?$/.test(w) ? w.charAt(0) + "." : /^([A-Z]\.){2,}$/.test(w) ? w : PARTICLES.has(w.replace(/\.$/, "")) ? w.toLowerCase()
  : w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, a, c) => a + c.toUpperCase()).replace(/^Mc(\p{L})/u, (m, c) => "Mc" + c.toUpperCase());
export function readableName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return "A reporting person";
  if (ORGISH.test(name) || name.includes(",") || !/\s/.test(name)) return /[a-z]/.test(name) ? name : name.split(" ").map(capWord).join(" ");
  const caps = !/[a-z]/.test(name), parts = name.split(" ");
  const suffix = /^(JR|SR|II|III|IV|V)\.?$/i.test(parts.at(-1)) ? parts.pop() : "";
  // A surname can start with a particle: "AL SAUD ...", "VAN DER BERG ...".
  let n = 1; while (n < parts.length - 1 && PARTICLES.has(parts[n - 1].toUpperCase().replace(/\.$/, ""))) n++;
  // "bin Jassim Al-Thani Sheikh Sultan": a family name ("Al-Thani") right after a patronymic belongs to the surname.
  if (n > 1 && n < parts.length - 1 && /^(al|el)-/i.test(parts[n])) n++;
  const last = parts.slice(0, n).join(" "), given = parts.slice(n);
  const fix = w => caps ? capWord(w) : /^[A-Za-z]$/.test(w) ? w + "." : w;
  const sfx = !suffix ? "" : /^(II|III|IV|V)$/i.test(suffix) ? suffix.toUpperCase() : suffix.charAt(0).toUpperCase() + suffix.slice(1).toLowerCase().replace(/\.?$/, ".");
  return [...given.map(fix), last.split(" ").map(fix).join(" ").replace(/^(al|el)\b/, x => x.charAt(0).toUpperCase() + x.slice(1)), sfx].filter(Boolean).join(" ").replace(/\bH\.? R\.? H\.?(?= )/, "HRH");
}

// 8-K items in the order they matter to a reader, each as a headline.
const ITEMS = [["4.02", "Earlier financial statements no longer to be relied on"], ["1.03", "Bankruptcy or receivership reported"],
  ["5.02", "Executive or director change reported"], ["2.02", "Financial results reported"], ["2.01", "Acquisition or sale of assets completed"],
  ["1.01", "Material agreement reported"], ["1.02", "Material agreement ended"], ["2.05", "Restructuring costs reported"], ["2.06", "Impairment reported"],
  ["3.01", "Stock exchange listing notice reported"], ["4.01", "Auditor change reported"], ["5.07", "Shareholder vote results reported"],
  ["2.03", "New debt obligation reported"], ["3.02", "Unregistered share sale reported"], ["5.03", "Charter or bylaw change reported"]];
const FORMS = [[/^10-K/, "Annual report filed"], [/^10-Q/, "Quarterly report filed"], [/^20-F/, "Annual report filed"], [/^40-F/, "Annual report filed"],
  [/^6-K/, "Report from a foreign company filed"], [/^DEF 14A|^DEFA14A/, "Proxy statement filed"], [/^S-1\b|^F-1\b/, "Registration statement filed"],
  [/^S-8\b/, "Shares registered for an employee stock plan"], [/^424B/, "Prospectus filed"], [/^11-K/, "Employee stock plan annual report filed"],
  [/^SD\b/, "Specialized disclosure report filed"], [/^(SC|SCHEDULE) 13D/, "Stake of more than 5% reported"], [/^(SC|SCHEDULE) 13G/, "Passive stake of more than 5% reported"],
  [/^144\b/, "Notice of a proposed insider sale filed"], [/^13F/, "Institutional holdings report filed"], [/^3(\/A)?$/, "Initial insider ownership filed"],
  [/^4(\/A)?$/, "Insider transaction disclosed"], [/^5(\/A)?$/, "Annual insider ownership statement filed"], [/^25-NSE|^25\b/, "Notice of removal from listing filed"]];

/* A company filing as a headline: 8-K by its most significant item, others by form. */
export function filingHeadline(form, items = []) {
  const f = String(form || "").toUpperCase().trim();
  const words = baseHeadline(f, items);
  return /\/A$/.test(f) && !/^[345]\/A$/.test(f) ? words + " (amended)" : words;
}
function baseHeadline(f, items) {
  if (/^8-K/.test(f)) {
    const codes = new Set((items || []).map(i => String(i.code)));
    const hit = ITEMS.find(([code]) => codes.has(code));
    return hit ? hit[1] : "Company announcement filed";
  }
  const hit = FORMS.find(([re]) => re.test(f));
  return hit ? hit[1] : "SEC filing: Form " + (f || "unknown");
}

/* "for the quarter ended Jun 27, 2026", "at Jun 27, 2026" (a balance-sheet value is an instant, not a period). */
export const periodPhrase = (type, end) => String(type || "") === "instant" ? "at " + longDay(end) : "for the " + String(type || "period").replace("-", " ") + " ended " + longDay(end);
// "$109.4 billion": a reading aid beside the exact figure, never in place of it.
export const scaled = n => { const a = Math.abs(Number(n)); if (!(a >= 1e6)) return null; const [d, w] = a >= 1e12 ? [1e12, "trillion"] : a >= 1e9 ? [1e9, "billion"] : [1e6, "million"]; return (n < 0 ? "−$" : "$") + (a / d).toFixed(1).replace(/\.0$/, "") + " " + w; };

/* A financial fact against a year earlier: a percentage only where both values are positive, so a loss shrinking or
   a value crossing zero is never read as a plain rise or fall. */
export function factHeadline(c) {
  const label = String(c.label || "Reported value");
  if (!c.change) return label + " unchanged from a year earlier";
  const dir = c.change > 0 ? "higher" : "lower";
  if (c.prior?.value > 0 && c.current?.value > 0 && c.changePct != null) return label + " " + (Math.abs(c.changePct) * 100).toFixed(1) + "% " + dir + " than a year earlier";
  return label + " " + dir + " than a year earlier";
}

/* Research events (src/research-events.mjs): the headline above eventSummary's sentence. */
export function eventHeadline(e) {
  const f = e?.facts || {};
  switch (e?.event_type) {
    case "insider_purchase": return "Insider share purchase disclosed" + (f.amended ? " (amended filing)" : "");
    case "insider_sale": return "Insider share sale disclosed" + (f.amended ? " (amended filing)" : "");
    case "multi_insider_purchase": return "Share purchases by several insiders disclosed";
    case "form4_amendment": return "Insider filing amended";
    case "company_disclosure": return filingHeadline(f.form, f.items);
    default: return "New SEC record";
  }
}
