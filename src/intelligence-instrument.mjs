/* The Insidir instrument, the event tape and the capital structure view (intelligence.html).
 *
 * Every figure here is read from stored public records: Form 4 filings, their reporting owners and lines
 * (sec_filings, sec_filing_owners, sec_transactions), 8-K/6-K notices (research_events) and Form 13F reports
 * (form13f_filings). Nothing is estimated, scored or animated from invented activity. The market-wide part of
 * the instrument is the same for every member, so it is computed once and shared for a few minutes; the
 * member's own part (watchlist, follows) is a handful of indexed lookups.
 *
 * Relationship labels say only what the source establishes: a Form 4 relationship box checked by the filer
 * (director, officer and title, 10% owner, other), or "reported transactions in" a security. Neither is a
 * statement about control or about a complete holding. */
import { query as queryDb } from "./db.mjs";
import { iso, day, cikForms, bareCik, displayName, companyName, roleOf, codeLabel, eightKLabel, secSource } from "./intelligence-common.mjs";

const fail = (status, message) => Object.assign(new Error(message), { status });
const WINDOW_DAYS = 30;

/* The ten dots of the Insidir mark (web/assets/icons/favicon.svg, in its circle order) and the layer of
 * intelligence each one opens. The geometry is the logo's own; test/intelligence-instrument.test.mjs checks it. */
export const MARK = Object.freeze([
  { id: "companies", cx: 416, cy: 390, r: 53, label: "Companies", part: "crossbar" },
  { id: "filings", cx: 512, cy: 390, r: 53, label: "SEC filings", part: "crossbar" },
  { id: "insiders", cx: 608, cy: 390, r: 53, label: "Reporting insiders", part: "crossbar" },
  { id: "purchases", cx: 512, cy: 486, r: 53, label: "Reported purchases", part: "stem" },
  { id: "sales", cx: 512, cy: 582, r: 53, label: "Reported sales", part: "stem" },
  { id: "changes", cx: 512, cy: 678, r: 53, label: "Ownership changes", part: "stem" },
  { id: "watchlist", cx: 416, cy: 774, r: 53, label: "Your watchlist", part: "base" },
  { id: "people", cx: 512, cy: 774, r: 53, label: "People you follow", part: "base" },
  { id: "holdings", cx: 608, cy: 774, r: 53, label: "Institutional holdings", part: "base" },
  { id: "findings", cx: 512, cy: 194, r: 67, label: "Research findings", part: "tittle" }
]);

