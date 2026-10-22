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
    filedOn ? (traded.length ? "filed " : "Filed ") + longDay(filedOn) : null].filter(Boolean).join(", ");
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

/* ---------- "Explain it simply": a Form 4 for someone who has never read one ----------
   form4Simple(lines, opts) -> { headline, points: [{ label, text }], terms: [{ term, meaning }] }
   Short sentences in everyday words, every figure as filed (the exact dollar value beside a rounded "about"), and no
   judgement: what each kind of transaction is, never what it means for the stock. The last point always says what a
   Form 4 cannot tell you. opts: owners [{ owner_name, role }], issuer, ticker, filedOn, plan, amended, originalFiledOn. */
const ABOUT = n => { const s = scaled(n); return s ? "about " + s.replace(/(\.\d)\d? /, "$1 ") : money(Math.round(Number(n))); };
const SIMPLE = {
  P: { did: "Bought", means: "A purchase means the insider paid for these shares with their own money." },
  S: { did: "Sold", means: "Insiders sell for many reasons: taxes, paying for a house, spreading their money around, or a sale scheduled long ago. The filing does not say which." },
  A: { did: "Was given", how: " as part of their pay (an award)", means: "An award is part of how the company pays this person. No shares were bought on the market." },
  F: { did: "Had", how: " held back to pay taxes", means: "Holding shares back for taxes is a routine step when stock pay vests. It is not a decision to sell on the market." },
  G: { did: "Gave away", how: " as a gift", means: "A gift moves shares to someone else, often family or a charity. No money is paid." },
  M: { did: "Turned", how: " into company shares (an exercise or conversion)", means: "Exercising options or converting stock units turns a promise of shares, usually part of their pay, into actual shares." },
  D: { did: "Returned", how: " to the company", means: "The shares went back to the company itself, not to a buyer on the market." },
  C: { did: "Converted", means: "A conversion swaps one kind of security for another, for example preferred stock into common shares." },
  W: { did: "Inherited", means: "These shares came to the person by will or inheritance." }
};
SIMPLE.X = SIMPLE.O = SIMPLE.M;
const GLOSSARY = {
  form4: ["Form 4", "The report a company insider (a director, a top officer or an owner of more than 10%) must file with the SEC within two business days of trading their company's shares."],
  P: ["Code P", "A purchase on the open market or in a private deal."], S: ["Code S", "A sale on the open market or in a private deal."],
  A: ["Code A", "A grant or award, usually part of pay."], F: ["Code F", "Shares withheld to pay taxes or an exercise price."],
  M: ["Code M", "Options or stock units exercised or converted into shares."], G: ["Code G", "A gift."],
  indirect: ["Held indirectly", "The shares are owned through something else, such as a trust, a fund or a family member, not in the person's own name."],
  derivative: ["Derivative", "Something whose value comes from the shares, such as stock options or restricted stock units."],
  plan: ["Rule 10b5-1 plan", "A trading schedule an insider sets up in advance, so later trades happen automatically on that schedule."],
  amended: ["Form 4/A", "A correction or update to an earlier Form 4."]
};
const days = (a, b) => Math.round((Date.parse(isoDay(b) + "T00:00:00Z") - Date.parse(isoDay(a) + "T00:00:00Z")) / 86400000);
export function form4Simple(lines, { owners = [], issuer = "", ticker = "", filedOn = null, plan = false, amended = false, originalFiledOn = null } = {}) {
  const rows = (lines || []).filter(Boolean), co = issuer || ticker || "the company";
  const named = owners.filter(o => o && o.owner_name);
  const points = [];
  const stop = t => t.replace(/\.+$/, "") + ".";
  points.push({ label: "Who", text: !named.length ? stop("A company insider at " + co)
    : named[0].owner_name + (named[0].role ? ", " + named[0].role + " at " + co : ", an insider at " + co)
      + (named.length > 1 ? ", filing together with " + (named.length - 1) + " other " + (named.length > 2 ? "people" : "person") : "") + (named.length > 1 ? "." : "").replace(/^/, "") });
  points[0].text = stop(points[0].text);
  // What: one plain line per kind of transaction (the shares received on an exercise are the same event).
  const by = new Map();
  for (const l of rows) {
    const code = String(l.transaction_code || "").toUpperCase();
    if (EXERCISE.has(code) && !l.derivative) continue;
    const key = code + (l.derivative ? "d" : "");
    if (!by.has(key)) by.set(key, { l, code, shares: 0, value: 0, valued: 0, prices: [] });
    const g = by.get(key); g.shares += Number(l.shares) || 0;
    if (l.estimated_value != null) { g.value += Number(l.estimated_value); g.valued++; }
    if (Number(l.price_per_share) > 0) g.prices.push(Number(l.price_per_share));
  }
  const groups = [...by.values()].sort((a, b) => rankOf(a.l) - rankOf(b.l));
  const means = [];
  for (const g of groups) {
    const s = SIMPLE[g.code], unit = g.l.derivative ? (isUnits(g.l.security_title) ? " stock units" : " options") : " shares";
    const lo = Math.min(...g.prices), hi = Math.max(...g.prices);
    const each = g.prices.length ? (lo === hi ? " at " + price4(lo) + " each" : " at " + price4(lo) + " to " + price4(hi) + " each") : "";
    const total = g.valued && g.value > 0 ? ": " + ABOUT(g.value) + " in total (" + money(g.value) + " as filed)" : "";
    points.push({ label: "What", text: s ? s.did + " " + group(g.shares) + unit + (s.how || "") + each + total + "."
      : "Reported a transaction in " + group(g.shares) + unit + " (code " + (g.code || "not given") + ")" + each + total + "." });
    if (s && !means.includes(s.means)) means.push(s.means);
  }
  if (!groups.length) points.push({ label: "What", text: "No trades: this filing only reports what the person holds." });
  const traded = [...new Set(rows.map(l => isoDay(l.transaction_date)).filter(Boolean))].sort();
  if (traded.length || filedOn) {
    const lag = traded.length && filedOn ? days(traded.at(-1), filedOn) : null;
    points.push({ label: "When", text: (traded.length ? "Traded " + longDay(traded[0]) + (traded.length > 1 ? " to " + longDay(traded.at(-1)) : "") + ". " : "")
      + (filedOn ? "Told the SEC " + longDay(filedOn) + (lag != null && lag >= 0 ? ", " + (lag === 0 ? "the same day" : lag + (lag === 1 ? " day" : " days") + " later") : "") + ". " : "")
      + "Insiders have two business days to report a trade." });
  }
  if (means.length) points.push({ label: "What it means", text: means.join(" ") });
  const notes = [];
  if (plan) notes.push("These trades were made under a pre-set trading plan (Rule 10b5-1), scheduled in advance.");
  const ind = rows.filter(l => l.direct_ownership === "I");
  if (ind.length) { const nature = ind.map(l => String(l.nature_of_ownership || "").trim()).find(n => n.length > 2 && !NOT_A_NATURE.test(n));
    notes.push("Some shares are held indirectly, not in the person's own name" + (nature ? " (as filed: \u201c" + nature.replace(/\.$/, "") + "\u201d)" : ", for example in a trust") + "."); }
  if (amended) notes.push("This corrects or updates an earlier filing" + (originalFiledOn ? " made " + longDay(originalFiledOn) : "") + ".");
  if (notes.length) points.push({ label: "Good to know", text: notes.join(" ") });
  points.push({ label: "What it doesn't tell you", text: "Why they traded, or what happens next. A Form 4 reports what was done, not the reason, and it is not a recommendation." });
  const codes = [...new Set(rows.map(l => String(l.transaction_code || "").toUpperCase()))];
  const keys = ["form4", ...codes.map(c => EXERCISE.has(c) ? "M" : c), ind.length ? "indirect" : null, rows.some(l => l.derivative) ? "derivative" : null, plan ? "plan" : null, amended ? "amended" : null];
  const terms = [...new Set(keys)].filter(k => k && GLOSSARY[k]).map(k => ({ term: GLOSSARY[k][0], meaning: GLOSSARY[k][1] }));
  // The headline in everyday words: who did the largest kind of trade, and how much it came to.
  const lead = groups[0], s0 = lead && SIMPLE[lead.code], who0 = named[0]?.owner_name || "An insider";
  const headline = !lead ? who0 + " reported their " + co + " holdings"
    : who0 + " " + (s0 ? s0.did.toLowerCase() : "reported") + " " + (lead.valued && lead.value > 0 ? ABOUT(lead.value) + " of " : group(lead.shares) + " ") + co + (lead.l.derivative ? (isUnits(lead.l.security_title) ? " stock units" : " options") : " shares")
      + (s0?.how && !(lead.valued && lead.value > 0) ? s0.how : "") + (groups.length > 1 ? ", plus " + (groups.length - 1) + " other " + (groups.length > 2 ? "transactions" : "transaction") : "");
  return { headline, formal: form4Headline(rows, { amended }), points, terms };
}

