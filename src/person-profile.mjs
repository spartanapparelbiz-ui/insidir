/* GET /v1/people/<cik>?limit=N : one reporting person's profile (the "personnel file" behind
 * /person.html?cik=...). Everything in it is a public SEC record: the person's own Form 4 lines in
 * the engine's import, their role at each issuer as written in their latest Form 4 there, and the
 * issuers EDGAR lists for their owner CIK. Nothing is estimated, scored, hidden or predicted.
 *
 * Access: a signed-in, subscribed product endpoint like /v1/insiders. src/paywall.mjs classifyApi
 * already fails closed (every unlisted /v1 path is "product"); the handler also calls the
 * requireUser it is given, so it stays signed-in only while the paywall is switched off.
 *
 * Request
 *   cik    path segment, /^\d{1,12}$/; zero-padded and unpadded forms are the same person
 *          ("0001214156" == "1214156"). All zeros, or anything else: 400.
 *   limit  transactions to return: default 100, clamped to 1..500; empty or non-integer -> 100.
 *   404 when the CIK has no transactions in parsed filings. 429 past 60 profiles a minute per member.
 *
 * Response 200 (application/json)
 * { person: { cik,                  owner CIK exactly as stored by the import (newest line) - the value
 *                                   POST /v1/me/people and the followed feed match on
 *             name,                 the name as filed on the newest line
 *             filed_names: [..] },  every distinct name filed under this CIK, newest first (max 20)
 *   companies: [ {                  one per issuer, most recently published first (max 100)
 *       ticker,                     newest non-null ticker filed for that issuer (or null)
 *       issuer_cik,                 10-digit issuer CIK
 *       issuer_name,                newest non-null issuer name (or null)
 *       roles: ["Chief Executive Officer", "Director", "10% owner"],
 *                                   reportingOwnerRelationship from the person's latest Form 4 at that
 *                                   issuer: the officer title as filed (or "Officer"), "Director",
 *                                   "10% owner", else the "other" text. Same wording as
 *                                   insiders.mjs ownerRole(). Read from sec_filing_owners when that
 *                                   table exists, else from the filing's XML: the 8 most recent issuers
 *                                   only, one cached document each, within the SEC allowance below;
 *                                   [] beyond that, when no XML is on file, on any failure, or past
 *                                   the time budget.
 *       first_transaction_date, last_transaction_date, last_published_at,
 *       transactions,               lines counted (see "Amendments")
 *       purchases_value, sales_value } ],  sums of reported values (reported_purchase / reported_sale)
 *   totals: {
 *     all: { transactions,          lines counted (see "Amendments")
 *            superseded,            lines left out because a later Form 4/A repeats them
 *            filings,               every filing with a line of this person's, amendments included
 *            purchases: { count, shares, value }, sales: { count, shares, value }, other: { count },
 *            first_transaction_date, last_transaction_date, last_published_at },
 *     d30: the same shape for the last 30 days: transactions, purchases, sales, other and the trade
 *          dates count the lines first filed (sec_filings.published_at) in that window - a 4/A
 *          repeating an older line keeps the original's filing date - while filings, superseded
 *          and last_published_at count the filings published in it; dates are null when there are none },
 *   transactions: [ rows like GET /v1/transactions items (t.* plus issuer_name, published_at,
 *                   is_amendment; NUMERIC columns as pg strings) plus superseded (boolean), newest
 *                   trade date first, LIMIT limit. Superseded lines are listed, never hidden. A line
 *                   with owner_cik null comes from a joint filing (several reporting owners). ],
 *   filings: [ { accession, form_type, ticker, issuer_cik (10-digit), issuer_name, published_at, source_url,
 *                lines } ]          lines = this person's lines in that filing; newest first, max 100
 *   other_issuers: [ { cik, name, ticker, relation, last_transaction_date } ]
 *                   issuers EDGAR's owner page lists for this CIK that are not in the import (ticker from
 *                   the SEC ticker file, else null; relation and date as EDGAR shows them; max 40).
 *                   Best effort: [] on failure, past the SEC allowance, or after 2.5 s (a lookup that
 *                   was started keeps running and fills the cache for the next view).
 *   edgar_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<10-digit>&type=4&dateb=&owner=include&count=40",
 *   source: "SEC Form 4",
 *   disclaimer: "Public SEC records. Not a recommendation or a prediction." }
 * Counts and sums are JSON numbers (sums added exactly in decimal, then converted once); dates
 * are ISO strings as pg returns them (DATE and TIMESTAMPTZ -> JSON), like the other endpoints.
 *
 * Amendments: a line is "superseded" when a Form 4/A published later repeats it - same issuer
 * (padded or not), trade date, transaction code, acquired/disposed, derivative flag and shares, the
 * key the dashboard's derive() uses. Only the latest copy is counted, so a restated sale is one
 * sale. A 4/A that changes any of those fields is a different line, and both copies count.
 *
 * Joint filings: the importer stores a Form 4 with several reporting owners with owner_cik NULL.
 * When the sec_filing_owners table exists (one row per reporting owner per filing; checked once
 * and remembered), those lines are attributed to every owner listed and roles are read from it;
 * without it a person who only files jointly has no imported lines here and gets a 404 saying so.
 *
 * Cost: four parameterised SQL statements per request whatever the number of lines (plus a
 * catalogue check for sec_filing_owners every few minutes), each scoped by
 * owner_cik = ANY([unpadded, 10-digit]). Each statement reads the person's lines once off
 * sec_transactions_owner_idx into a materialised CTE and probes sec_filings once per distinct
 * accession (sec_filings_pkey), never once per line, so the work follows the person's own filings
 * and not the size of sec_filings; amendments are matched by hash join, so no statement sorts all
 * the lines. Never a statement per transaction or per issuer. Measured on PostgreSQL 16 with
 * default planner settings, 400,000 filings / 1.6M lines: a typical person (16 lines) under 1 ms per
 * statement; a 40,000-line, 4,000-filing person about 0.4 s for all four (about 0.46 s with joint
 * filings attributed), which is why the SQL part of a profile with HEAVY_LINES lines or more is kept
 * for HEAVY_TTL_MS (30 s).
 * SEC work runs while the SQL runs and is capped at ~3 s. New SEC requests (uncached ownership
 * documents and EDGAR owner pages) are bounded: at most SEC_PER_PROFILE per request,
 * SEC_ALLOWANCE per member (else address) per 10 minutes and SEC_ROUTE_PER_MINUTE for all members
 * together, reserved before the work and the unused part given back; reading or joining a cached
 * lookup is free. When sec.mjs reports its queue (secBacklogMs) and it is longer than
 * SEC_QUEUE_LIMIT_MS, no new SEC request is started. */