const WIN = `f.ingest_status='parsed' AND f.published_at>=now()-interval '${WINDOW_DAYS} days'`;
export const MARKET_SQL = Object.freeze({
  totals: `SELECT count(*)::integer AS filings,count(DISTINCT f.issuer_cik)::integer AS companies,max(f.published_at) AS latest,max(f.retrieved_at) AS retrieved
    FROM sec_filings f WHERE ${WIN}`,
  lines: `SELECT count(*) FILTER (WHERE t.category='reported_purchase')::integer AS purchases,
      COALESCE(sum(t.estimated_value) FILTER (WHERE t.category='reported_purchase'),0)::float8 AS purchase_value,
      count(*) FILTER (WHERE t.category='reported_sale')::integer AS sales,
      COALESCE(sum(t.estimated_value) FILTER (WHERE t.category='reported_sale'),0)::float8 AS sale_value,
      count(*) FILTER (WHERE t.category='other')::integer AS other
    FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession WHERE ${WIN}`,
  insiders: `SELECT count(DISTINCT o.owner_cik)::integer AS n FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession WHERE ${WIN}`,
  topCompanies: `SELECT f.ticker,max(f.issuer_name) AS issuer_name,max(f.issuer_cik) AS issuer_cik,count(*)::integer AS n,max(f.published_at) AS last
    FROM sec_filings f WHERE ${WIN} AND f.ticker IS NOT NULL GROUP BY f.ticker ORDER BY n DESC,last DESC LIMIT 6`,
  latestFilings: `SELECT f.accession,f.ticker,f.issuer_name,f.form_type,f.published_at,f.source_url,f.owner_names[1] AS owner
    FROM sec_filings f WHERE ${WIN} ORDER BY f.published_at DESC LIMIT 6`,
  topInsiders: `SELECT o.owner_cik,max(o.owner_name) AS owner_name,count(*)::integer AS n,max(f.ticker) AS ticker,max(f.published_at) AS last,
      bool_or(o.is_director) AS is_director,bool_or(o.is_officer) AS is_officer,max(o.officer_title) AS officer_title,bool_or(o.is_ten_percent_owner) AS is_ten_percent_owner
    FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession WHERE ${WIN} GROUP BY o.owner_cik ORDER BY n DESC,last DESC LIMIT 6`,
  largest: `SELECT t.accession,t.ticker,t.owner_cik,t.owner_name,t.transaction_date,t.shares,t.price_per_share,t.estimated_value,f.issuer_name,f.issuer_cik,f.published_at,f.source_url
    FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE ${WIN} AND t.category=$1 AND NOT t.derivative AND t.estimated_value IS NOT NULL ORDER BY t.estimated_value DESC LIMIT 6`,
  codes: `SELECT upper(t.transaction_code) AS code,count(*)::integer AS n FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    WHERE ${WIN} AND t.category='other' AND t.transaction_code IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6`,
  notices: `SELECT count(*)::integer AS n FROM research_events WHERE verified=true AND source_type='sec_notice' AND observed_at>=now()-interval '${WINDOW_DAYS} days'`,
  holdings: `SELECT m.cik,m.name,f.period_of_report,f.filed_at,f.parsed_entries,f.parsed_value_total,f.source_url
    FROM form13f_managers m JOIN LATERAL (SELECT * FROM form13f_filings x WHERE x.manager_cik=m.cik ORDER BY period_of_report DESC,filed_at DESC LIMIT 1) f ON true
    WHERE m.status='ok' ORDER BY f.parsed_value_total DESC LIMIT 6`
});
export const MEMBER_SQL = Object.freeze({
  watchlist: `SELECT w.ticker,
      (SELECT count(*) FROM sec_filings f WHERE f.ticker=w.ticker AND ${WIN})::integer AS n,
      (SELECT max(f.published_at) FROM sec_filings f WHERE f.ticker=w.ticker AND f.ingest_status='parsed') AS last,
      (SELECT max(f.issuer_name) FROM sec_filings f WHERE f.ticker=w.ticker AND f.ingest_status='parsed') AS issuer_name
    FROM watchlist w WHERE w.user_id=$1 ORDER BY w.created_at DESC LIMIT 60`,
  people: `SELECT p.owner_cik,s.owner_name,s.ticker,s.last,s.n FROM (SELECT owner_cik,created_at FROM followed_people WHERE user_id=$1 ORDER BY created_at DESC LIMIT 150) p
    LEFT JOIN LATERAL (SELECT max(o.owner_name) AS owner_name,max(f.ticker) AS ticker,max(f.published_at) AS last,
        count(*) FILTER (WHERE f.published_at>=now()-interval '${WINDOW_DAYS} days')::integer AS n
      FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession AND f.ingest_status='parsed'
      WHERE o.owner_cik IN (LTRIM(p.owner_cik,'0'),LPAD(LTRIM(p.owner_cik,'0'),10,'0'))) s ON true
    ORDER BY s.last DESC NULLS LAST LIMIT 60`
});

const href = {
  company: t => t && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t) ? "company.html?ticker=" + encodeURIComponent(t) : null,
  person: c => c && /^\d{1,10}$/.test(bareCik(c)) ? "person.html?cik=" + bareCik(c).padStart(10, "0") : null
};
const rec = (title, meta, link, external = false, extra = {}) => ({ title, meta, href: link || null, external, ...extra });
/* The reporting person a record is about, for the page's headshot tile (owner CIK without leading zeros). */
const who = (name, cik) => cik && /^\d{1,10}$/.test(bareCik(cik)) ? { person: name ? displayName(name) : null, personCik: bareCik(cik) } : {};

