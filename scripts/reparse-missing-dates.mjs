#!/usr/bin/env node
/* Repair: parsed Form 4 filings with a transaction line or period whose date is missing are read again from the SEC
 * and stored again. Before src/sec.mjs accepted XML Schema dates with a time zone ("2026-10-14-05:00"), such dates
 * were stored as unknown. Holds the ingest lock (like scripts/backfill-filing-owners.mjs), paces itself through the
 * engine's SEC client and stops at a 403. Re-stored filings get a new retrieval time, so the research-event builder
 * rebuilds their events on its next run.
 *   DATABASE_URL=... SEC_USER_AGENT="Org contact@example.com" node scripts/reparse-missing-dates.mjs [--limit=200] [--dry-run] */
import { secFetch, parseOwnership } from "../src/sec.mjs";
import { secReady } from "../src/config.mjs";
import { pool, persistFiling } from "../src/db.mjs";

const limit = Math.min(5000, Math.max(1, Number((process.argv.find(a => a.startsWith("--limit=")) || "=200").split("=")[1]) || 200));
const dry = process.argv.includes("--dry-run");
if (!secReady()) { console.error("SEC_USER_AGENT must name the operator and a monitored email."); process.exit(2); }
const client = await pool.connect();
const lock = await client.query("SELECT pg_try_advisory_lock(813076522) AS locked");
if (!lock.rows[0].locked) { console.error("An ingest is running; try again later."); client.release(); await pool.end(); process.exit(75); }
const out = { candidates: 0, repaired: 0, unchanged: 0, failed: 0, dryRun: dry };
try {
  const rows = (await client.query(`SELECT f.accession,f.filer_cik,f.title,f.form_type,f.source_url,f.published_at,f.xml_url FROM sec_filings f
    WHERE f.ingest_status='parsed' AND f.xml_url IS NOT NULL AND (f.period_of_report IS NULL OR EXISTS (SELECT 1 FROM sec_transactions t WHERE t.accession=f.accession AND t.transaction_date IS NULL))
    ORDER BY f.published_at DESC NULLS LAST LIMIT $1`, [limit])).rows;
  out.candidates = rows.length;
  for (const r of rows) {
    try {
      const doc = parseOwnership(await secFetch(r.xml_url), { accession: r.accession, filerCik: r.filer_cik, title: r.title, formType: r.form_type, sourceUrl: r.source_url, publishedAt: r.published_at });
      const gained = doc.transactions.some(t => t.transactionDate) || doc.periodOfReport;
      if (!gained) { out.unchanged++; continue; }
      if (!dry) await persistFiling({ ...doc, xmlUrl: r.xml_url });
      out.repaired++;
    } catch (e) { out.failed++; console.error(r.accession, String(e?.message || e)); if (/SEC responded 403/.test(String(e?.message))) break; }
  }
} finally { await client.query("SELECT pg_advisory_unlock(813076522)").catch(() => {}); client.release(); }
console.log(JSON.stringify(out));
await pool.end();
process.exit(out.failed ? 1 : 0);
