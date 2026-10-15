/* One-off backfill for sql/008_filing_owners.sql: every reporting owner of the Form 4s imported before
 * sec_filing_owners existed (new imports write their owners in persistFiling, src/db.mjs).
 *
 *   DATABASE_URL=... SEC_USER_AGENT="Insidir Research hello@aethric.llc" node scripts/backfill-filing-owners.mjs
 *       [--limit=500] [--rate=4] [--retry-failed] [--dry-run]
 *
 * For each parsed filing with an XML address, no owner rows and not looked at yet (joint filings
 * first, the only ones that need the table to be attributed; then newest first), it reads the filed
 * ownership XML once through the engine's SEC client (declared User-Agent, SEC addresses only),
 * parses it with the importer's own parseOwnership and, in one transaction per filing, writes one
 * row per reporting owner plus a sec_filing_owners_checked row saying it was looked at.
 *
 * SEC fair access. This is a separate process, so the engine's in-process SEC throttle (sec.mjs, a
 * module variable) does not see it. The run therefore:
 *   - holds the ingest lock (pg_try_advisory_lock(INGEST_LOCK), the one src/ingest.mjs takes), so the
 *     engine's scheduled ingest skips while it runs; if an ingest holds it, the script exits (75) and
 *     changes nothing;
 *   - paces its own requests to --rate per second (default 4, at most 8), leaving the rest of the
 *     SEC's 10 a second to the engine's page lookups (profiles, photos), which keep running;
 *   - stops at the first sign of a block (SEC responded 403, or 429 after secFetch's retries):
 *     stopped: "sec_blocked", that filing is left as it was, and nothing more is sent. Wait at least
 *     ten minutes before the next run. Ten failures in a row also stop it (stopped: "repeated_failures").
 *
 * Progress never depends on failures: a filing that fails (an XML that is gone, a parse error, a
 * timeout) is recorded as looked at with its reason and skipped by later runs; --retry-failed asks
 * for those again. A filing whose owners have no usable CIK is recorded with 0 owners. Repeat the run
 * until "remaining" is 0 (a run that does not lower it made no progress: read its errors), then once
 * with --retry-failed if "failedOnRecord" is above 0. Nothing else is changed: transaction lines keep
 * owner_cik NULL on joint filings. --dry-run reads and parses but writes nothing. Runs migrate()
 * first, so the tables exist. Prints one JSON summary line; exits 1 when a filing failed or the run
 * stopped early, 2 on bad arguments. */
import { pathToFileURL } from "node:url";

export const INGEST_LOCK = 813076522; // src/ingest.mjs
export const DEFAULT_LIMIT = 500, MAX_LIMIT = 100000, DEFAULT_RATE = 4, MAX_RATE = 8, MAX_FAILURES_IN_A_ROW = 10;
const PENDING = `FROM sec_filings f
  WHERE f.ingest_status='parsed' AND f.xml_url IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM sec_filing_owners o WHERE o.accession=f.accession)`;
// $2 retryFailed: also the filings a run recorded as failed (never those already looked at cleanly).
export const PENDING_SQL = `SELECT f.accession,f.xml_url,f.source_url ${PENDING}
    AND NOT EXISTS (SELECT 1 FROM sec_filing_owners_checked c WHERE c.accession=f.accession AND (NOT $2::boolean OR c.error IS NULL))
  ORDER BY (cardinality(f.owner_names)>1) DESC,f.published_at DESC NULLS LAST,f.accession DESC LIMIT $1`;
export const REMAINING_SQL = `SELECT (count(*) FILTER (WHERE c.accession IS NULL))::integer AS remaining,
  (count(*) FILTER (WHERE c.error IS NOT NULL))::integer AS failed_on_record
  ${PENDING.replace("FROM sec_filings f", "FROM sec_filings f LEFT JOIN sec_filing_owners_checked c ON c.accession=f.accession")}`;