let shared = { at: 0, value: null, pending: null };
export const resetInstrumentCache = () => { shared = { at: 0, value: null, pending: null }; };
async function marketLayer(run, ttlMs) {
  if (shared.value && Date.now() - shared.at < ttlMs) return shared.value;
  if (shared.pending) return shared.pending;
  shared.pending = (async () => {
    const q = async (sql, p = []) => (await run(sql, p)).rows;
    const [totals, lines, insiders, topCompanies, latestFilings, topInsiders, buys, sells, codes, notices, holdings] = await Promise.all([
      q(MARKET_SQL.totals), q(MARKET_SQL.lines), q(MARKET_SQL.insiders), q(MARKET_SQL.topCompanies), q(MARKET_SQL.latestFilings), q(MARKET_SQL.topInsiders),
      q(MARKET_SQL.largest, ["reported_purchase"]), q(MARKET_SQL.largest, ["reported_sale"]), q(MARKET_SQL.codes), q(MARKET_SQL.notices),
      q(MARKET_SQL.holdings).catch(() => [])
    ]);
    const value = { totals: totals[0] || {}, lines: lines[0] || {}, insiders: insiders[0]?.n || 0, topCompanies, latestFilings, topInsiders, buys, sells, codes, notices: notices[0]?.n || 0, holdings, computedAt: new Date().toISOString() };
    shared = { at: Date.now(), value, pending: null };
    return value;
  })().finally(() => { shared.pending = null; });
  return shared.pending;
}

const lineRecord = l => rec(displayName(l.owner_name) + " · " + (l.ticker || companyName(l.issuer_name)),
  Number(l.shares).toLocaleString("en-US") + " shares" + (l.price_per_share != null ? " at $" + Number(l.price_per_share).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "") + " · " + (day(l.transaction_date) || "date not reported"),
  secSource(l.source_url), true, { value: Number(l.estimated_value), date: iso(l.published_at), ticker: l.ticker || null, issuerCik: l.issuer_cik ? bareCik(l.issuer_cik) : null, ...who(l.owner_name, l.owner_cik) });