import * as secModule from "./sec.mjs";
import { secFetch, parseOwnership } from "./sec.mjs";
import { secReady } from "./config.mjs";
import { ownerIssuers as edgarOwnerIssuers } from "./insiders.mjs";
import { tickerIndex as secTickerIndex } from "./intelligence.mjs";

export const DEFAULT_LIMIT = 100, MAX_LIMIT = 500;
export const MAX_COMPANIES = 100, MAX_ROLE_ISSUERS = 8, MAX_FILINGS = 100, MAX_NAMES = 20, MAX_OTHER_ISSUERS = 40;
export const BUDGET_MS = Object.freeze({ roles: 3000, otherIssuers: 2500 });
export const SOURCE = "SEC Form 4";
export const DISCLAIMER = "Public SEC records. Not a recommendation or a prediction.";
export const NOT_FOUND = "Reporting person not found in imported SEC records";
export const NOT_FOUND_SINGLE = "No Form 4 lines filed by this CIK alone are imported. Joint filings (several reporting owners) are not yet attributed to each person.";
const DOC_TTL = 24 * 60 * 60 * 1000; // a filed ownership document never changes
const PAGE_TTL = 15 * 60 * 1000;     // EDGAR's owner page, as insiders.mjs ownerIssuers caches it

const failure = (status, message) => Object.assign(new Error(message), { status });
const PATH = /^\/v1\/people\/([^/]*)$/;
export const isPersonRoute = pathname => PATH.test(String(pathname || ""));

/* "0001214156" | "1214156" -> { bare: "1214156", ciks: ["1214156", "0001214156"] }. */
export function parsePersonCik(value) {
  const s = String(value ?? "").trim();
  if (!/^\d{1,12}$/.test(s)) throw failure(400, "Invalid SEC reporting-person CIK");
  const bare = s.replace(/^0+/, "");
  if (!bare) throw failure(400, "Invalid SEC reporting-person CIK");
  return { bare, ciks: [...new Set([bare, bare.padStart(10, "0")])] };
}
// Same convention as /v1/me/people/updates: blank or not an integer -> default, else clamped.
export function parseLimit(value) {
  const text = String(value ?? "").trim();
  const n = text ? Number(text) : NaN;
  return Number.isInteger(n) ? Math.max(1, Math.min(MAX_LIMIT, n)) : DEFAULT_LIMIT;
}

/* ownerRole() from insiders.mjs as a list: one entry per relationship the filer ticked. */
export function rolesOf(owner) {
  if (!owner) return [];
  const clean = v => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const roles = [];
  if (owner.isOfficer) roles.push(clean(owner.officerTitle) || "Officer");
  if (owner.isDirector) roles.push("Director");
  if (owner.isTenPercentOwner) roles.push("10% owner");
  if (!roles.length && clean(owner.otherText)) roles.push(clean(owner.otherText));
  return roles;
}

/* ---------- exact arithmetic: pg NUMERIC strings are added in fixed point, converted once ---------- */
const SCALE = 8, UNIT = 10n ** BigInt(SCALE);
const DECIMAL = /^(-)?(\d+)(?:\.(\d*))?$/;
function units(value) {
  if (value == null || value === "") return 0n;
  let text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(SCALE) : "0") : String(value).trim();
  if (!DECIMAL.test(text)) { const n = Number(text); text = Number.isFinite(n) ? n.toFixed(SCALE) : "0"; }
  const m = DECIMAL.exec(text);
  if (!m) return 0n; // |n| >= 1e21: not a figure Form 4 holds
  const v = BigInt(m[2]) * UNIT + BigInt(((m[3] || "") + "0".repeat(SCALE)).slice(0, SCALE));
  return m[1] ? -v : v;
}
function figure(total) {
  const abs = total < 0n ? -total : total;
  return Number((total < 0n ? "-" : "") + (abs / UNIT) + "." + (abs % UNIT).toString().padStart(SCALE, "0"));
}
export const exactSum = values => figure(values.reduce((sum, v) => sum + units(v), 0n));
const count = v => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; };
const time = v => { if (v == null) return NaN; const t = v instanceof Date ? v.getTime() : Date.parse(v); return Number.isFinite(t) ? t : NaN; };
// The earliest / latest of pg date values, returned as given (so JSON writes them like every endpoint).
function extreme(values, latest) {
  let best = null, bestTime = NaN;
  for (const v of values) {
    const t = time(v);
    if (Number.isNaN(t)) continue;
    if (Number.isNaN(bestTime) || (latest ? t > bestTime : t < bestTime)) { best = v; bestTime = t; }
  }
  return best;
}