export const CHECKED_SQL = `INSERT INTO sec_filing_owners_checked(accession,owners,error) VALUES($1,$2,$3)
  ON CONFLICT (accession) DO UPDATE SET checked_at=now(),owners=EXCLUDED.owners,error=EXCLUDED.error`;
// What the SEC answers when it is rate-limiting this address (secFetch has already retried a 429).
export const isSecBlock = error => /^SEC responded (403|429)\b/.test(String(error?.message || error));

const USAGE = "usage: node scripts/backfill-filing-owners.mjs [--limit=N (1-100000, default 500)] [--rate=R (requests a second, 0.1-8, default 4)] [--retry-failed] [--dry-run]";
/* argv -> {limit, rate, retryFailed, dryRun}; throws {usage} on anything else (a value must be given
 * as --limit=N: "--limit 1000" is refused, never read as 1). */
export function parseArgs(argv) {
  const out = { limit: DEFAULT_LIMIT, rate: DEFAULT_RATE, retryFailed: false, dryRun: false };
  const bad = why => Object.assign(new Error(why + "\n" + USAGE), { usage: true });
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!m) throw bad("Unexpected argument: " + arg);
    const [, key, value] = m;
    if (key === "dry-run" || key === "retry-failed") {
      if (value !== undefined) throw bad(`--${key} takes no value`);
      out[key === "dry-run" ? "dryRun" : "retryFailed"] = true;
    } else if (key === "limit") {
      if (!/^\d+$/.test(value ?? "") || Number(value) < 1 || Number(value) > MAX_LIMIT) throw bad("--limit needs a whole number from 1 to " + MAX_LIMIT + ", as --limit=N");
      out.limit = Number(value);
    } else if (key === "rate") {
      const n = Number(value);
      if (!/^\d+(\.\d+)?$/.test(value ?? "") || !(n >= 0.1 && n <= MAX_RATE)) throw bad("--rate needs requests a second from 0.1 to " + MAX_RATE + ", as --rate=R");
      out.rate = n;
    } else throw bad("Unknown option --" + key);
  }
  return out;
}

/* deps: query(sql, params) for reads and failure records; transaction(work) runs work(run) inside
 * BEGIN/COMMIT (run is that client's query); fetcher(url) -> XML text; parseOwnership;
 * writeFilingOwners(run, accession, owners); log(line); rate (requests a second, default 4);
 * wait(ms) and now() (tests). Returns {filings, owners, joint, failed, errors, stopped, requests,
 * remaining, failedOnRecord}. */
