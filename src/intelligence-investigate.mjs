/* Intelligence Investigate: research questions answered from Insidir's own SEC index.
 *
 *   1. screenQuestion()      refuse personalized advice and prompt-injection before anything else runs
 *   2. parseQuestion()       deterministic: companies (ticker or name, checked against the SEC index), people
 *                            scope (followed people, watchlist), time range, record types, comparison
 *   3. retrieve()            bounded SQL over sec_filings / sec_transactions / research_events, plus the
 *                            company's EDGAR submissions list (cached) when the question is about filings
 *   4. assemble()            a factual answer built from templates: every sentence carries the numbers of the
 *                            records it rests on, every record links to its SEC document, gaps are listed
 *   5. synthesize()          optional plain-English synthesis by a model, from the cited evidence only; it is
 *                            verified (figures, citations, directives) and cached by evidence hash, so the same
 *                            evidence is never paid for twice. A failed check falls back to the factual answer.
 * No model is involved in steps 1-4. */
import { query as queryDb } from "./db.mjs";
import { screenQuestion, reviewGeneratedText } from "./compliance-guard.mjs";
import { tickerIndex, resolveCompany, extractFilings } from "./intelligence.mjs";
import { cachedGeneration, sanitizeEvidence, sha256, SYSTEM_RULES, aiConfigured } from "./ai-gateway.mjs";
import { intelligenceBriefing } from "./intelligence-briefing.mjs";
import { iso, day, num, cikForms, bareCik, displayName, companyName, roleOf, money, count, codeLabel, eightKLabel, secSource, summarizeLines } from "./intelligence-common.mjs";

const fail = (status, message) => Object.assign(new Error(message), { status });
export const MAX_QUESTION = 400;
const MAX_COMPANIES = 4, LINES_PER_COMPANY = 400, MARKET_LINES = 25, PEOPLE_LINES = 600;

/* ---------- Company directory: tickers and names Insidir can verify ---------- */
const SUFFIX = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "plc", "holdings", "holding", "group", "the", "class", "de", "nv", "sa", "ag", "se", "lp", "llc", "trust", "new", "com"]);
export const normalizeName = s => String(s || "").toLowerCase().replace(/\/[a-z]{2}\/?/g, " ").replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ")
  .split(/\s+/).filter(w => w && !SUFFIX.has(w)).join(" ");
/* Brand names whose SEC registrant name differs, or that are common enough to want an exact answer. Each is
 * still checked against the directory before use. */
export const ALIASES = Object.freeze({ google: "GOOGL", alphabet: "GOOGL", facebook: "META", meta: "META", "meta platforms": "META", amazon: "AMZN", apple: "AAPL",
  microsoft: "MSFT", nvidia: "NVDA", tesla: "TSLA", netflix: "NFLX", intel: "INTC", amd: "AMD", "advanced micro devices": "AMD", broadcom: "AVGO", oracle: "ORCL",
  salesforce: "CRM", adobe: "ADBE", jpmorgan: "JPM", "jp morgan": "JPM", walmart: "WMT", disney: "DIS", boeing: "BA", palantir: "PLTR", coinbase: "COIN",
  "goldman sachs": "GS", "morgan stanley": "MS", "bank of america": "BAC", "eli lilly": "LLY", "johnson and johnson": "JNJ", costco: "COST", starbucks: "SBUX", nike: "NKE" });
const QUESTION_WORDS = new Set(("what did do does show me recent insider insiders sale sales purchase purchases filing filings sec the at in of compare with and since my last visit " +
  "changed change changes executive executives follow followed i we companies company people disclosed disclose disclosure disclosures transaction transactions week year " +
  "today form report reports this month quarter versus vs between how many much who which when where were was are is any all top largest biggest buys buy sells sell bought sold " +
  "about tell activity trading trades trade past days day months recently latest new news announcement announcements a an to for on by from it its their " +
  "january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday only just").split(" "));
const TICKER_STOP = new Set(["I", "A", "SEC", "CEO", "CFO", "COO", "CTO", "US", "USA", "AI", "IPO", "ETF", "THE", "AND", "FORM", "OR", "VS", "YTD", "Q1", "Q2", "Q3", "Q4", "PM", "AM", "EDGAR", "LLC", "INC"]);

let directoryCache = { at: 0, value: null, pending: null };
export const DIRECTORY_SQL = `SELECT DISTINCT ON (ticker) ticker,issuer_name,issuer_cik FROM sec_filings
  WHERE ingest_status='parsed' AND ticker ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$' ORDER BY ticker,published_at DESC NULLS LAST`;
export function buildDirectory(rows = [], secIndex = null) {
  const byTicker = new Map(), byName = new Map();
  const put = (ticker, name, cik, source) => {
    const t = String(ticker || "").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)) return;
    if (!byTicker.has(t)) byTicker.set(t, { ticker: t, name: companyName(name, t), cik: cik ? String(cik).replace(/^0+/, "").padStart(10, "0") : null, sources: [source] });
    const full = normalizeName(name);
    if (full) { if (!byName.has(full)) byName.set(full, new Set()); byName.get(full).add(t); }
  };
  for (const r of rows) put(r.ticker, r.issuer_name, r.issuer_cik, "insidir_index");
  if (secIndex && typeof secIndex === "object") for (const r of Object.values(secIndex)) put(r?.ticker, r?.title, r?.cik_str, "sec_ticker_map");
  return { byTicker, byName, size: byTicker.size };
}
export async function companyDirectory(run = queryDb, { loadIndex = tickerIndex, ttlMs = 10 * 60_000 } = {}) {
  if (directoryCache.value && Date.now() - directoryCache.at < ttlMs) return directoryCache.value;
  if (directoryCache.pending) return directoryCache.pending;
  directoryCache.pending = (async () => {
    const rows = (await run(DIRECTORY_SQL)).rows;
    let index = null;
    try { index = await Promise.race([loadIndex(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 4000))]); } catch { index = null; }
    const value = buildDirectory(rows, index);
    directoryCache = { at: Date.now(), value, pending: null };
    return value;
  })().finally(() => { directoryCache.pending = null; });
  return directoryCache.pending;
}
export const resetDirectoryCache = () => { directoryCache = { at: 0, value: null, pending: null }; };

