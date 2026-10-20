#!/usr/bin/env node
/* Do the stored SEC records match the original documents?
 *
 *   DATABASE_URL=... SEC_USER_AGENT="Org contact@example.com" node scripts/verify-sec-records.mjs [--limit=25] [--build-events]
 *
 * For the newest parsed Form 4 filings (--limit, 1-200) it fetches each filing's original ownership XML from the SEC
 * again (through the engine's SEC client: declared User-Agent, shared throttle, SEC addresses only), parses it with
 * the importer's own parser and compares, line by line, everything stored: issuer, ticker, period, amendment flag,
 * reporting owners and their boxes (sec_filing_owners), and for every transaction line its date, code,
 * acquired/disposed, category, derivative flag, shares, price, reported value, owner and source address. When the
 * filing has research events, their totals and line counts are recomputed exactly from the fresh document.
 * --build-events runs the research-event builder first. Read-only otherwise. Prints one JSON line per filing and a
 * summary; exits 1 on any mismatch or fetch failure. */
import { secFetch, parseOwnership } from "../src/sec.mjs";
import { secReady } from "../src/config.mjs";
import { pool, query } from "../src/db.mjs";
import { decimalSum } from "../src/research-events.mjs";

const arg = (name, d) => { const a = process.argv.find(x => x.startsWith(`--${name}=`)); return a ? a.split("=")[1] : d; };
const limit = Math.min(200, Math.max(1, Number(arg("limit", 25)) || 25));
if (!secReady()) { console.error("SEC_USER_AGENT must name the operator and a monitored email."); process.exit(2); }
if (process.argv.includes("--build-events")) { const { buildResearchEvents } = await import("../src/research-events.mjs"); console.log(JSON.stringify({ built: await buildResearchEvents({ query }) })); }

const num = v => v == null || v === "" ? null : Number(v);
const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-6);
const day = v => v == null ? null : v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : String(v).slice(0, 10);

const filings = (await query(`SELECT accession,filer_cik,issuer_cik,ticker,title,form_type,published_at,period_of_report,is_amendment,source_url,xml_url
  FROM sec_filings WHERE ingest_status='parsed' AND xml_url IS NOT NULL ORDER BY published_at DESC NULLS LAST LIMIT $1`, [limit])).rows;
let checked = 0, lines = 0, mismatched = 0, failed = 0, events = 0;
for (const f of filings) {
  const problems = [];
  let doc;
  try { doc = parseOwnership(await secFetch(f.xml_url), { accession: f.accession, filerCik: f.filer_cik, title: f.title, formType: f.form_type, sourceUrl: f.source_url, publishedAt: f.published_at }); }
  catch (e) { failed++; console.log(JSON.stringify({ accession: f.accession, ok: false, fetch: String(e?.message || e) })); if (/SEC responded 403/.test(String(e?.message))) break; continue; }
  checked++;
  if (doc.issuerCik !== f.issuer_cik) problems.push(["issuer_cik", f.issuer_cik, doc.issuerCik]);
  if ((doc.ticker || null) !== (f.ticker || null)) problems.push(["ticker", f.ticker, doc.ticker]);
  if ((doc.periodOfReport || null) !== day(f.period_of_report)) problems.push(["period_of_report", day(f.period_of_report), doc.periodOfReport]);
  if (doc.isAmendment !== f.is_amendment) problems.push(["is_amendment", f.is_amendment, doc.isAmendment]);
  if (!String(f.source_url).includes(f.accession)) problems.push(["source_url", f.source_url, "does not name the accession"]);
  const owners = (await query("SELECT owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner FROM sec_filing_owners WHERE accession=$1 ORDER BY owner_cik", [f.accession])).rows;
  const fresh = doc.owners.filter(o => /^\d{1,10}$/.test(o.cik || "") && /[1-9]/.test(o.cik)).sort((a, b) => a.cik.localeCompare(b.cik));
  if (owners.length !== fresh.length) problems.push(["owners", owners.length, fresh.length]);
  else owners.forEach((o, i) => { const n = fresh[i]; if (o.owner_cik !== n.cik || o.owner_name !== n.name || o.is_director !== n.isDirector || o.is_officer !== n.isOfficer || (o.officer_title || null) !== (n.officerTitle || null) || o.is_ten_percent_owner !== n.isTenPercentOwner) problems.push(["owner", o.owner_cik, n.cik]); });
  const stored = new Map((await query("SELECT * FROM sec_transactions WHERE accession=$1", [f.accession])).rows.map(r => [r.id, r]));
  if (stored.size !== doc.transactions.length) problems.push(["line_count", stored.size, doc.transactions.length]);
  for (const t of doc.transactions) {
    lines++;
    const r = stored.get(t.id);
    if (!r) { problems.push(["missing_line", t.id]); continue; }
    const cmp = [["transaction_date", day(r.transaction_date), t.transactionDate], ["code", r.transaction_code, t.code], ["acquired_disposed", r.acquired_disposed, t.acquiredDisposed],
      ["category", r.category, t.category], ["derivative", r.derivative, t.derivative], ["owner_cik", r.owner_cik, t.ownerCik], ["security_title", r.security_title, t.securityTitle], ["source_url", r.source_url, t.sourceUrl]];
    for (const [k, a, b] of cmp) if ((a ?? null) !== (b ?? null)) problems.push([k, t.id, a, b]);
    for (const [k, a, b] of [["shares", r.shares, t.shares], ["price_per_share", r.price_per_share, t.pricePerShare], ["estimated_value", r.estimated_value, t.estimatedValue]])
      if (!same(num(a), b)) problems.push([k, t.id, a, b]);
  }
  for (const ev of (await query("SELECT event_key,status,facts FROM sec_events WHERE event_key=ANY($1::text[])", [[`form4:${f.accession}:P`, `form4:${f.accession}:S`]])).rows) {
    events++;
    if (ev.status !== "active" || ev.facts?.amended) continue; // superseded or amended events are checked against their own filing
    const cat = ev.event_key.endsWith(":P") ? "reported_purchase" : "reported_sale";
    const own = doc.transactions.filter(t => !t.derivative && t.category === cat);
    const totalShares = decimalSum(own.map(t => t.shares == null ? null : String(t.shares)));
    if (ev.facts.lineCount !== own.length) problems.push(["event_line_count", ev.event_key, ev.facts.lineCount, own.length]);
    if (!same(num(ev.facts.totalShares), num(totalShares))) problems.push(["event_total_shares", ev.event_key, ev.facts.totalShares, totalShares]);
  }
  if (problems.length) mismatched++;
  console.log(JSON.stringify({ accession: f.accession, form: f.form_type, ticker: f.ticker, lines: doc.transactions.length, ok: !problems.length, ...(problems.length ? { problems } : {}) }));
}
console.log(JSON.stringify({ summary: mismatched || failed ? "MISMATCH" : "MATCH", filings: filings.length, checked, lines, events, mismatched, failed, source: "SEC EDGAR, fetched again " + new Date().toISOString() }));
await pool.end();
process.exit(mismatched || failed ? 1 : 0);