/* ---------- SQL: every statement is bound to $1 = [unpadded, 10-digit] owner CIKs ----------
 * lines    the person's lines, read once off sec_transactions_owner_idx (only the columns used)
 * files    their parsed filings, one sec_filings_pkey probe per distinct accession. lines is a
 *          MATERIALIZED CTE, so the planner sizes that probe by filings, never by the whole table.
 * amended  the key of every line a Form 4/A carries, with the newest 4/A filing date. Lines are
 *          matched to it by hash join (the key as one text), so no statement sorts all the lines. */
const linesCte = (joint, columns) => {
  const pick = columns.map(c => "t." + c).join(",");
  return `lines AS MATERIALIZED (SELECT ${pick} FROM sec_transactions t WHERE t.owner_cik=ANY($1::text[])` + (joint
    ? `\n  UNION ALL SELECT ${pick} FROM sec_transactions t WHERE t.owner_cik IS NULL\n  AND t.accession IN (SELECT o.accession FROM sec_filing_owners o WHERE o.owner_cik=ANY($1::text[])))`
    : ")");
};
const FILES_CTE = `files AS MATERIALIZED (SELECT f.accession,f.form_type,f.ticker,f.issuer_cik,f.issuer_name,f.published_at,f.is_amendment,f.source_url,f.xml_url
  FROM sec_filings f WHERE f.accession IN (SELECT DISTINCT l.accession FROM lines l) AND f.ingest_status='parsed')`;
// The dashboard's derive() key: issuer (padded or not), trade date, code, acquired/disposed, derivative, shares.
export const SAME_LINE = "LTRIM(t.issuer_cik,'0')||'|'||COALESCE(t.transaction_date::text,'')||'|'||COALESCE(t.transaction_code,'')||'|'||COALESCE(t.acquired_disposed,'')||'|'||t.derivative::text||'|'||COALESCE(t.shares::text,'')";
const KEY_COLUMNS = ["issuer_cik", "transaction_date", "transaction_code", "acquired_disposed", "derivative", "shares"];
const AMENDED_CTE = `amended AS (SELECT ${SAME_LINE} AS same,MAX(f.published_at) AS amended_at
  FROM lines t JOIN files f ON f.accession=t.accession WHERE f.is_amendment GROUP BY 1)`;
// A line is superseded when a 4/A published after its own filing repeats it.
const SUPERSEDED = (amendedAt, publishedAt) => `(${amendedAt} IS NOT NULL AND (${publishedAt} IS NULL OR ${amendedAt}>${publishedAt}))`;
export const RECENT_FILED = "x.published_at>=now()-interval '30 days'";     // filings published in the window
export const RECENT_DISCLOSED = "c.disclosed_at>=now()-interval '30 days'"; // lines first filed in the window
const RECENT_SUPERSEDED = "c.published_at>=now()-interval '30 days'";       // superseded lines, by their own filing
const KEPT = "NOT c.superseded";
const PURCHASE = "c.category='reported_purchase'", SALE = "c.category='reported_sale'", OTHER = "c.category='other'";
const only = (...conditions) => { const c = conditions.filter(Boolean); return c.length ? " FILTER (WHERE " + c.join(" AND ") + ")" : ""; };
// Per issuer, over the lines (hash aggregate: no DISTINCT, no ordered aggregate).
const lineMeasures = (prefix, recent) => {
  const lines = recent ? RECENT_DISCLOSED : null;
  return [
    `(COUNT(*)${only(KEPT, lines)})::integer AS ${prefix}transactions`,
    `(COUNT(*)${only("c.superseded", recent ? RECENT_SUPERSEDED : null)})::integer AS ${prefix}superseded`,
    `(COUNT(*)${only(KEPT, PURCHASE, lines)})::integer AS ${prefix}purchases_count`,
    `COALESCE(SUM(c.shares)${only(KEPT, PURCHASE, lines)},0) AS ${prefix}purchases_shares`,
    `COALESCE(SUM(c.estimated_value)${only(KEPT, PURCHASE, lines)},0) AS ${prefix}purchases_value`,
    `(COUNT(*)${only(KEPT, SALE, lines)})::integer AS ${prefix}sales_count`,
    `COALESCE(SUM(c.shares)${only(KEPT, SALE, lines)},0) AS ${prefix}sales_shares`,
    `COALESCE(SUM(c.estimated_value)${only(KEPT, SALE, lines)},0) AS ${prefix}sales_value`,
    `(COUNT(*)${only(KEPT, OTHER, lines)})::integer AS ${prefix}other_count`,
    `MIN(c.transaction_date)${only(KEPT, lines)} AS ${prefix}first_transaction_date`,
    `MAX(c.transaction_date)${only(KEPT, lines)} AS ${prefix}last_transaction_date`
  ].join(",\n  ");
};
// Per issuer, over the filings: how many, the newest, and the newest ticker / name / XML filed.
const FILE_ORDER = "x.published_at DESC NULLS LAST,x.accession DESC";
const newest = (column, alias, when = `${column} IS NOT NULL`) => `(ARRAY_AGG(${column} ORDER BY ${FILE_ORDER}) FILTER (WHERE ${when}))[1] AS ${alias}`;
const FACTS_CTE = `facts AS (SELECT LTRIM(x.issuer_cik,'0') AS issuer_key,
  ${newest("x.ticker", "ticker")},${newest("x.issuer_name", "issuer_name")},
  ${newest("x.xml_url", "latest_xml_url")},${newest("x.accession", "latest_accession", "x.xml_url IS NOT NULL")},
  COUNT(*)::integer AS filings,MAX(x.published_at) AS last_published_at,
  (COUNT(*)${only(RECENT_FILED)})::integer AS d30_filings,MAX(x.published_at)${only(RECENT_FILED)} AS d30_last_published_at
  FROM files x GROUP BY 1)`;