export async function backfillFilingOwners({ query, transaction, fetcher, parseOwnership, writeFilingOwners, limit = DEFAULT_LIMIT, rate = DEFAULT_RATE,
  retryFailed = false, dryRun = false, log = () => {}, wait = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  const size = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(Number(limit)) || DEFAULT_LIMIT));
  const gap = 1000 / Math.max(0.1, Math.min(MAX_RATE, Number(rate) || DEFAULT_RATE));
  const rows = (await query(PENDING_SQL, [size, Boolean(retryFailed)])).rows || [];
  const summary = { filings: 0, owners: 0, joint: 0, failed: 0, errors: [], stopped: null, requests: 0 };
  let nextAt = 0, inARow = 0;
  for (const row of rows) {
    const ahead = nextAt - now();
    if (ahead > 0) await wait(ahead);
    nextAt = Math.max(nextAt, now()) + gap;
    let xml;
    try {
      summary.requests++;
      xml = await fetcher(row.xml_url);
    } catch (e) {
      if (isSecBlock(e)) {
        // Every further request would extend the block: stop, and leave this filing as it was.
        summary.stopped = "sec_blocked";
        log(`${row.accession} ${String(e?.message || e)}: the SEC is refusing requests; stopped. Wait at least ten minutes before the next run.`);
        break;
      }
      if (await failed(row, e)) break;
      continue;
    }
    try {
      const parsed = parseOwnership(xml, { accession: row.accession, sourceUrl: row.source_url, publishedAt: null });
      if (parsed.accession !== row.accession) throw new Error("Parsed a different accession");
      const usable = parsed.owners.filter(o => /^\d{1,10}$/.test(String(o?.cik ?? "").trim()) && /[1-9]/.test(String(o.cik)));
      const written = dryRun ? usable.length : await transaction(async run => {
        const n = await writeFilingOwners(run, row.accession, parsed.owners);
        await run(CHECKED_SQL, [row.accession, n, null]);
        return n;
      });
      inARow = 0;
      summary.filings++;
      summary.owners += written;
      if (parsed.owners.length > 1) summary.joint++;
      log(`${row.accession} ${written} owner${written === 1 ? "" : "s"}${parsed.owners.length > 1 ? " (joint)" : ""}`);
    } catch (e) {
      if (await failed(row, e)) break;
    }
  }
  // What is left after this run: filings not looked at yet, and failures on record (--retry-failed).
  const left = (await query(REMAINING_SQL, [])).rows?.[0] || {};
  summary.remaining = Number(left.remaining) || 0;
  summary.failedOnRecord = Number(left.failed_on_record) || 0;
  return summary;

  // Records a failed filing as looked at (so later runs move on); true when the run should stop.
  async function failed(row, e) {
    const reason = String(e?.message || e).slice(0, 180);
    summary.failed++;
    if (summary.errors.length < 20) summary.errors.push({ accession: row.accession, reason });
    log(`${row.accession} failed: ${reason}`);
    if (!dryRun) await query(CHECKED_SQL, [row.accession, 0, reason]);
    if (++inARow >= MAX_FAILURES_IN_A_ROW) {
      summary.stopped = "repeated_failures";
      log(`${MAX_FAILURES_IN_A_ROW} filings failed in a row; stopped. They are recorded: fix the cause, then run with --retry-failed.`);
      return true;
    }
    return false;
  }
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 2; return; }
  const { migrate, pool, query, writeFilingOwners } = await import("../src/db.mjs");
  const { secFetch, parseOwnership } = await import("../src/sec.mjs");
  const { secReady } = await import("../src/config.mjs");
  if (!pool) throw new Error("DATABASE_URL is required");
  if (!secReady()) throw new Error("SEC_USER_AGENT must identify the operator and a monitored email");
  try {
    await migrate();
    // The ingest lock, on a session of its own for the whole run: the engine's scheduled ingest skips
    // while it is held, so the two never send SEC requests at the same time.
    const lock = await pool.connect();
    try {
      if (!(await lock.query("SELECT pg_try_advisory_lock($1) AS locked", [INGEST_LOCK])).rows[0]?.locked) {
        console.error("An ingest is running (advisory lock " + INGEST_LOCK + " is held). Nothing was changed; run the backfill again when it has finished.");
        process.exitCode = 75;
        return;
      }
      const transaction = async work => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work((sql, params) => client.query(sql, params));
          await client.query("COMMIT");
          return result;
        } catch (e) { await client.query("ROLLBACK").catch(() => {}); throw e; }
        finally { client.release(); }
      };
      const summary = await backfillFilingOwners({ query, transaction, fetcher: url => secFetch(url), parseOwnership, writeFilingOwners,
        limit: args.limit, rate: args.rate, retryFailed: args.retryFailed, dryRun: args.dryRun, log: line => console.log(line) });
      console.log(JSON.stringify({ backfill: "sec_filing_owners", dryRun: args.dryRun, retryFailed: args.retryFailed, rate: args.rate, ...summary }));
      if (summary.failed || summary.stopped) process.exitCode = 1;
    } finally {
      await lock.query("SELECT pg_advisory_unlock($1)", [INGEST_LOCK]).catch(() => {});
      lock.release();
    }
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error("Backfill failed:", e?.message || e); process.exitCode = 1; });