/* The ten categories, each with a count from stored records, a few real records and a place to explore them. */
export async function instrument(userId, { run = queryDb, ttlMs = 5 * 60_000 } = {}) {
  const [m, watch, people] = await Promise.all([marketLayer(run, ttlMs), run(MEMBER_SQL.watchlist, [userId]), run(MEMBER_SQL.people, [userId])]);
  const L = m.lines, T = m.totals;
  const categories = {
    companies: { count: T.companies || 0, unit: "issuers with Form 4 filings", records: m.topCompanies.map(c => rec(companyName(c.issuer_name, c.ticker) + " (" + c.ticker + ")", c.n + " filings · last " + day(c.last), href.company(c.ticker), false, { ticker: c.ticker, issuerCik: c.issuer_cik ? bareCik(c.issuer_cik) : null })), explore: { label: "All companies", href: "explore.html" } },
    filings: { count: (T.filings || 0) + m.notices, unit: "Form 4 filings and company reports", detail: (T.filings || 0) + " Form 4 · " + m.notices + " 8-K/6-K",
      records: m.latestFilings.map(f => rec("Form " + f.form_type + " · " + (f.ticker || companyName(f.issuer_name)), (f.owner ? displayName(f.owner) + " · " : "") + "filed " + iso(f.published_at)?.slice(0, 16).replace("T", " ") + " UTC", secSource(f.source_url), true, { ticker: f.ticker })), explore: { label: "All filings", href: "filings.html" } },
    insiders: { count: m.insiders, unit: "reporting people", records: m.topInsiders.map(p => rec(displayName(p.owner_name), (roleOf(p) || "Reporting person") + " · " + p.n + " filings" + (p.ticker ? " · " + p.ticker : ""), href.person(p.owner_cik), false, { ticker: p.ticker, ...who(p.owner_name, p.owner_cik) })), explore: { label: "All people", href: "people.html" } },
    purchases: { count: L.purchases || 0, unit: "purchase lines (code P)", value: L.purchase_value || 0, records: m.buys.map(lineRecord), explore: { label: "All transactions", href: "filings.html" } },
    sales: { count: L.sales || 0, unit: "sale lines (code S)", value: L.sale_value || 0, records: m.sells.map(lineRecord), explore: { label: "All transactions", href: "filings.html" } },
    changes: { count: L.other || 0, unit: "grants, exercises, withholdings and other changes", records: m.codes.map(c => rec(codeLabel(c.code) + " (" + c.code + ")", c.n + " lines", null)), explore: { label: "Read a filing", href: "filings.html" } },
    watchlist: { count: watch.rows.length, unit: "companies you follow", detail: watch.rows.filter(r => r.n > 0).length + " with filings in " + WINDOW_DAYS + " days",
      records: watch.rows.slice(0, 8).map(w => rec(companyName(w.issuer_name, w.ticker) + " (" + w.ticker + ")", w.n ? w.n + " filings in " + WINDOW_DAYS + " days" : "No filings in " + WINDOW_DAYS + " days", href.company(w.ticker), false, { ticker: w.ticker, active: w.n > 0 })), explore: { label: "Your watchlist", href: "watchlist.html" } },
    people: { count: people.rows.length, unit: "people you follow", detail: people.rows.filter(p => p.n > 0).length + " filed in " + WINDOW_DAYS + " days",
      records: people.rows.slice(0, 8).map(p => rec(p.owner_name ? displayName(p.owner_name) : "CIK " + bareCik(p.owner_cik), p.last ? (p.n || 0) + " filings in " + WINDOW_DAYS + " days · last " + day(p.last) : "No imported filings yet", href.person(p.owner_cik), false, { ticker: p.ticker, active: p.n > 0, ...who(p.owner_name, p.owner_cik) })), explore: { label: "People", href: "people.html" } },
    holdings: { count: m.holdings.length, unit: "managers with imported 13F reports", records: m.holdings.map(h => rec(companyName(h.name), "Quarter ended " + day(h.period_of_report) + " · filed " + day(h.filed_at) + " · " + h.parsed_entries + " rows", "#mirror", false)), explore: { label: "Open Mirror", href: "#mirror" } },
    findings: { count: null, unit: "stories in your briefing", records: [], explore: { label: "Read the briefing", href: "#briefing" }, fromBriefing: true }
  };
  return {
    windowDays: WINDOW_DAYS, computedAt: m.computedAt, latestFilingAt: iso(T.latest), latestRetrievedAt: iso(T.retrieved),
    mark: MARK.map(d => ({ ...d, ...categories[d.id] })),
    note: "Counts and records come from Insidir's stored SEC records for the last " + WINDOW_DAYS + " days, computed at the time shown. They are not live market data.",
    advice: false
  };
}