// Roles stored per filing (sec_filing_owners): the person's newest filing at each issuer that has a row.
const ROLES_CTE = `roles AS (SELECT DISTINCT ON (LTRIM(f.issuer_cik,'0')) LTRIM(f.issuer_cik,'0') AS issuer_key,o.is_director,o.is_officer,o.officer_title,o.is_ten_percent_owner,o.other_text
  FROM files f JOIN sec_filing_owners o ON o.accession=f.accession AND o.owner_cik=ANY($1::text[])
  ORDER BY LTRIM(f.issuer_cik,'0'),f.published_at DESC NULLS LAST,f.accession DESC)`;
const LINE_FIELDS = ["transactions", "superseded", "purchases_count", "purchases_shares", "purchases_value", "sales_count", "sales_shares", "sales_value",
  "other_count", "first_transaction_date", "last_transaction_date"];

function statements(joint) {
  const base = columns => "WITH " + linesCte(joint, columns) + ",\n" + FILES_CTE;
  /* One row per issuer (padded and unpadded issuer CIKs merged) with all-time and 30-day measures.
   * Not limited: the person-level totals are added up from every issuer's row. disclosed_at is a
   * line's first filing date: a 4/A repeating an older line keeps the original's date. */
  const companies = `${base(["accession", ...KEY_COLUMNS, "category", "estimated_value"])},
${AMENDED_CTE},
copies AS (SELECT a.same,MAX(a.amended_at) AS amended_at,MIN(f.published_at) AS first_published_at
  FROM amended a JOIN lines t ON ${SAME_LINE}=a.same JOIN files f ON f.accession=t.accession GROUP BY a.same),
counted AS (SELECT LTRIM(t.issuer_cik,'0') AS issuer_key,t.transaction_date,t.category,t.shares,t.estimated_value,f.published_at,
  ${SUPERSEDED("k.amended_at", "f.published_at")} AS superseded,
  CASE WHEN f.is_amendment AND k.same IS NOT NULL THEN k.first_published_at ELSE f.published_at END AS disclosed_at
  FROM lines t JOIN files f ON f.accession=t.accession LEFT JOIN copies k ON k.same=${SAME_LINE}),
per AS (SELECT c.issuer_key,
  ${lineMeasures("", false)},
  ${lineMeasures("d30_", true)}
  FROM counted c GROUP BY 1),
${FACTS_CTE}${joint ? ",\n" + ROLES_CTE : ""}
SELECT LPAD(p.issuer_key,10,'0') AS issuer_cik,x.ticker,x.issuer_name,x.latest_xml_url,x.latest_accession,
  ${LINE_FIELDS.map(k => "p." + k).join(",")},x.filings,x.last_published_at,
  ${LINE_FIELDS.map(k => "p.d30_" + k).join(",")},x.d30_filings,x.d30_last_published_at${joint ? `,
  r.issuer_key IS NOT NULL AS role_on_file,r.is_director AS role_director,r.is_officer AS role_officer,r.officer_title AS role_officer_title,
  r.is_ten_percent_owner AS role_ten_percent_owner,r.other_text AS role_other_text` : ""}
  FROM per p LEFT JOIN facts x ON x.issuer_key=p.issuer_key${joint ? " LEFT JOIN roles r ON r.issuer_key=p.issuer_key" : ""}
  ORDER BY x.last_published_at DESC NULLS LAST,p.last_transaction_date DESC NULLS LAST,1`;
  // Joint lines carry every owner's name, so names come from the single-owner lines and sec_filing_owners.
  const names = joint
    ? `${base(["accession", "owner_cik", "owner_name", "transaction_date"])}
SELECT n.owner_cik,n.owner_name,MAX(n.published_at) AS last_published_at,MAX(n.transaction_date) AS last_transaction_date FROM (
  SELECT t.owner_cik,t.owner_name,f.published_at,t.transaction_date FROM lines t JOIN files f ON f.accession=t.accession WHERE t.owner_cik IS NOT NULL
  UNION ALL SELECT o.owner_cik,o.owner_name,f.published_at,NULL::date FROM files f JOIN sec_filing_owners o ON o.accession=f.accession AND o.owner_cik=ANY($1::text[])) n
  GROUP BY n.owner_cik,n.owner_name ORDER BY last_published_at DESC NULLS LAST,last_transaction_date DESC NULLS LAST,n.owner_name
  LIMIT ${MAX_NAMES}`
    : `${base(["accession", "owner_cik", "owner_name", "transaction_date"])}
SELECT t.owner_cik,t.owner_name,MAX(f.published_at) AS last_published_at,MAX(t.transaction_date) AS last_transaction_date
  FROM lines t JOIN files f ON f.accession=t.accession
  GROUP BY t.owner_cik,t.owner_name ORDER BY last_published_at DESC NULLS LAST,last_transaction_date DESC NULLS LAST,t.owner_name
  LIMIT ${MAX_NAMES}`;
  // Same row shape as GET /v1/transactions items, plus superseded. The newest `limit` lines are
  // chosen from the CTE (top-N), then read whole by primary key.
  const transactions = `${base(["id", "accession", ...KEY_COLUMNS])},
${AMENDED_CTE},
newest AS (SELECT t.id,${SAME_LINE} AS same,f.issuer_name,f.published_at,f.is_amendment,t.transaction_date FROM lines t JOIN files f ON f.accession=t.accession
  ORDER BY t.transaction_date DESC NULLS LAST,f.published_at DESC NULLS LAST,t.id DESC LIMIT $2)
SELECT t.*,n.issuer_name,n.published_at,n.is_amendment,${SUPERSEDED("a.amended_at", "n.published_at")} AS superseded
  FROM newest n JOIN sec_transactions t ON t.id=n.id LEFT JOIN amended a ON a.same=n.same
  ORDER BY n.transaction_date DESC NULLS LAST,n.published_at DESC NULLS LAST,n.id DESC`;
  const filings = `${base(["accession"])}
SELECT f.accession,f.form_type,f.ticker,LPAD(LTRIM(f.issuer_cik,'0'),10,'0') AS issuer_cik,f.issuer_name,f.published_at,f.source_url,n.lines
  FROM files f JOIN (SELECT l.accession,COUNT(*)::integer AS lines FROM lines l GROUP BY l.accession) n ON n.accession=f.accession
  ORDER BY f.published_at DESC NULLS LAST,f.accession DESC LIMIT ${MAX_FILINGS}`;
  return Object.freeze({ companies, names, transactions, filings });
}
export const SQL = Object.freeze({ single: statements(false), joint: statements(true) });
export const { companies: COMPANIES_SQL, names: NAMES_SQL, transactions: TRANSACTIONS_SQL, filings: FILINGS_SQL } = SQL.single;
export const OWNERS_TABLE_SQL = "SELECT to_regclass('sec_filing_owners') IS NOT NULL AS present";