/* A reporting person's name as people write it: SEC filings put the surname first in capitals ("POHLAD ROBERT C"),
   read here as "Robert C. Pohlad", the same rule the pages' identity tiles use (web/assets/js/entity-media.js
   displayName). A name with lower case is left as written; a company, trust or fund keeps its order, in title case. */
const ENTITY_NAME = /\b(INC|LLC|L\.?L\.?C|LP|L\.P|LTD|CORP|CORPORATION|COMPANY|TRUST|FUND|FUNDS|CAPITAL|PARTNERS|HOLDINGS|GROUP|FOUNDATION|BANK|ASSOCIATES|MANAGEMENT|ADVISORS|INVESTMENTS|PLC|LIMITED|VENTURES|ESTATE)\b|&/i;
const ACRONYM = /^(LLC|LP|LLP|PLC|AG|SE|NV|SA|II|III|IV|USA|US|UK|L\.P\.?|N\.A\.?)[.,]?$/;
const titleCase = s => String(s).toLowerCase().replace(/(^|[\s\-'’(])([a-z])/g, (m, a, b) => a + b.toUpperCase()).split(" ").map(w => ACRONYM.test(w.toUpperCase()) ? w.toUpperCase() : w).join(" ");
export function readableName(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (/[a-z]/.test(name)) return name;
  if (ENTITY_NAME.test(name)) return titleCase(name);
  const parts = name.replace(/,/g, " ").split(" ").filter(Boolean);
  if (parts.length < 2) return titleCase(name);
  const suffix = /^(JR|SR|II|III|IV|V)\.?$/i.test(parts.at(-1)) ? parts.pop() : "";
  const [last, ...given] = parts;
  const fix = t => /^[A-Z]\.?$/.test(t) ? t.charAt(0) + "." : titleCase(t);
  return [...given.map(fix), fix(last), suffix ? (/^(II|III|IV|V)$/i.test(suffix) ? suffix.toUpperCase() : titleCase(suffix.replace(/\.$/, "")) + ".") : ""].filter(Boolean).join(" ");
}