/* ---------- Event tape ---------- */
export const TAPE_SQL = Object.freeze({
  form4: `SELECT f.accession,f.ticker,f.issuer_name,f.issuer_cik,f.form_type,f.is_amendment,f.published_at,f.retrieved_at,f.source_url,
      o.owners,o.first_cik,t.purchases,t.sales,t.other,t.buy_value,t.sell_value,t.first_date
    FROM sec_filings f
    LEFT JOIN LATERAL (SELECT string_agg(x.owner_name,'; ' ORDER BY x.owner_name) AS owners,min(x.owner_cik) AS first_cik FROM sec_filing_owners x WHERE x.accession=f.accession) o ON true
    LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE category='reported_purchase')::integer AS purchases,count(*) FILTER (WHERE category='reported_sale')::integer AS sales,
        count(*) FILTER (WHERE category='other')::integer AS other,
        sum(estimated_value) FILTER (WHERE category='reported_purchase')::float8 AS buy_value,sum(estimated_value) FILTER (WHERE category='reported_sale')::float8 AS sell_value,
        min(transaction_date) AS first_date FROM sec_transactions y WHERE y.accession=f.accession) t ON true
    WHERE f.ingest_status='parsed' AND f.published_at>=now()-make_interval(days=>$1) AND f.published_at<$2
      AND ($3::text IS NULL OR f.ticker=$3)
      AND ($4::text[] IS NULL OR EXISTS(SELECT 1 FROM sec_filing_owners z WHERE z.accession=f.accession AND z.owner_cik=ANY($4::text[])))
      AND ($5::text IS NULL OR EXISTS(SELECT 1 FROM sec_filing_owners z WHERE z.accession=f.accession AND z.owner_name ILIKE '%'||$5||'%'))
    ORDER BY f.published_at DESC LIMIT $6`,
  notices: `SELECT event_key,subject,source_url,published_at,observed_at,metadata FROM research_events
    WHERE verified=true AND source_type='sec_notice' AND published_at>=now()-make_interval(days=>$1) AND published_at<$2 AND ($3::text IS NULL OR subject=$3)
    ORDER BY published_at DESC LIMIT $4`,
  holdings: `SELECT f.accession,f.manager_cik,m.name,f.form_type,f.period_of_report,f.filed_at,f.retrieved_at,f.source_url,f.parsed_value_total,f.parsed_entries
    FROM form13f_filings f JOIN form13f_managers m ON m.cik=f.manager_cik
    WHERE f.filed_at>=(now()-make_interval(days=>$1))::date AND f.filed_at<$2::timestamptz::date+1 ORDER BY f.filed_at DESC LIMIT $3`,
  since: `SELECT last_visit_at,previous_visit_at FROM intelligence_preferences WHERE user_id=$1`
});
export const TAPE_FORMS = Object.freeze(["all", "4", "8-K", "13F"]);
export function parseTapeFilters(params) {
  const g = k => (params.get ? params.get(k) : params[k]) ?? "";
  const days = [1, 7, 30, 90].includes(Number(g("days"))) ? Number(g("days")) : 7;
  const form = TAPE_FORMS.includes(String(g("form"))) ? String(g("form")) : "all";
  const tk = String(g("ticker")).trim().toUpperCase().replace(/^\$/, "");
  if (tk && !/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(tk)) throw fail(400, "Invalid ticker");
  const person = String(g("person")).trim().replace(/\s+/g, " ").slice(0, 60);
  if (person && !/^[\p{L}\p{N} .,'&-]+$/u.test(person)) throw fail(400, "Invalid person filter");
  const before = g("before") ? new Date(String(g("before"))) : null;
  if (before && !Number.isFinite(before.getTime())) throw fail(400, "Invalid cursor");
  return { days, form, ticker: tk || null, person: person || null, before: before ? before.toISOString() : null };
}
function classify(f) {
  if (f.is_amendment) return "Amendment";
  if (f.purchases && f.sales) return "Purchase and sale";
  if (f.purchases) return "Purchase";
  if (f.sales) return "Sale";
  if (f.other) return "Grant, exercise or other";
  return "No transaction lines";
}
export async function eventTape(userId, filters, { run = queryDb, limit = 40 } = {}) {
  const f = filters, before = f.before || new Date(Date.now() + 60_000).toISOString();
  const personCiks = f.person && /^\d{1,10}$/.test(f.person) ? cikForms([f.person]) : null;
  const personName = f.person && !personCiks ? f.person : null;
  const want = k => f.form === "all" || f.form === k;
  const [visit, f4, notices, holdings] = await Promise.all([
    run(TAPE_SQL.since, [userId]),
    want("4") ? run(TAPE_SQL.form4, [f.days, before, f.ticker, personCiks, personName, limit + 1]) : Promise.resolve({ rows: [] }),
    want("8-K") && !f.person ? run(TAPE_SQL.notices, [f.days, before, f.ticker, limit + 1]) : Promise.resolve({ rows: [] }),
    want("13F") && !f.person && !f.ticker ? run(TAPE_SQL.holdings, [f.days, before, limit + 1]).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] })
  ]);
  const v = visit.rows[0] || {};
  const last = v.last_visit_at ? Date.parse(v.last_visit_at) : null;
  const since = last && Date.now() - last > 30 * 60_000 ? iso(v.last_visit_at) : iso(v.previous_visit_at);
  const isNew = t => !!since && Date.parse(t || 0) > Date.parse(since);
  const events = [];
  for (const r of f4.rows) {
    const value = (r.buy_value || 0) + (r.sell_value || 0);
    events.push({ id: "f4:" + r.accession, kind: "form4", form: "Form " + r.form_type, company: companyName(r.issuer_name, r.ticker), ticker: r.ticker,
      person: r.owners ? r.owners.split("; ").map(displayName).join("; ") : null, personHref: href.person(r.first_cik),
      personCik: r.first_cik && /^\d{1,10}$/.test(bareCik(r.first_cik)) ? bareCik(r.first_cik) : null, issuerCik: r.issuer_cik ? bareCik(r.issuer_cik) : null,
      classification: classify(r), amount: value > 0 ? Math.round(value * 100) / 100 : null, amountNote: value > 0 ? "Reported value of purchase and sale lines" : null,
      eventDate: day(r.first_date), filedAt: iso(r.published_at), retrievedAt: iso(r.retrieved_at), source: secSource(r.source_url), new: isNew(r.retrieved_at) });
  }
  for (const n of notices.rows) {
    const m = n.metadata || {};
    events.push({ id: n.event_key, kind: "notice", form: m.form || "8-K", company: companyName(m.issuerName, n.subject), ticker: n.subject, person: null,
      classification: eightKLabel(m.items || []) || "Company current report", amount: null, eventDate: m.reportDate || null,
      filedAt: iso(n.published_at), retrievedAt: iso(n.observed_at), source: secSource(n.source_url), new: isNew(n.observed_at) });
  }
  for (const h of holdings.rows) {
    events.push({ id: "13f:" + h.accession, kind: "13f", form: h.form_type, company: companyName(h.name), ticker: null, person: null,
      classification: "Quarterly holdings report (quarter ended " + day(h.period_of_report) + ")", amount: Number(h.parsed_value_total), amountNote: "Total reported value of the holdings table",
      eventDate: day(h.period_of_report), filedAt: iso(h.filed_at), retrievedAt: iso(h.retrieved_at), source: secSource(h.source_url), new: isNew(h.retrieved_at) });
  }
  events.sort((a, b) => String(b.filedAt).localeCompare(String(a.filedAt)) || a.id.localeCompare(b.id));
  const page = events.slice(0, limit);
  return { filters: f, since, events: page, nextBefore: events.length > limit ? page.at(-1).filedAt : null,
    note: "Disclosures in the order they were filed with the SEC. “New” marks records Insidir retrieved since your last visit; everything else is historical. This is not a live feed.", advice: false };
}