/* Whether sec_filing_owners exists, asked once per query function and remembered (an hour when
 * present, five minutes when absent, so a migration is picked up without a restart). */
const ownerTables = new WeakMap();
async function jointOwners(query) {
  const known = ownerTables.get(query);
  if (known && known.until > Date.now()) return known.present;
  let present = false;
  try { present = (await query(OWNERS_TABLE_SQL, [])).rows?.[0]?.present === true; } catch { present = false; }
  ownerTables.set(query, { present, until: Date.now() + (present ? 60 : 5) * 60_000 });
  return present;
}

/* ---------- totals: added up from the per-issuer rows ---------- */
function totalsOf(rows, prefix) {
  const sum = key => exactSum(rows.map(r => r[prefix + key]));
  const tally = key => rows.reduce((n, r) => n + count(r[prefix + key]), 0);
  return {
    transactions: tally("transactions"), superseded: tally("superseded"), filings: tally("filings"),
    purchases: { count: tally("purchases_count"), shares: sum("purchases_shares"), value: sum("purchases_value") },
    sales: { count: tally("sales_count"), shares: sum("sales_shares"), value: sum("sales_value") },
    other: { count: tally("other_count") },
    first_transaction_date: extreme(rows.map(r => r[prefix + "first_transaction_date"]), false),
    last_transaction_date: extreme(rows.map(r => r[prefix + "last_transaction_date"]), true),
    last_published_at: extreme(rows.map(r => r[prefix + "last_published_at"]), true)
  };
}
export const buildTotals = rows => ({ all: totalsOf(rows, ""), d30: totalsOf(rows, "d30_") });

/* ---------- new SEC work: bounded per request, per member and for the whole route ---------- */
export const SEC_PER_PROFILE = Object.freeze({ documents: 4, ownerPages: 1 });
export const SEC_ALLOWANCE = Object.freeze({ documents: 40, ownerPages: 10 }); // per member (else address) per 10 minutes
export const SEC_ROUTE_PER_MINUTE = 60;                                        // all members together
export const SEC_QUEUE_LIMIT_MS = 2000;
const KINDS = ["documents", "ownerPages"];
/* Holds the allowances. One per process (the default below); tests make their own. reserve(who)
 * takes what one profile may start and returns release(usage), which gives back what was not used. */