/* ---------- Question parsing (deterministic) ---------- */
export function parseTimeRange(text, now = Date.now()) {
  const t = String(text).toLowerCase(), today = new Date(now);
  const startOf = (y, m, d) => Date.UTC(y, m, d);
  const daysBetween = from => Math.max(1, Math.ceil((now - from) / 86400_000));
  let m;
  if (/\bsince (my|our|the) last (visit|check|login|time)\b|\bsince i last (checked|visited|looked)\b|\bsince last time\b/.test(t)) return { sinceVisit: true, label: "since your last visit" };
  if (/\btoday\b/.test(t)) return { days: 1, label: "the last 24 hours" };
  if ((m = /\b(?:past|last|previous)\s+(\d{1,3})\s+(day|week|month)s?\b/.exec(t))) {
    const n = Number(m[1]) * (m[2] === "week" ? 7 : m[2] === "month" ? 30 : 1);
    return { days: Math.min(365, Math.max(1, n)), label: "the last " + m[1] + " " + m[2] + (m[1] === "1" ? "" : "s") };
  }
  if (/\bthis week\b/.test(t)) return { days: 7, label: "the last 7 days" };
  if (/\b(last|past|previous) week\b/.test(t)) return { days: 7, label: "the last 7 days" };
  if (/\bthis month\b/.test(t)) return { days: daysBetween(startOf(today.getUTCFullYear(), today.getUTCMonth(), 1)), label: "the month to date (since " + new Date(startOf(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10) + ")" };
  if (/\b(last|past|previous) month\b/.test(t)) return { days: 30, label: "the last 30 days" };
  if (/\bthis quarter\b/.test(t)) { const q = Math.floor(today.getUTCMonth() / 3) * 3; return { days: daysBetween(startOf(today.getUTCFullYear(), q, 1)), label: "the quarter to date (since " + new Date(startOf(today.getUTCFullYear(), q, 1)).toISOString().slice(0, 10) + ")" }; }
  if (/\b(last|past) quarter\b|\b(last|past) (3|three) months\b/.test(t)) return { days: 90, label: "the last 90 days" };
  if (/\bthis year\b|\byear to date\b|\bytd\b/.test(t)) return { days: daysBetween(startOf(today.getUTCFullYear(), 0, 1)), label: "the year to date (since " + today.getUTCFullYear() + "-01-01)" };
  if (/\b(last|past) year\b|\b(last|past) 12 months\b/.test(t)) return { days: 365, label: "the last 365 days" };
  if (/\brecent(ly)?\b|\blatest\b/.test(t)) return { days: 30, label: "the last 30 days", defaulted: true };
  return { days: 30, label: "the last 30 days", defaulted: true };
}

export function resolveCompanies(text, directory) {
  const found = [], seen = new Set(), unmatched = [], ambiguous = [];
  const add = (ticker, matchedBy, phrase) => {
    const c = directory.byTicker.get(ticker);
    if (!c || seen.has(ticker)) return false;
    seen.add(ticker); found.push({ ticker, name: c.name, cik: c.cik, matchedBy, phrase }); return true;
  };
  const raw = String(text);
  for (const m of raw.matchAll(/\$([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?)\b/g)) if (!add(m[1].toUpperCase(), "ticker", m[0])) unmatched.push(m[0]);
  for (const m of raw.matchAll(/\b([A-Z]{1,5}(?:[.-][A-Z]{1,2})?)\b/g)) {
    if (TICKER_STOP.has(m[1]) || m[1].length < 2) continue;
    add(m[1], "ticker", m[1]);
  }
  // Names: longest n-grams first, possessives stripped. Single words must be capitalised and not a question word.
  const tokens = [...raw.replace(/[’']s\b/g, "").matchAll(/[A-Za-z0-9&][A-Za-z0-9&.-]*/g)].map(m => ({ word: m[0].replace(/\.$/, ""), at: m.index }));
  const used = new Set();
  for (let n = 4; n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if ([...Array(n).keys()].some(k => used.has(i + k))) continue;
      const words = tokens.slice(i, i + n).map(x => x.word);
      const phrase = normalizeName(words.join(" "));
      if (!phrase) continue;
      if (n === 1 && (QUESTION_WORDS.has(phrase) || phrase.length < 3)) continue;
      let ticker = ALIASES[phrase] || null, by = "name";
      if (!ticker) {
        const set = directory.byName.get(phrase);
        if (!set) continue;
        if (n === 1 && !/^[A-Z]/.test(words[0])) continue;
        const list = [...set];
        if (list.length > 1) { ambiguous.push({ phrase: words.join(" "), tickers: list.slice(0, 5) }); ticker = list.sort((a, b) => a.length - b.length || a.localeCompare(b))[0]; }
        else ticker = list[0];
      } else by = "alias";
      if (add(ticker, by, words.join(" ")) || seen.has(ticker)) for (let k = 0; k < n; k++) used.add(i + k);
    }
  }
  // Capitalised words that look like a company name but matched nothing are reported, not guessed.
  for (const m of raw.matchAll(/\b(?:at|in|for|of|from|with|and|about)\s+([A-Z][A-Za-z0-9&.-]{2,}(?:\s+[A-Z][A-Za-z0-9&.-]+){0,2})/g)) {
    const phrase = m[1].replace(/[’']s$/, "");
    const norm = normalizeName(phrase);
    if (!norm || QUESTION_WORDS.has(norm.split(" ")[0])) continue;
    const covered = found.some(f => normalizeName(f.phrase) === norm || norm.includes(normalizeName(f.phrase)) || normalizeName(f.name).includes(norm));
    if (!covered && !directory.byTicker.has(phrase.toUpperCase())) unmatched.push(phrase);
  }
  return { companies: found.slice(0, MAX_COMPANIES), extra: Math.max(0, found.length - MAX_COMPANIES), unmatched: [...new Set(unmatched)].slice(0, 5), ambiguous };
}

export function parseQuestion(question, directory, { now = Date.now(), context = null } = {}) {
  const text = String(question || "").replace(/\s+/g, " ").trim();
  const t = text.toLowerCase();
  const { companies, extra, unmatched, ambiguous } = resolveCompanies(text, directory);
  const time = parseTimeRange(text, now);
  const categories = [];
  if (/\b(sales?|sold|selling|sells?|dispos\w*)\b/.test(t)) categories.push("reported_sale");
  if (/\b(purchases?|bought|buying|buys?|acquir\w*)\b/.test(t)) categories.push("reported_purchase");
  const wantsInsider = /\b(insiders?|form 4|executives?|directors?|officers?|sales?|sold|purchases?|bought|transactions?|trades?|trading|ownership)\b/.test(t) || categories.length > 0;
  const wantsFilings = /\b(filings?|filed|8-?k|10-?k|10-?q|6-?k|announcements?|reports?|changed?|changes|disclosures?)\b/.test(t) && !/\binsiders? disclos/.test(t);
  let scope = companies.length ? "companies" : "none";
  if (/\b(executives?|insiders?|people|persons?|officers?|directors?)\s+(i|we)\s+follow\b|\bfollowed (people|executives|insiders|persons)\b|\bpeople i'?m following\b/.test(t)) scope = "followed_people";
  else if (!companies.length && /\b(my )?watch ?list\b|\bcompanies (i|we) (follow|watch)\b|\bmy companies\b/.test(t)) scope = "watchlist";
  else if (!companies.length && /\b(largest|biggest|top|across the market|market-?wide|all companies|any company)\b/.test(t) && wantsInsider) scope = "market";
  let intent = /\bcompare\b|\bversus\b|\bvs\.?\b|\bcompared (to|with)\b/.test(t) && companies.length >= 2 ? "compare"
    : time.sinceVisit ? "changes_since_visit"
    : wantsInsider && !wantsFilings ? "insider_activity" : wantsFilings && !wantsInsider ? "filings" : "overview";
  let usedContext = false, contextCompanies = companies;
  // Follow-ups: "What about Microsoft?" keeps the previous question's focus; "Only purchases?" keeps its companies.
  if (context && typeof context === "object") {
    const prevTickers = Array.isArray(context.tickers) ? context.tickers.filter(x => directory.byTicker.has(String(x))).slice(0, MAX_COMPANIES) : [];
    const noFocusWords = !wantsInsider && !wantsFilings && !time.sinceVisit;
    if (!companies.length && scope === "none" && prevTickers.length) {
      contextCompanies = prevTickers.map(x => { const c = directory.byTicker.get(x); return { ticker: x, name: c.name, cik: c.cik, matchedBy: "context", phrase: x }; });
      scope = "companies"; usedContext = true;
      if (intent === "overview" && ["insider_activity", "filings", "compare"].includes(context.intent) && noFocusWords) intent = context.intent === "compare" && contextCompanies.length < 2 ? "overview" : context.intent;
      if (intent === "compare" && contextCompanies.length < 2) intent = "overview";
    } else if (companies.length && noFocusWords && ["insider_activity", "filings"].includes(context.intent)) {
      intent = context.intent; usedContext = true;
      if (!categories.length && Array.isArray(context.categories)) for (const c of context.categories) if (["reported_sale", "reported_purchase"].includes(c)) categories.push(c);
    }
    if (time.defaulted && Number.isInteger(context.days) && context.days >= 1 && context.days <= 365 && usedContext) { time.days = context.days; time.label = context.timeLabel && String(context.timeLabel).slice(0, 80) || "the last " + context.days + " days"; delete time.defaulted; }
  }
  if (intent === "compare" && contextCompanies.length < 2) intent = "overview";
  return { question: text, companies: contextCompanies, extraCompanies: extra, unmatched, ambiguous, scope, intent, categories: [...new Set(categories)],
    days: time.days ?? null, sinceVisit: !!time.sinceVisit, timeLabel: time.label, usedContext };
}

/* ---------- Retrieval ---------- */
export const COMPANY_LINES_SQL = `SELECT x.* FROM unnest($1::text[]) AS q(ticker) CROSS JOIN LATERAL (
  SELECT t.id,t.accession,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.transaction_code,t.category,t.derivative,t.shares,t.price_per_share,
    t.estimated_value,t.security_title,f.issuer_name,f.issuer_cik,f.form_type,f.is_amendment,f.published_at,f.retrieved_at,f.source_url
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE t.ticker=q.ticker AND f.ingest_status='parsed' AND f.published_at>=now()-make_interval(days=>$2)
    AND ($3::text[] IS NULL OR t.category=ANY($3::text[]))
  ORDER BY f.published_at DESC,t.id LIMIT ${LINES_PER_COMPANY + 1}) x`;
export const PEOPLE_LINES_SQL = `WITH acc AS (
    SELECT t.accession FROM sec_transactions t WHERE t.owner_cik=ANY($1::text[])
    UNION SELECT o.accession FROM sec_filing_owners o WHERE o.owner_cik=ANY($1::text[]))
  SELECT t.id,t.accession,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.transaction_code,t.category,t.derivative,t.shares,t.price_per_share,
    t.estimated_value,t.security_title,f.issuer_name,f.issuer_cik,f.form_type,f.is_amendment,f.published_at,f.retrieved_at,f.source_url
  FROM acc JOIN sec_filings f ON f.accession=acc.accession JOIN sec_transactions t ON t.accession=f.accession
  WHERE f.ingest_status='parsed' AND f.published_at>=now()-make_interval(days=>$2) AND ($3::text[] IS NULL OR t.category=ANY($3::text[]))
    AND (t.owner_cik=ANY($1::text[]) OR (t.owner_cik IS NULL AND EXISTS(SELECT 1 FROM sec_filing_owners o WHERE o.accession=t.accession AND o.owner_cik=ANY($1::text[]))))
  ORDER BY f.published_at DESC,t.id LIMIT ${PEOPLE_LINES + 1}`;
export const MARKET_LINES_SQL = `SELECT t.id,t.accession,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.transaction_code,t.category,t.derivative,t.shares,t.price_per_share,
    t.estimated_value,t.security_title,f.issuer_name,f.issuer_cik,f.form_type,f.is_amendment,f.published_at,f.retrieved_at,f.source_url
  FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
  WHERE t.category=ANY($1::text[]) AND NOT t.derivative AND t.estimated_value IS NOT NULL AND f.ingest_status='parsed'
    AND f.published_at>=now()-make_interval(days=>$2) AND t.transaction_date>=current_date-($2::integer+30)
  ORDER BY t.estimated_value DESC LIMIT ${MARKET_LINES}`;
export const NOTICES_SQL = `SELECT event_key,title,subject,source_url,published_at,observed_at,metadata FROM research_events
  WHERE verified=true AND source_type='sec_notice' AND subject=ANY($1::text[]) AND observed_at>=now()-make_interval(days=>$2)
  ORDER BY published_at DESC LIMIT 60`;
const OWNER_ROLES_SQL = `SELECT accession,owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner FROM sec_filing_owners WHERE accession=ANY($1::text[])`;
const SUBJECTS_SQL = `SELECT COALESCE((SELECT array_agg(ticker ORDER BY created_at DESC) FROM (SELECT ticker,created_at FROM watchlist WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200) w),'{}') AS tickers,
  COALESCE((SELECT array_agg(owner_cik) FROM (SELECT owner_cik FROM followed_people WHERE user_id=$1 ORDER BY created_at DESC LIMIT 150) p),'{}') AS people`;

/* ---------- Answer assembly ---------- */
function citations() {
  const list = [], byKey = new Map();
  const cite = r => {
    const url = secSource(r.url);
    if (!url) return null;
    const key = (r.accession || "") + "|" + url;
    if (byKey.has(key)) return byKey.get(key);
    const id = list.length + 1;
    list.push({ id, label: r.label, url, accession: r.accession || null, date: r.date || null, publishedAt: r.publishedAt || null, retrievedAt: r.retrievedAt || null, kind: r.kind });
    byKey.set(key, id);
    return id;
  };
  return { list, cite };
}
const fmtDate = d => d ? new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "date not reported";
const shares = n => n == null ? null : Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });

function lineCitation(cite, l, roles) {
  return cite({ url: l.source_url, accession: l.accession, kind: "form4", label: "Form " + (l.form_type || "4") + (l.is_amendment ? " (amendment)" : "") + " · " + (l.ticker || companyName(l.issuer_name)) + " · " + displayName(l.owner_name || roles?.[0]?.owner_name),
    date: day(l.transaction_date), publishedAt: iso(l.published_at), retrievedAt: iso(l.retrieved_at) });
}
function recordRow(l, roleMap, cite) {
  const role = roleMap.get(l.accession + "|" + bareCik(l.owner_cik)) || null;
  return { citation: lineCitation(cite, l), ticker: l.ticker, company: companyName(l.issuer_name, l.ticker), person: displayName(l.owner_name), personCik: l.owner_cik ? bareCik(l.owner_cik).padStart(10, "0") : null, role,
    transactionDate: day(l.transaction_date), disclosedAt: iso(l.published_at), code: l.transaction_code || null, codeLabel: codeLabel(l.transaction_code), category: l.category,
    derivative: !!l.derivative, security: l.security_title || null, shares: num(l.shares), price: num(l.price_per_share), value: num(l.estimated_value), amendment: !!l.is_amendment };
}

function insiderFacts(label, lines, roleMap, cite, { categories, capped }) {
  const facts = [];
  if (!lines.length) return { facts: [{ text: "No Form 4 " + (categories.length === 1 ? (categories[0] === "reported_sale" ? "sales" : "purchases") : "transactions") + " for " + label + " are indexed in this window." }], stats: summarizeLines([]) };
  const s = summarizeLines(lines);
  const filings = [...new Set(lines.map(l => l.accession))];
  const people = new Set(lines.map(l => bareCik(l.owner_cik) || l.owner_name));
  const disclosed = lines.map(l => iso(l.published_at)).filter(Boolean).sort();
  const sample = filings.slice(0, 3).map(a => lineCitation(cite, lines.find(l => l.accession === a)));
  facts.push({ text: count(filings.length, "Form 4 filing") + " for " + label + ", disclosed " + (disclosed[0].slice(0, 10) === disclosed.at(-1).slice(0, 10) ? "on " + fmtDate(disclosed[0].slice(0, 10)) : "between " + fmtDate(disclosed[0].slice(0, 10)) + " and " + fmtDate(disclosed.at(-1).slice(0, 10))) + ", report " + count(s.lines, "transaction line") + " by " + count(people.size, "person", "people") + (capped ? " (most recent " + LINES_PER_COMPANY + " lines shown)" : "") + ".", cites: sample });
  const bigSale = lines.filter(l => l.category === "reported_sale" && num(l.estimated_value) != null).sort((a, b) => num(b.estimated_value) - num(a.estimated_value))[0];
  const bigBuy = lines.filter(l => l.category === "reported_purchase" && num(l.estimated_value) != null).sort((a, b) => num(b.estimated_value) - num(a.estimated_value))[0];
  const saleCites = [...new Set(lines.filter(l => l.category === "reported_sale").map(l => l.accession))].slice(0, 4).map(a => lineCitation(cite, lines.find(l => l.accession === a)));
  const buyCites = [...new Set(lines.filter(l => l.category === "reported_purchase").map(l => l.accession))].slice(0, 4).map(a => lineCitation(cite, lines.find(l => l.accession === a)));
  if (!categories.length || categories.includes("reported_sale")) facts.push(s.sales
    ? { text: count(s.sales, "reported sale") + " (transaction code S)" + (s.saleValue ? " with a reported value of " + money(s.saleValue) : "") + (s.saleShares ? " covering " + shares(Math.round(s.saleShares)) + " shares" : "") + ".", cites: saleCites }
    : { text: "No open-market or private sales (code S) were reported." });
  if (!categories.length || categories.includes("reported_purchase")) facts.push(s.purchases
    ? { text: count(s.purchases, "reported purchase") + " (transaction code P)" + (s.purchaseValue ? " with a reported value of " + money(s.purchaseValue) : "") + (s.purchaseShares ? " covering " + shares(Math.round(s.purchaseShares)) + " shares" : "") + ".", cites: buyCites }
    : { text: "No open-market or private purchases (code P) were reported." });
  for (const [l, word] of [[bigSale, "sale"], [bigBuy, "purchase"]]) if (l && (!categories.length || categories.includes(l.category))) {
    const role = roleMap.get(l.accession + "|" + bareCik(l.owner_cik));
    facts.push({ text: "Largest reported " + word + ": " + displayName(l.owner_name) + (role ? " (" + role + ")" : "") + ", " + shares(num(l.shares)) + " shares" + (num(l.price_per_share) != null ? " at $" + num(l.price_per_share).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "") + " on " + fmtDate(day(l.transaction_date)) + ", reported value " + money(num(l.estimated_value)) + ".", cites: [lineCitation(cite, l)] });
  }
  if (!categories.length && s.other) {
    const codes = [...new Set(lines.filter(l => l.category === "other").map(l => String(l.transaction_code || "").toUpperCase()).filter(Boolean))].slice(0, 5);
    facts.push({ text: count(s.other, "other reported change") + (codes.length ? " (" + codes.map(c => codeLabel(c) + ", " + c).join("; ") + ")" : "") + ". These are not open-market trades." });
  }
  if (s.valuesMissing) facts.push({ text: count(s.valuesMissing, "purchase or sale line") + " did not include a price, so no value is stated for " + (s.valuesMissing === 1 ? "it" : "them") + "." });
  if (s.duplicatesCollapsed) facts.push({ text: count(s.duplicatesCollapsed, "line") + " repeated by a later amendment " + (s.duplicatesCollapsed === 1 ? "is" : "are") + " counted once." });
  return { facts, stats: { ...s, filings: filings.length, people: people.size, firstDisclosed: disclosed[0], lastDisclosed: disclosed.at(-1) } };
}

async function filingFacts(company, days, notices, cite, { loadCompany, gaps }) {
  const facts = [], since = Date.now() - days * 86400_000;
  let listed = [];
  try {
    const resolved = await Promise.race([loadCompany(company.ticker), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 5000))]);
    if (resolved?.submissions) listed = extractFilings(resolved.submissions, resolved.company.cik, 60).filter(f => Date.parse(f.filedAt + "T23:59:59Z") >= since);
    else gaps.push("EDGAR did not return a filing list for " + company.ticker + ".");
  } catch { gaps.push("The SEC's filing list for " + company.ticker + " could not be retrieved just now, so only filings Insidir has already indexed are shown."); }
  const seen = new Set();
  for (const f of listed) {
    seen.add(f.accession);
    const items = f.items?.length ? " — " + eightKLabel(f.items.map(i => i.code)) : "";
    facts.push({ text: fmtDate(f.filedAt) + ": " + (f.headline || "Filing") + " (" + f.form + ")" + (f.reportDate ? ", report date " + fmtDate(f.reportDate) : "") + items + ".",
      cites: [cite({ url: f.sourceUrl, accession: f.accession, kind: "filing", label: f.form + " · " + company.ticker + " · filed " + f.filedAt, date: f.reportDate, publishedAt: f.filedAt + "T00:00:00Z", retrievedAt: new Date().toISOString() })].filter(Boolean) });
  }
  for (const n of notices) {
    const acc = n.metadata?.accession;
    if (acc && seen.has(acc)) continue;
    const items = eightKLabel(n.metadata?.items || []);
    facts.push({ text: fmtDate(day(n.published_at)) + ": Current report (" + (n.metadata?.form || "8-K") + ")" + (items ? " — " + items : "") + ".",
      cites: [cite({ url: n.source_url, accession: acc, kind: "filing", label: (n.metadata?.form || "8-K") + " · " + company.ticker, date: n.metadata?.reportDate || null, publishedAt: iso(n.published_at), retrievedAt: iso(n.observed_at) })].filter(Boolean) });
  }
  if (!facts.length) facts.push({ text: "No 8-K, 10-K, 10-Q or other periodic filings by " + company.ticker + " were found in this window." });
  return { facts: facts.slice(0, 20), listed: listed.length + notices.length };
}

function followUps(plan, watch) {
  const out = [], first = plan.companies[0]?.ticker;
  const other = watch.find(t => !plan.companies.some(c => c.ticker === t));
  if (first) {
    if (plan.intent !== "filings") out.push("What changed in " + first + "'s recent SEC filings?");
    if (plan.intent !== "insider_activity") out.push("Show me recent insider sales at " + first);
    if (!plan.categories.includes("reported_purchase")) out.push("Only purchases at " + first + " this year");
    if (other && plan.companies.length === 1) out.push("Compare " + first + " with " + other);
  } else {
    out.push("What companies have the executives I follow disclosed transactions in?");
    out.push("What changed since my last visit?");
    if (watch[0]) out.push("Show me recent insider sales at " + watch[0]);
  }
  return out.slice(0, 4);
}

/* The full deterministic answer. deps: run, loadCompany (EDGAR submissions, cached), directory, now. */
export async function investigate(userId, question, { run = queryDb, context = null, loadCompany = resolveCompany, directory, now = Date.now() } = {}) {
  const text = String(question ?? "").replace(/\s+/g, " ").trim();
  if (!text) throw fail(400, "Ask a research question");
  if (text.length > MAX_QUESTION) throw fail(400, "Questions are limited to " + MAX_QUESTION + " characters");
  const screened = screenQuestion(text);
  const retrievedAt = new Date(now).toISOString();
  if (!screened.allowed) return { status: "refused", question: text, reason: screened.reason, message: screened.reply, summary: [], sections: [], citations: [], gaps: [], followUps: ["What did Nvidia insiders disclose this month?", "What changed since my last visit?"], retrievedAt, advice: false };
  const dir = directory || await companyDirectory(run);
  const plan = parseQuestion(text, dir, { now, context });
  const subjects = (await run(SUBJECTS_SQL, [userId])).rows[0] || { tickers: [], people: [] };
  const watch = subjects.tickers || [];
  const { list: cites, cite } = citations();
  const gaps = [], sections = [], summary = [];
  for (const u of plan.unmatched) gaps.push("“" + u + "” did not match a company in Insidir's SEC index, so it was not included.");
  for (const a of plan.ambiguous) gaps.push("“" + a.phrase + "” matches several registrants (" + a.tickers.join(", ") + "); " + plan.companies.find(c => a.tickers.includes(c.ticker))?.ticker + " was used. Name the ticker to choose another.");
  if (plan.extraCompanies) gaps.push("Only the first " + MAX_COMPANIES + " companies named are researched in one question.");
  const cats = plan.categories.length ? plan.categories : null;
  let status = "answered";

  if (plan.intent === "changes_since_visit") {
    const brief = await intelligenceBriefing(userId, { run, days: 30, now, trackVisit: false });
    const since = brief.since;
    const fresh = since ? brief.stories.filter(s => s.isNew) : brief.stories;
    plan.timeLabel = since ? "since your last visit (" + fmtDate(since.slice(0, 10)) + ")" : "the last 30 days (no earlier visit recorded)";
    if (brief.needsSetup) { status = "no_data"; gaps.push("Your watchlist and followed people are empty, so there is nothing personal to compare against. Follow a company or a person first."); }
    for (const s of fresh.slice(0, 12)) sections.push({ kind: "story", title: s.headline, ticker: s.ticker, company: s.company,
      facts: [...s.facts.map(f => ({ text: f })), { text: "Why it's here: " + s.why.map(w => w.text).join("; ") + "." }].map(f => ({ ...f, cites: s.sources.slice(0, 3).map(src => cite({ url: src.url, accession: src.accession, kind: s.kind === "company_report" ? "filing" : "form4", label: src.label + " · " + (s.ticker || s.company), publishedAt: src.filedAt, retrievedAt: s.retrievedAt })).filter(Boolean) })),
      eventDate: s.eventDate, disclosedAt: s.disclosedAt, records: [] });
    summary.push({ text: fresh.length ? count(fresh.length, "update") + " for your watchlist and followed people " + plan.timeLabel + "." : "Nothing new has been indexed for your watchlist or followed people " + plan.timeLabel + "." });
    if (fresh.length > 12) gaps.push("Showing the 12 highest-ordered of " + fresh.length + " updates; the briefing lists all of them.");
    if (!fresh.length && !brief.needsSetup) status = "no_data";
  } else if (plan.scope === "followed_people" || (plan.scope === "watchlist")) {
    if (plan.scope === "watchlist") plan.companies = watch.slice(0, MAX_COMPANIES).map(t => ({ ticker: t, name: dir.byTicker.get(t)?.name || t, cik: dir.byTicker.get(t)?.cik || null, matchedBy: "watchlist", phrase: t }));
    if (plan.scope === "watchlist" && watch.length > MAX_COMPANIES) gaps.push("Your watchlist has " + watch.length + " companies; this answer covers the " + MAX_COMPANIES + " added most recently. Name a company to research another.");
    if (plan.scope === "watchlist" && !watch.length) { status = "no_data"; gaps.push("Your watchlist is empty."); }
  }
  const days = plan.days || 30;

  if (plan.intent !== "changes_since_visit" && plan.scope === "followed_people") {
    const people = subjects.people || [];
    if (!people.length) { status = "no_data"; gaps.push("You do not follow anyone yet. Follow reporting people from their Insidir file to research them here."); }
    else {
      const rows = (await run(PEOPLE_LINES_SQL, [cikForms(people), days, cats])).rows;
      const capped = rows.length > PEOPLE_LINES; if (capped) { rows.length = PEOPLE_LINES; gaps.push("More than " + PEOPLE_LINES + " lines matched; the most recent are summarised."); }
      const roleMap = await rolesFor(run, rows);
      const byCompany = new Map();
      for (const l of rows) { const k = l.ticker || l.issuer_cik; if (!byCompany.has(k)) byCompany.set(k, []); byCompany.get(k).push(l); }
      const companies = [...byCompany.entries()].sort((a, b) => b[1].length - a[1].length);
      summary.push({ text: companies.length
        ? "People you follow disclosed transactions in " + count(companies.length, "company", "companies") + " in " + plan.timeLabel + ": " + companies.slice(0, 8).map(([k, ls]) => (ls[0].ticker || companyName(ls[0].issuer_name)) + " (" + count(ls.length, "line") + ")").join(", ") + "."
        : "None of the " + count(people.length, "person", "people") + " you follow disclosed a matching Form 4 transaction in " + plan.timeLabel + ".",
        cites: companies.slice(0, 8).map(([, ls]) => lineCitation(cite, ls[0])) });
      if (!companies.length) status = "no_data";
      for (const [, ls] of companies.slice(0, 8)) {
        const label = companyName(ls[0].issuer_name, ls[0].ticker) + (ls[0].ticker ? " (" + ls[0].ticker + ")" : "");
        const f = insiderFacts(label, ls, roleMap, cite, { categories: plan.categories, capped: false });
        sections.push({ kind: "company", title: label, ticker: ls[0].ticker, company: companyName(ls[0].issuer_name, ls[0].ticker), facts: f.facts, stats: f.stats, records: ls.slice(0, 15).map(l => recordRow(l, roleMap, cite)) });
      }
    }
  } else if (plan.intent !== "changes_since_visit" && plan.scope === "market") {
    const want = cats || ["reported_purchase", "reported_sale"];
    const rows = (await run(MARKET_LINES_SQL, [want, days])).rows;
    const roleMap = await rolesFor(run, rows);
    summary.push({ text: rows.length ? "The " + count(rows.length, "largest reported " + (want.length === 1 ? (want[0] === "reported_sale" ? "sale" : "purchase") : "open-market transaction")) + " indexed across all companies in " + plan.timeLabel + ", by reported value." : "No priced open-market transactions are indexed in " + plan.timeLabel + ".",
      cites: rows.slice(0, 3).map(l => lineCitation(cite, l)) });
    if (!rows.length) status = "no_data";
    sections.push({ kind: "market", title: "Largest reported transactions", facts: [], records: rows.map(l => recordRow(l, roleMap, cite)) });
    gaps.push("Ranked by the value the filer reported (shares × reported price); derivative transactions and lines without a price are left out.");
  } else if (plan.intent !== "changes_since_visit" && plan.companies.length) {
    const tickers = plan.companies.map(c => c.ticker);
    const wantInsider = plan.intent !== "filings", wantFilings = plan.intent === "filings" || plan.intent === "overview";
    const [lineRows, noticeRows] = await Promise.all([
      wantInsider ? run(COMPANY_LINES_SQL, [tickers, days, cats]) : Promise.resolve({ rows: [] }),
      wantFilings ? run(NOTICES_SQL, [tickers, days]) : Promise.resolve({ rows: [] })
    ]);
    const roleMap = await rolesFor(run, lineRows.rows);
    const compareRows = [];
    for (const c of plan.companies) {
      const label = c.name + " (" + c.ticker + ")";
      const all = lineRows.rows.filter(l => l.ticker === c.ticker);
      const capped = all.length > LINES_PER_COMPANY; if (capped) all.length = LINES_PER_COMPANY;
      const section = { kind: "company", title: label, ticker: c.ticker, company: c.name, facts: [], records: [] };
      if (wantInsider) {
        const f = insiderFacts(label, all, roleMap, cite, { categories: plan.categories, capped });
        section.facts.push(...f.facts); section.stats = f.stats;
        section.records = all.slice(0, 25).map(l => recordRow(l, roleMap, cite));
        compareRows.push({ ticker: c.ticker, company: c.name, filings: f.stats.filings || 0, people: f.stats.people || 0, sales: f.stats.sales, saleValue: f.stats.saleValue, purchases: f.stats.purchases, purchaseValue: f.stats.purchaseValue, other: f.stats.other, lastDisclosed: f.stats.lastDisclosed || null,
          cites: [...new Set(all.map(l => l.accession))].slice(0, 2).map(a => lineCitation(cite, all.find(l => l.accession === a))) });
        if (capped) gaps.push(c.ticker + " has more than " + LINES_PER_COMPANY + " lines in this window; totals cover the most recent " + LINES_PER_COMPANY + ".");
      }
      if (wantFilings) {
        const ff = await filingFacts(c, days, noticeRows.rows.filter(n => n.subject === c.ticker), cite, { loadCompany, gaps });
        section.filings = ff.facts;
      }
      sections.push(section);
    }
    if (plan.intent === "compare") {
      const rows = compareRows;
      summary.push({ text: "Indexed Form 4 activity over " + plan.timeLabel + ": " + rows.map(r => r.ticker + " — " + count(r.filings, "filing") + ", " + count(r.sales, "reported sale") + (r.saleValue ? " (" + money(r.saleValue) + ")" : "") + ", " + count(r.purchases, "reported purchase") + (r.purchaseValue ? " (" + money(r.purchaseValue) + ")" : "")).join("; ") + ".", cites: rows.flatMap(r => r.cites).slice(0, 6) });
      sections.unshift({ kind: "comparison", title: "Side by side", columns: ["Filings", "People", "Sales", "Sale value", "Purchases", "Purchase value", "Other changes", "Last disclosed"], rows: rows.map(({ cites: c, ...r }) => ({ ...r, citation: c[0] || null })) });
    } else {
      for (const s of sections.filter(x => x.kind === "company")) {
        if (s.stats?.lines) {
          const st = s.stats;
          const parts = [];
          if (!plan.categories.length || plan.categories.includes("reported_sale")) parts.push(st.sales ? count(st.sales, "reported sale") + (st.saleValue ? " (" + money(st.saleValue) + ")" : "") : "no reported sales");
          if (!plan.categories.length || plan.categories.includes("reported_purchase")) parts.push(st.purchases ? count(st.purchases, "reported purchase") + (st.purchaseValue ? " (" + money(st.purchaseValue) + ")" : "") : "no reported purchases");
          summary.push({ text: s.title + ": " + count(st.filings, "Form 4 filing") + " by " + count(st.people, "person", "people") + " in " + plan.timeLabel + " — " + parts.join(" and ") + ".", cites: (s.facts[0]?.cites || []).slice(0, 3) });
        } else if (plan.intent !== "filings") summary.push({ text: s.title + ": no indexed Form 4 " + (plan.categories.length === 1 ? (plan.categories[0] === "reported_sale" ? "sales" : "purchases") : "activity") + " in " + plan.timeLabel + "." });
        if (s.filings) summary.push({ text: s.title + ": " + (s.filings.filter(f => f.cites?.length).length ? count(s.filings.filter(f => f.cites?.length).length, "SEC filing") + " in " + plan.timeLabel + " (listed below with links)." : "no SEC filings found in " + plan.timeLabel + "."), cites: s.filings.flatMap(f => f.cites || []).slice(0, 3) });
      }
    }
    if (!sections.some(s => (s.stats && s.stats.lines) || (s.filings && s.filings.some(f => f.cites?.length)))) status = "no_data";
    if (wantFilings) gaps.push("Insidir lists SEC filings and the 8-K items each one reports; it does not compare the full text of 10-K or 10-Q reports. Open the linked documents to read what changed.");
  } else if (plan.intent !== "changes_since_visit" && plan.scope !== "watchlist") {
    status = "unresolved";
    summary.push({ text: "Insidir could not tell which company or people this question is about. Name a company or ticker (for example “NVDA” or “Microsoft”), or ask about your watchlist or the people you follow." });
  }
  if (status !== "refused" && plan.intent !== "changes_since_visit") gaps.push("Form 4 reports are due within two business days of a transaction, so the last few days may still be filling in. Records Insidir has not indexed do not appear here, and their absence does not prove nothing happened.");
  const answer = { status, question: text, plan: publicPlan(plan), summary, sections, citations: cites, gaps: [...new Set(gaps)], followUps: followUps(plan, watch), retrievedAt, advice: false, executed: false,
    method: "Structured retrieval from Insidir's SEC index and EDGAR; sentences are assembled from the records, not written by a model." };
  answer.synthesis = { available: aiConfigured() && cites.length > 0 && status === "answered", tier: synthesisTier(answer) };
  return answer;
}

async function rolesFor(run, rows) {
  const acc = [...new Set(rows.map(r => r.accession))].slice(0, 400);
  const map = new Map();
  if (!acc.length) return map;
  for (const o of (await run(OWNER_ROLES_SQL, [acc])).rows) map.set(o.accession + "|" + bareCik(o.owner_cik), roleOf(o));
  return map;
}
export function publicPlan(plan) {
  return { tickers: plan.companies.map(c => c.ticker), companies: plan.companies.map(c => ({ ticker: c.ticker, name: c.name, matchedBy: c.matchedBy })), scope: plan.scope, intent: plan.intent,
    categories: plan.categories, days: plan.days, timeLabel: plan.timeLabel, sinceVisit: plan.sinceVisit, usedContext: plan.usedContext };
}
/* Deep model only for multi-document research; everything else uses the inexpensive model. */
export function synthesisTier(answer) {
  const n = answer.citations?.length || 0;
  return answer.plan?.intent === "compare" || (answer.plan?.tickers?.length || 0) >= 2 || answer.plan?.scope === "followed_people" || n >= 15 ? "deep" : "fast";
}

/* The evidence a model may use: the factual sentences and the citation list, numbered. */
export function evidencePack(answer) {
  const lines = ["Question: " + answer.question, "Time range: " + (answer.plan?.timeLabel || "")];
  for (const s of answer.summary) lines.push("Fact: " + s.text + (s.cites?.length ? " " + s.cites.map(c => "[" + c + "]").join("") : ""));
  for (const sec of answer.sections) {
    if (sec.title) lines.push("Section: " + sec.title);
    for (const f of [...(sec.facts || []), ...(sec.filings || [])]) lines.push("Fact: " + f.text + (f.cites?.length ? " " + f.cites.map(c => "[" + c + "]").join("") : ""));
    if (sec.kind === "comparison") for (const r of sec.rows) lines.push("Row: " + r.ticker + " filings " + r.filings + ", people " + r.people + ", sales " + r.sales + ", sale value " + r.saleValue + ", purchases " + r.purchases + ", purchase value " + r.purchaseValue + ", other " + r.other + (r.citation ? " [" + r.citation + "]" : ""));
  }
  for (const c of answer.citations) lines.push("Source [" + c.id + "]: " + c.label + "; filed " + (c.publishedAt || "").slice(0, 10) + "; " + c.url);
  for (const g of answer.gaps) lines.push("Limitation: " + g);
  return lines.join("\n");
}
/* Checks on a synthesis: the usual source/advice review, at least one citation, every [n] real. */
export function verifySynthesis(text, answer, evidence) {
  const review = reviewGeneratedText({ text, sources: [{ text: evidence }], retrievedAt: answer.retrievedAt });
  const problems = [...review.problems];
  const used = [...String(text).matchAll(/\[(\d{1,3})\]/g)].map(m => Number(m[1]));
  if (!used.length) problems.push({ kind: "no_citations" });
  const bad = used.filter(n => n < 1 || n > answer.citations.length);
  if (bad.length) problems.push({ kind: "unknown_citation", items: [...new Set(bad)] });
  return { allowed: problems.length === 0, problems, citationsUsed: [...new Set(used)].filter(n => n >= 1 && n <= answer.citations.length) };
}
export const SYNTHESIS_PROMPT_VERSION = "investigate-v1";
export async function synthesize(userId, question, { run = queryDb, context = null, loadCompany = resolveCompany, directory, env = process.env, generate } = {}) {
  const answer = await investigate(userId, question, { run, context, loadCompany, directory });
  if (answer.status !== "answered" || !answer.citations.length) return { status: "not_applicable", reason: "There is no cited evidence to summarise.", answer: null };
  if (!aiConfigured(env)) return { status: "unavailable", reason: "AI summaries are not configured on this deployment." };
  const evidence = evidencePack(answer);
  const tier = synthesisTier(answer);
  const result = await cachedGeneration({ sourceType: "investigation", sourceId: sha256(JSON.stringify(answer.plan)), content: evidence, explanationType: "investigation_synthesis",
    promptVersion: SYNTHESIS_PROMPT_VERSION, tier, maxTokens: tier === "deep" ? 420 : 300, userId, feature: "investigation_synthesis", run, env, ...(generate ? { generate } : {}),
    build: () => [{ role: "system", content: SYSTEM_RULES + " Write 2-4 short paragraphs answering the question. After every sentence that states a fact, cite its sources as [n] using only the source numbers given. Do not repeat the limitations verbatim; mention the most important one in one sentence." },
      { role: "user", content: "<evidence>\n" + sanitizeEvidence(evidence, 11000) + "\n</evidence>" }],
    verify: text => verifySynthesis(text, answer, evidence) });
  if (result.status === "ready") return { status: "ready", text: result.text, model: result.model, tier, cached: result.cached, generatedAt: result.generatedAt, citationsUsed: verifySynthesis(result.text, answer, evidence).citationsUsed };
  if (result.status === "blocked") return { status: "blocked", reason: "The AI summary did not pass Insidir's source checks, so only the factual answer is shown." };
  if (result.status === "limited") return { status: "limited", reason: result.error };
  if (result.status === "pending") return { status: "pending", reason: "This summary is being written for another reader; try again in a few seconds." };
  return { status: "failed", reason: "The AI summary is unavailable right now; the factual answer above is complete without it." };
}