/* ---------- Capital structure ---------- */
export const STRUCTURE_SQL = Object.freeze({
  company: `SELECT ticker,issuer_name,issuer_cik,max(published_at) OVER () AS last FROM sec_filings WHERE ticker=$1 AND ingest_status='parsed' ORDER BY published_at DESC LIMIT 1`,
  people: `SELECT o.owner_cik,max(o.owner_name) AS owner_name,count(DISTINCT f.accession)::integer AS filings,min(f.published_at) AS first,max(f.published_at) AS last,
      (array_agg(o.is_director ORDER BY f.published_at DESC))[1] AS is_director,(array_agg(o.is_officer ORDER BY f.published_at DESC))[1] AS is_officer,
      (array_agg(o.officer_title ORDER BY f.published_at DESC))[1] AS officer_title,(array_agg(o.is_ten_percent_owner ORDER BY f.published_at DESC))[1] AS is_ten_percent_owner,
      (array_agg(o.other_text ORDER BY f.published_at DESC))[1] AS other_text,
      (array_agg(f.accession ORDER BY f.published_at DESC))[1:3] AS accessions,(array_agg(f.source_url ORDER BY f.published_at DESC))[1:3] AS sources
    FROM sec_filing_owners o JOIN sec_filings f ON f.accession=o.accession
    WHERE f.ticker=$1 AND f.ingest_status='parsed' AND f.published_at>=now()-interval '365 days'
    GROUP BY o.owner_cik ORDER BY last DESC LIMIT 24`,
  edges: `SELECT COALESCE(t.owner_cik,o.owner_cik) AS owner_cik,COALESCE(t.security_title,'Security not named') AS security,bool_or(t.derivative) AS derivative,count(*)::integer AS lines,
      count(*) FILTER (WHERE t.category='reported_purchase')::integer AS purchases,count(*) FILTER (WHERE t.category='reported_sale')::integer AS sales,
      count(*) FILTER (WHERE t.category='other')::integer AS other,max(t.transaction_date) AS last,(array_agg(f.source_url ORDER BY f.published_at DESC))[1] AS source
    FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
    LEFT JOIN sec_filing_owners o ON t.owner_cik IS NULL AND o.accession=t.accession
    WHERE t.ticker=$1 AND f.ingest_status='parsed' AND f.published_at>=now()-interval '365 days'
    GROUP BY 1,2 ORDER BY lines DESC LIMIT 200`,
  periods: `SELECT to_char(date_trunc('month',f.published_at),'YYYY-MM') AS month,count(*)::integer AS filings FROM sec_filings f
    WHERE f.ticker=$1 AND f.ingest_status='parsed' AND f.published_at>=date_trunc('month',now())-interval '11 months' GROUP BY 1 ORDER BY 1`
});
export function roleEdges(o) {
  const out = [];
  if (o.is_director) out.push("Director");
  if (o.is_officer) out.push(o.officer_title ? "Officer: " + String(o.officer_title).replace(/\s+/g, " ").trim().slice(0, 60) : "Officer");
  if (o.is_ten_percent_owner) out.push("10% owner");
  if (o.other_text) out.push("Other: " + String(o.other_text).replace(/\s+/g, " ").trim().slice(0, 60));
  return out;
}
export async function capitalStructure(tickerRaw, { run = queryDb } = {}) {
  const ticker = String(tickerRaw || "").trim().toUpperCase().replace(/^\$/, "");
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker)) throw fail(400, "Invalid ticker");
  const company = (await run(STRUCTURE_SQL.company, [ticker])).rows[0];
  if (!company) throw fail(404, "No imported Form 4 filings for " + ticker);
  const [people, edges, periods] = await Promise.all([run(STRUCTURE_SQL.people, [ticker]), run(STRUCTURE_SQL.edges, [ticker]), run(STRUCTURE_SQL.periods, [ticker])]);
  const known = new Set(people.rows.map(p => bareCik(p.owner_cik)));
  const securities = new Map();
  for (const e of edges.rows) {
    const s = securities.get(e.security) || { name: e.security, derivative: false, lines: 0, people: new Set() };
    s.derivative = s.derivative || e.derivative; s.lines += e.lines; if (e.owner_cik) s.people.add(bareCik(e.owner_cik));
    securities.set(e.security, s);
  }
  // Fill the twelve months so the strip shows quiet months as quiet, not missing.
  const months = [], now = new Date();
  for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  const byMonth = new Map(periods.rows.map(r => [r.month, r.filings]));
  return {
    company: { ticker, name: companyName(company.issuer_name, ticker), cik: company.issuer_cik ? String(company.issuer_cik).padStart(10, "0") : null, lastFiling: iso(company.last), href: href.company(ticker) },
    people: people.rows.map(p => ({ cik: bareCik(p.owner_cik).padStart(10, "0"), name: displayName(p.owner_name), href: href.person(p.owner_cik), filings: p.filings, first: iso(p.first), last: iso(p.last),
      relationships: roleEdges(p), sources: (p.sources || []).map(secSource).filter(Boolean) })),
    securities: [...securities.values()].sort((a, b) => b.lines - a.lines).slice(0, 12).map(s => ({ name: s.name, derivative: s.derivative, lines: s.lines, people: s.people.size })),
    edges: edges.rows.filter(e => e.owner_cik && known.has(bareCik(e.owner_cik))).map(e => ({ person: bareCik(e.owner_cik).padStart(10, "0"), security: e.security, derivative: e.derivative,
      lines: e.lines, purchases: e.purchases, sales: e.sales, other: e.other, last: day(e.last), source: secSource(e.source) })),
    periods: months.map(mo => ({ month: mo, filings: byMonth.get(mo) || 0 })),
    labels: {
      personCompany: "Relationship box checked on the person's most recent Form 4 for this company (director, officer and title, 10% owner, other). As filed; Insidir does not infer it.",
      personSecurity: "The person reported transactions in this security on Form 4. It is not a statement of how much they hold or of control."
    },
    windowDays: 365, source: "SEC Form 4 (sec_filings, sec_filing_owners, sec_transactions)", advice: false
  };
}