export function createSecBudget({ perProfile = SEC_PER_PROFILE, perMember = SEC_ALLOWANCE, perMinute = SEC_ROUTE_PER_MINUTE, windowMs = 10 * 60_000 } = {}) {
  const members = new Map();
  let route = { starts: perMinute, until: 0 };
  return {
    reserve(who) {
      const now = Date.now();
      if (members.size > 10000) for (const [k, v] of members) if (v.until <= now) members.delete(k);
      let mine = members.get(who);
      if (!mine || mine.until <= now) members.set(who, mine = { ...perMember, until: now + windowMs });
      if (route.until <= now) route = { starts: perMinute, until: now + 60_000 };
      const shared = route, grant = {};
      for (const kind of KINDS) {
        const n = Math.max(0, Math.min(perProfile[kind] ?? 0, mine[kind] ?? 0, shared.starts));
        mine[kind] -= n; shared.starts -= n; grant[kind] = n;
      }
      let released = false;
      return {
        grant,
        release(usage = {}) {
          if (released) return;
          released = true;
          for (const kind of KINDS) {
            const back = Math.max(0, grant[kind] - Math.max(0, count(usage[kind])));
            mine[kind] += back; shared.starts += back;
          }
        }
      };
    }
  };
}
const secBudget = createSecBudget();

/* A bounded TTL cache that can say whether a key is already held (cached or running), so only new
 * SEC requests are charged to an allowance. A pending promise is shared; a failure is evicted. */
export function createSecCache(max = 1500) {
  const store = new Map();
  const live = key => { const e = store.get(key); if (!e) return null; if (Date.now() < e.expiresAt) return e; store.delete(key); return null; };
  return {
    has: key => live(key) !== null,
    get(key, lifetime, work) {
      const held = live(key);
      if (held) return held.value;
      const promise = Promise.resolve().then(work);
      store.set(key, { value: promise, expiresAt: Date.now() + lifetime });
      while (store.size > max) store.delete(store.keys().next().value);
      promise.catch(() => { if (store.get(key)?.value === promise) store.delete(key); });
      return promise;
    },
    size: () => store.size,
    clear: () => store.clear()
  };
}
const documents = createSecCache(1500), ownerPages = createSecCache(1000);
// An injected cache is used only when it is a createSecCache() (it must say what it holds).
const secCacheOr = (cache, fallback) => cache === undefined ? fallback : cache && typeof cache.has === "function" && typeof cache.get === "function" ? cache : null;

/* ---------- SEC lookups, each bounded by a time budget ---------- */
const XML_URL = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d{1,10}\/\d{18}\/[A-Za-z0-9][A-Za-z0-9._-]{0,149}\.xml$/;
const bareCik = v => { const s = String(v ?? "").trim(); return /^\d{1,10}$/.test(s) ? s.replace(/^0+/, "") : ""; };
function deadline(ms) {
  let timer;
  // Not unref'd: the budget must fire even when nothing else keeps the event loop alive. It is
  // always cleared once the lookups settle, so it never outlives the request.
  const promise = new Promise(resolve => { timer = setTimeout(resolve, ms); });
  return { promise, clear: () => clearTimeout(timer) };
}
// The value of `work`, or `fallback` when it fails or `until` settles first. A late result is dropped.
const settle = (work, until, fallback) => Promise.race([Promise.resolve(work).catch(() => fallback), until.then(() => fallback)]);
// May this lookup go ahead? Held (cached or already running) is free; a new request uses the grant.
function admit(cache, key, kind, { starts, usage }) {
  if (cache?.has(key)) return true;
  if (usage[kind] >= (starts[kind] ?? 0)) return false;
  usage[kind]++;
  return true;
}

/* Roles at each company: stored roles first; otherwise the person's latest ownership XML at the
 * first MAX_ROLE_ISSUERS companies, within the grant. */
async function rolesFor(companies, bare, { fetcher, documents: docs, budgetMs, starts, usage }) {
  const stop = deadline(budgetMs);
  try {
    return await Promise.all(companies.map((company, i) => {
      if (company.role_on_file === true) return rolesOf({ isDirector: company.role_director, isOfficer: company.role_officer,
        officerTitle: company.role_officer_title, isTenPercentOwner: company.role_ten_percent_owner, otherText: company.role_other_text });
      const url = company.latest_xml_url;
      if (i >= MAX_ROLE_ISSUERS || typeof url !== "string" || !XML_URL.test(url)) return [];
      const key = "owner-roles:" + url;
      if (!admit(docs, key, "documents", { starts, usage })) return [];
      const load = async () => parseOwnership(await fetcher(url), { accession: String(company.latest_accession || ""), sourceUrl: url, publishedAt: null })
        .owners.map(o => ({ cik: bareCik(o.cik), roles: rolesOf(o) }));
      const owners = docs ? docs.get(key, DOC_TTL, load) : Promise.resolve().then(load);
      return settle(owners.then(list => list.find(o => o.cik === bare)?.roles || []), stop.promise, []);
    }));
  } finally { stop.clear(); }
}

const tickerMaps = new WeakMap();
function tickerByCik(index) {
  if (!index || typeof index !== "object") return null;
  let map = tickerMaps.get(index);
  if (!map) {
    map = new Map();
    // company_tickers.json lists a company's primary listing first.
    for (const record of Object.values(index)) {
      const cik = bareCik(String(record?.cik_str ?? "")), ticker = String(record?.ticker || "").toUpperCase();
      if (cik && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker) && !map.has(cik)) map.set(cik, ticker);
    }
    tickerMaps.set(index, map);
  }
  return map;
}
async function otherIssuersFor(bare, imported, { fetcher, ownerIssuers, pages, tickerIndex, budgetMs, starts, usage }) {
  const key = "owner-issuers:" + bare;
  if (!admit(pages, key, "ownerPages", { starts, usage })) return [];
  const stop = deadline(budgetMs);
  try {
    const load = () => ownerIssuers(bare, { fetcher });
    const [issuers, index] = await Promise.all([
      settle(pages ? pages.get(key, PAGE_TTL, load) : Promise.resolve().then(load), stop.promise, []),
      // The SEC ticker file is one shared document cached for a day by intelligence.mjs.
      tickerIndex ? settle(Promise.resolve().then(tickerIndex), stop.promise, null) : null
    ]);
    const tickers = tickerByCik(index);
    const out = [];
    for (const issuer of Array.isArray(issuers) ? issuers : []) {
      const cik = bareCik(issuer?.cik);
      if (!cik || imported.has(cik)) continue;
      out.push({ cik: cik.padStart(10, "0"), name: String(issuer.name || "").slice(0, 120) || null, ticker: tickers?.get(cik) || null,
        relation: issuer.relation ? String(issuer.relation).slice(0, 80) : null, last_transaction_date: issuer.lastDate || null });
      if (out.length >= MAX_OTHER_ISSUERS) break;
    }
    return out;
  } finally { stop.clear(); }
}
// How long the shared SEC queue is, when sec.mjs reports it (0 = unknown or empty).
function secQueueMs(deps, usingSec) {
  const probe = typeof deps.secBacklogMs === "function" ? deps.secBacklogMs
    : usingSec && typeof secModule.secBacklogMs === "function" ? secModule.secBacklogMs : null;
  if (!probe) return 0;
  try { const ms = Number(probe()); return Number.isFinite(ms) ? ms : 0; } catch { return 0; }
}

/* The SQL part of a heavy filer's profile (HEAVY_LINES lines or more) is kept for HEAVY_TTL_MS, so
 * repeated views of a fund that files thousands of lines do not repeat the same four statements.
 * Kept per query function (one per API server), at most HEAVY_ENTRIES people; only the companies
 * shown, the totals and the issuer set are kept, never every issuer row. */
export const HEAVY_LINES = 2000, HEAVY_TTL_MS = 30_000, HEAVY_ENTRIES = 20;
const heavyRecords = new WeakMap();
function heavyStore(query) {
  let store = heavyRecords.get(query);
  if (!store) heavyRecords.set(query, store = new Map());
  return store;
}
async function loadRecords(query, sql, ciks, limit, onCompanies) {
  const companyRows = (await query(sql.companies, [ciks])).rows || [];
  if (!companyRows.length) return null;
  const shown = companyRows.slice(0, MAX_COMPANIES);
  const imported = new Set(companyRows.map(r => bareCik(r.issuer_cik)).filter(Boolean));
  onCompanies(shown, imported); // SEC work starts now and runs while the remaining SQL runs.
  const names = (await query(sql.names, [ciks])).rows || [];
  const transactions = (await query(sql.transactions, [ciks, limit])).rows || [];
  const filings = ((await query(sql.filings, [ciks])).rows || []).map(row => ({
    accession: row.accession, form_type: row.form_type ?? null, ticker: row.ticker ?? null, issuer_cik: row.issuer_cik ?? null, issuer_name: row.issuer_name ?? null,
    published_at: row.published_at ?? null, source_url: row.source_url ?? null, lines: count(row.lines)
  }));
  const lines = companyRows.reduce((n, r) => n + count(r.transactions) + count(r.superseded), 0);
  return { shown, imported, totals: buildTotals(companyRows), names, transactions, filings, lines };
}

/* The profile body, or null when the CIK has no imported transactions. deps:
 *   query(sql, params)           required (the API's ctx.query)
 *   limit                        transactions to return (already parsed)
 *   fetcher                      SEC fetch (default secFetch; with it, nothing is fetched until SEC_USER_AGENT is set)
 *   starts {documents, ownerPages}  new SEC requests this call may start (default SEC_PER_PROFILE)
 *   usage                        object that receives the new SEC requests started ({documents, ownerPages})
 *   documents, ownerPages        createSecCache() caches (default: module caches, only with secFetch)
 *   ownerIssuers(cik,{fetcher})  default insiders.mjs ownerIssuers
 *   tickerIndex()                default intelligence.mjs tickerIndex (cached 24 h), only with secFetch
 *   secBacklogMs()               the SEC queue length (default sec.mjs secBacklogMs when it exists)
 *   jointOwners                  true/false skips the sec_filing_owners check (tests)
 *   budgets {roles, otherIssuers} milliseconds (default BUDGET_MS) */
export async function personProfile(cikValue, deps = {}) {
  const { query, limit = DEFAULT_LIMIT, fetcher = secFetch } = deps;
  const { bare, ciks } = parsePersonCik(cikValue);
  const joint = typeof deps.jointOwners === "boolean" ? deps.jointOwners : await jointOwners(query);
  const sql = joint ? SQL.joint : SQL.single;

  const usingSec = fetcher === secFetch;
  const live = !usingSec || secReady();
  const budgets = { ...BUDGET_MS, ...(deps.budgets || {}) };
  const usage = deps.usage && typeof deps.usage === "object" ? deps.usage : {};
  for (const kind of KINDS) usage[kind] = count(usage[kind]);
  // A long shared SEC queue (ingest, other pages) means no new request is added to it.
  const starts = !live || secQueueMs(deps, usingSec) > SEC_QUEUE_LIMIT_MS ? { documents: 0, ownerPages: 0 } : { ...SEC_PER_PROFILE, ...(deps.starts || {}) };
  let roles = Promise.resolve([]), others = Promise.resolve([]);
  const startLookups = (shown, imported) => {
    const lookups = { fetcher, starts, usage };
    roles = rolesFor(shown, bare, { ...lookups, documents: live ? secCacheOr(deps.documents, usingSec ? documents : null) : null, budgetMs: budgets.roles });
    if (live) others = otherIssuersFor(bare, imported, { ...lookups, ownerIssuers: deps.ownerIssuers || edgarOwnerIssuers,
      pages: secCacheOr(deps.ownerPages, usingSec ? ownerPages : null),
      tickerIndex: deps.tickerIndex !== undefined ? deps.tickerIndex : usingSec ? () => secTickerIndex() : null, budgetMs: budgets.otherIssuers });
    // Keep a rejected lookup from becoming an unhandled rejection if the SQL that follows throws first.
    roles.catch(() => {}); others.catch(() => {});
  };

  const store = heavyStore(query), key = (joint ? "joint:" : "single:") + bare + ":" + limit, now = Date.now();
  for (const [k, v] of store) if (v.until <= now) store.delete(k);
  let records = store.get(key)?.records;
  if (records) startLookups(records.shown, records.imported);
  else {
    records = await loadRecords(query, sql, ciks, limit, startLookups);
    if (!records) return null;
    if (records.lines >= HEAVY_LINES) {
      store.set(key, { records, until: now + HEAVY_TTL_MS });
      while (store.size > HEAVY_ENTRIES) store.delete(store.keys().next().value);
    }
  }
  const { shown, totals, names, transactions, filings } = records;
  const [roleLists, otherIssuers] = await Promise.all([roles.catch(() => []), others.catch(() => [])]);

  const filedNames = [];
  for (const row of names) { const name = String(row.owner_name ?? "").trim(); if (name && !filedNames.includes(name)) filedNames.push(name); }
  const first = names.find(row => row.owner_cik != null) || transactions.find(row => row.owner_cik != null) || {};
  return {
    person: { cik: String(first.owner_cik ?? bare), name: filedNames[0] || null, filed_names: filedNames },
    companies: shown.map((row, i) => ({
      ticker: row.ticker ?? null, issuer_cik: row.issuer_cik, issuer_name: row.issuer_name ?? null, roles: roleLists[i] || [],
      first_transaction_date: row.first_transaction_date ?? null, last_transaction_date: row.last_transaction_date ?? null,
      last_published_at: row.last_published_at ?? null, transactions: count(row.transactions),
      purchases_value: exactSum([row.purchases_value]), sales_value: exactSum([row.sales_value])
    })),
    totals,
    transactions,
    filings,
    other_issuers: otherIssuers,
    edgar_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + bare.padStart(10, "0") + "&type=4&dateb=&owner=include&count=40",
    source: SOURCE,
    disclaimer: DISCLAIMER
  };
}

const hits = new Map();
function limited(key, limit, windowMs = 60_000) {
  const now = Date.now();
  if (hits.size > 10000) for (const [k, v] of hits) if (v.until <= now) hits.delete(k);
  const entry = hits.get(key);
  if (!entry || entry.until <= now) { hits.set(key, { count: 1, until: now + windowMs }); return false; }
  return ++entry.count > limit;
}
export const PROFILES_PER_MINUTE = 60;

/* Returns false when the path is not /v1/people/<segment>; otherwise responds (true) or throws
 * {status}, which src/api.mjs turns into a JSON error. deps:
 *   query(sql, params)   required (ctx.query)
 *   requireUser(req)     optional; resolves the member or throws 401 (api.mjs requireUser)
 *   requester            optional rate-limit key when requireUser is not given
 *   secBudget            createSecBudget() (default: the process-wide one)
 *   ...                  the personProfile deps (fetcher, documents, ownerPages, ownerIssuers, tickerIndex,
 *                        secBacklogMs, jointOwners, budgets) for tests */
export async function handlePersonRoute(req, res, url, deps = {}) {
  const match = PATH.exec(url.pathname);
  if (!match) return false;
  if (req.method !== "GET" && req.method !== "HEAD") throw failure(405, "Method not allowed");
  if (typeof deps.query !== "function") throw failure(503, "Insider records are not available");
  const user = deps.requireUser ? await deps.requireUser(req) : null;
  let segment;
  try { segment = decodeURIComponent(match[1]); } catch { throw failure(400, "Invalid SEC reporting-person CIK"); }
  parsePersonCik(segment);
  const who = user?.id != null ? "user:" + user.id : deps.requester || "ip:" + (req.socket?.remoteAddress || "unknown");
  if (limited("person:" + who, PROFILES_PER_MINUTE)) throw failure(429, "Too many profile requests. Try again shortly.");
  const joint = typeof deps.jointOwners === "boolean" ? deps.jointOwners : await jointOwners(deps.query);
  const reservation = (deps.secBudget || secBudget).reserve(who), usage = { documents: 0, ownerPages: 0 };
  let body;
  try {
    body = await personProfile(segment, { ...deps, jointOwners: joint, limit: parseLimit(url.searchParams.get("limit")), starts: reservation.grant, usage });
  } finally { reservation.release(usage); }
  if (!body) throw failure(404, joint ? NOT_FOUND : NOT_FOUND_SINGLE);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });
  res.end(JSON.stringify(body));
  return true;
}
