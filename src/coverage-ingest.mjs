/* Form 4 coverage against EDGAR's own daily form indexes (sql/018_coverage.sql).
 *
 *   syncDailyIndexes  reads https://www.sec.gov/Archives/edgar/daily-index/YYYY/QTRn/form.YYYYMMDD.idx for each
 *                     business day in the coverage window (newest first, a few days per run), records how many
 *                     Form 4 and 4/A accessions the SEC listed, and queues every one not already imported.
 *   drainIngestQueue  imports queued accessions through the same SEC client and parser as the live feed. Claims
 *                     rows with FOR UPDATE SKIP LOCKED (several workers never take the same row), retries with
 *                     exponential backoff, keeps a row as failed with its error after the last attempt, recovers
 *                     rows a crashed worker left running, and yields to people waiting on the SEC throttle.
 *   coverageReport    real counts from the database: entities, filings, queue states, reconciliation per day.
 *   qualityChecks     data-quality measurements (dates, links, classifications, duplicates, staleness).
 *
 * Coverage universe: SEC Form 4 and 4/A statements of changes in beneficial ownership filed on EDGAR within the
 * window (INSIDIR_COVERAGE_DAYS calendar days, default 90). Forms 3 and 5, older filings and paper filings are
 * outside it, and every report says so. */
import { secFetch, loadOwnership, secBacklogMs, PARSER_VERSION } from "./sec.mjs";
import { query as queryDb, persistFiling } from "./db.mjs";

export const COVERED_FORMS = ["4", "4/A"];
export const coverageDays = (env = process.env) => Math.max(7, Math.min(3650, Math.trunc(Number(env.INSIDIR_COVERAGE_DAYS)) || 90));
const MAX_ATTEMPTS = 6;
// Errors that will not change on retry: the accession holds no ownership XML (paper or non-XML filing).
const PERMANENT = /No parsable ownership XML|Not a valid ownershipDocument|Missing issuer CIK/;

export const dayKey = d => d.toISOString().slice(0, 10);
export function dailyIndexUrl(day) {
  const [y, m, d] = day.split("-");
  return `https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${Math.floor((Number(m) - 1) / 3) + 1}/form.${y}${m}${d}.idx`;
}
/* Business days (Mon-Fri) from `from` back `days` calendar days, newest first, as YYYY-MM-DD. */
export function windowDays(days, now = new Date()) {
  const out = [];
  for (let i = 0; i <= days; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(dayKey(d));
  }
  return out;
}

/* Fixed-width rows: "4    COMPANY NAME    CIK    YYYYMMDD    edgar/data/CIK/0000000000-00-000000.txt". */
const ROW = /^(4|4\/A)\s+(.+?)\s+(\d{1,10})\s+(\d{8})\s+(edgar\/data\/(\d{1,10})\/(\d{10}-\d{2}-\d{6})\.txt)\s*$/;
export function parseFormIndex(text) {
  const rows = [], seen = new Set();
  let header = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (!header) { if (/^-{20,}/.test(line)) header = true; continue; }
    const m = ROW.exec(line);
    if (!m) continue;
    const accession = m[7].replace(/-/g, "");
    if (seen.has(accession)) continue;
    seen.add(accession);
    rows.push({ formType: m[1], filerName: m[2].trim().slice(0, 200), filerCik: String(Number(m[3])), filedDate: `${m[4].slice(0, 4)}-${m[4].slice(4, 6)}-${m[4].slice(6)}`,
      accession, dashed: m[7], path: m[5] });
  }
  if (!header) throw new Error("Daily form index: header not found");
  return rows;
}

async function startRun(run, job) { return (await run("INSERT INTO sec_sync_runs(job) VALUES($1) RETURNING id", [job])).rows[0].id; }
async function finishRun(run, id, status, stats, error) {
  await run("UPDATE sec_sync_runs SET finished_at=now(),status=$2,stats=$3,error_message=$4 WHERE id=$1", [id, status, JSON.stringify(stats || {}), error ? String(error).slice(0, 500) : null]);
}

export async function syncDailyIndexes({ run = queryDb, fetcher = secFetch, days = coverageDays(), maxDays = 6, now = new Date() } = {}) {
  const id = await startRun(run, "daily-index");
  const stats = { daysRead: 0, listed: 0, queued: 0, alreadyImported: 0, noIndex: 0, errors: 0 };
  try {
    const want = windowDays(days, now);
    const have = new Map((await run("SELECT day,status,fetched_at,attempts FROM sec_index_days WHERE day=ANY($1::date[])", [want])).rows.map(r => [dayKey(new Date(r.day)), r]));
    const recent = new Set(want.slice(0, 3)); // the last three business days are re-read: late dissemination fills them in
    const todo = want.filter(d => {
      const r = have.get(d);
      if (!r) return true;
      if (r.status === "complete") return recent.has(d) && Date.now() - new Date(r.fetched_at).getTime() > 6 * 3600_000;
      // An error or a missing index is retried, less often each time, for a week.
      return Date.now() - new Date(r.fetched_at).getTime() > Math.min(7 * 86400_000, 3600_000 * 2 ** Math.min(7, r.attempts));
    }).slice(0, maxDays);
    for (const day of todo) {
      const url = dailyIndexUrl(day);
      let text;
      try { text = await fetcher(url); }
      catch (e) {
        const msg = String(e?.message || e);
        // EDGAR answers 403 (not 404) for an archive file that does not exist, which is what a weekend, a holiday or
        // today's not-yet-disseminated index look like. A refused client is caught by the next real fetch instead.
        const status = /SEC responded 40[34]/.test(msg) ? "no_index" : "error";
        if (status === "no_index") stats.noIndex++; else stats.errors++;
        await run(`INSERT INTO sec_index_days(day,status,source_url,error_message) VALUES($1,$2,$3,$4)
          ON CONFLICT (day) DO UPDATE SET status=EXCLUDED.status,fetched_at=now(),attempts=sec_index_days.attempts+1,error_message=EXCLUDED.error_message`,
          [day, status, url, status === "no_index" ? "No daily index published (market holiday, or not yet disseminated)" : msg.slice(0, 300)]);
        continue;
      }
      const rows = parseFormIndex(text);
      const done = new Set((await run("SELECT accession FROM sec_filings WHERE accession=ANY($1::text[]) AND ingest_status='parsed'", [rows.map(r => r.accession)])).rows.map(r => r.accession));
      for (let i = 0; i < rows.length; i += 1000) {
        const part = rows.slice(i, i + 1000);
        const r = await run(`INSERT INTO sec_ingest_queue(accession,filer_cik,filer_name,form_type,filed_date,index_day,source,status,done_at)
          SELECT a,c,n,f,d::date,$7::date,'daily-index',s,CASE WHEN s='done' THEN now() END FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[]) AS x(a,c,n,f,d,s)
          ON CONFLICT (accession) DO UPDATE SET filed_date=COALESCE(sec_ingest_queue.filed_date,EXCLUDED.filed_date),filer_name=COALESCE(sec_ingest_queue.filer_name,EXCLUDED.filer_name),
            index_day=COALESCE(sec_ingest_queue.index_day,EXCLUDED.index_day)
          RETURNING (xmax=0) AS inserted, status`,
          [part.map(x => x.accession), part.map(x => x.filerCik), part.map(x => x.filerName), part.map(x => x.formType), part.map(x => x.filedDate), part.map(x => done.has(x.accession) ? "done" : "pending"), day]);
        stats.queued += r.rows.filter(x => x.inserted && x.status === "pending").length;
      }
      stats.daysRead++; stats.listed += rows.length; stats.alreadyImported += done.size;
      await run(`INSERT INTO sec_index_days(day,status,form4_count,source_url) VALUES($1,'complete',$2,$3)
        ON CONFLICT (day) DO UPDATE SET status='complete',form4_count=EXCLUDED.form4_count,fetched_at=now(),attempts=sec_index_days.attempts+1,error_message=NULL`, [day, rows.length, url]);
    }
    await finishRun(run, id, stats.errors ? "partial" : "success", stats);
    return stats;
  } catch (e) {
    await finishRun(run, id, "error", stats, e?.message || e).catch(() => {});
    throw e;
  }
}

/* Accessions the live feed imported are marked done in the queue too, so reconciliation sees them. */
export async function markImported(run = queryDb) {
  return (await run(`UPDATE sec_ingest_queue q SET status='done',done_at=COALESCE(q.done_at,now()),last_error=NULL,updated_at=now()
    FROM sec_filings f WHERE f.accession=q.accession AND f.ingest_status='parsed' AND f.parser_version>=$1 AND q.status<>'done'`, [PARSER_VERSION])).rowCount || 0;
}
/* Filings read by an older parser (before PARSER_VERSION) go back into the queue, newest first and a bounded number
 * per run, so the fields that version added are read from EDGAR for them too. Idempotent. */
export async function queueReparse({ run = queryDb, limit = 3000 } = {}) {
  const r = await run(`INSERT INTO sec_ingest_queue(accession,filer_cik,form_type,filed_date,source,status)
    SELECT f.accession,f.filer_cik,f.form_type,(f.published_at AT TIME ZONE 'America/New_York')::date,'reparse','pending' FROM sec_filings f
    WHERE f.ingest_status='parsed' AND COALESCE(f.parser_version,0)<$1 AND f.accession ~ '^[0-9]{18}$'
      AND NOT EXISTS (SELECT 1 FROM sec_ingest_queue q WHERE q.accession=f.accession AND q.status IN ('pending','retry','running','failed'))
    ORDER BY f.published_at DESC NULLS LAST LIMIT $2
    ON CONFLICT (accession) DO UPDATE SET status='pending',next_attempt_at=now(),attempts=0,last_error=NULL,updated_at=now()
      WHERE sec_ingest_queue.status='done'`, [PARSER_VERSION, limit]);
  return r.rowCount || 0;
}

export function filingFromQueue(row) {
  const cik = String(Number(row.filer_cik)), acc = row.accession;
  const dashed = acc.slice(0, 10) + "-" + acc.slice(10, 12) + "-" + acc.slice(12);
  return { accession: acc, filerCik: cik, title: (row.form_type || "4") + " - " + (row.filer_name || "CIK " + cik) + " (" + cik.padStart(10, "0") + ")",
    publishedAt: null, formType: row.form_type || "4",
    sourceUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${dashed}-index.htm`, indexBase: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/` };
}

export async function drainIngestQueue({ run = queryDb, load = loadOwnership, persist = persistFiling, budget = 60, workerId = "w" + process.pid,
  maxBacklogMs = 2500, deadlineMs = 8 * 60_000, backlog = secBacklogMs } = {}) {
  const id = await startRun(run, "ingest-queue");
  const stats = { claimed: 0, imported: 0, retried: 0, failed: 0, released: 0, recovered: 0, yielded: false };
  const until = Date.now() + deadlineMs;
  try {
    stats.recovered = (await run(`UPDATE sec_ingest_queue SET status='retry',locked_at=NULL,locked_by=NULL,next_attempt_at=now(),
      last_error=COALESCE(last_error,'worker stopped before finishing'),updated_at=now() WHERE status='running' AND locked_at<now()-interval '20 minutes'`)).rowCount || 0;
    const claimed = (await run(`UPDATE sec_ingest_queue q SET status='running',locked_at=now(),locked_by=$2,attempts=q.attempts+1,updated_at=now()
      WHERE q.accession IN (SELECT accession FROM sec_ingest_queue WHERE status IN ('pending','retry') AND next_attempt_at<=now()
        ORDER BY filed_date DESC NULLS LAST,accession DESC LIMIT $1 FOR UPDATE SKIP LOCKED) RETURNING q.*`, [Math.max(1, Math.min(500, budget)), workerId])).rows;
    stats.claimed = claimed.length;
    let stop = null;
    for (const row of claimed) {
      if (stop || Date.now() > until || backlog() > maxBacklogMs) {
        if (!stop && backlog() > maxBacklogMs) stats.yielded = true;
        await run("UPDATE sec_ingest_queue SET status='pending',locked_at=NULL,locked_by=NULL,attempts=GREATEST(0,attempts-1),updated_at=now() WHERE accession=$1 AND locked_by=$2", [row.accession, workerId]);
        stats.released++;
        continue;
      }
      try {
        const data = await load(filingFromQueue(row));
        if (!data || data.accession !== row.accession) throw new Error("Parsed accession does not match the queued one");
        await persist(data);
        await run("UPDATE sec_ingest_queue SET status='done',done_at=now(),locked_at=NULL,locked_by=NULL,last_error=NULL,updated_at=now() WHERE accession=$1", [row.accession]);
        stats.imported++;
      } catch (e) {
        const msg = String(e?.message || e).slice(0, 400);
        if (/SEC responded 403/.test(msg)) stop = msg;
        const permanent = PERMANENT.test(msg) && row.attempts >= 2;
        const final = permanent || row.attempts >= MAX_ATTEMPTS;
        await run(`UPDATE sec_ingest_queue SET status=$2,last_error=$3,locked_at=NULL,locked_by=NULL,updated_at=now(),
          next_attempt_at=now()+LEAST(interval '1 day',interval '15 minutes'*power(2,GREATEST(0,attempts-1))) WHERE accession=$1`,
          [row.accession, final ? "failed" : "retry", msg]);
        if (final) stats.failed++; else stats.retried++;
        // Logged with the accession and the reason only: no member data is involved.
        console.warn(JSON.stringify({ event: "ingest.queue.error", accession: row.accession, attempt: row.attempts, final, reason: msg.slice(0, 160) }));
      }
    }
    await finishRun(run, id, stop ? "error" : stats.failed || stats.retried ? "partial" : "success", stats, stop);
    return stats;
  } catch (e) {
    await finishRun(run, id, "error", stats, e?.message || e).catch(() => {});
    throw e;
  }
}

const iso = v => v ? new Date(v).toISOString() : null;
const n = v => Number(v) || 0;
/* Every number is a COUNT over stored rows at the moment of the call. */
export async function coverageReport({ run = queryDb, days = coverageDays(), now = new Date() } = {}) {
  const want = windowDays(days, now);
  const [ent, names, filings, queue, idx, runs, oldest, perDay] = await Promise.all([
    run(`SELECT count(*)::int AS entities,
        count(*) FILTER (WHERE kind='company')::int AS companies, count(*) FILTER (WHERE kind='company' AND listed)::int AS listed,
        count(*) FILTER (WHERE kind='company' AND NOT listed)::int AS unlisted_companies,
        count(*) FILTER (WHERE kind='company' AND delisted_at IS NOT NULL)::int AS left_ticker_list,
        count(*) FILTER (WHERE is_issuer AND issuer_filings>0)::int AS issuers_with_filings,
        count(*) FILTER (WHERE kind='person')::int AS persons, count(*) FILTER (WHERE kind='organization')::int AS organizations,
        count(*) FILTER (WHERE is_reporting_owner)::int AS reporting_owners,
        count(*) FILTER (WHERE is_reporting_owner AND owner_filings>0)::int AS owners_with_filings,
        count(*) FILTER (WHERE kind='unknown')::int AS unresolved,
        count(*) FILTER (WHERE profile_refreshed_at IS NOT NULL)::int AS resolved_from_edgar
      FROM sec_entities`),
    run(`SELECT count(*)::int AS names, count(*) FILTER (WHERE name_kind='former')::int AS former, count(*) FILTER (WHERE name_kind='ticker')::int AS tickers FROM sec_entity_names`),
    run(`SELECT count(*) FILTER (WHERE ingest_status='parsed')::int AS parsed, count(*) FILTER (WHERE ingest_status='error')::int AS errors,
        count(*) FILTER (WHERE ingest_status='pending')::int AS pending, max(published_at) FILTER (WHERE ingest_status='parsed') AS newest,
        min(published_at) FILTER (WHERE ingest_status='parsed') AS oldest,
        (SELECT count(*)::int FROM sec_transactions) AS transactions,
        (SELECT count(DISTINCT owner_cik)::int FROM sec_filing_owners) AS distinct_owner_ciks
      FROM sec_filings`),
    run(`SELECT status,count(*)::int AS n FROM sec_ingest_queue GROUP BY status`),
    run(`SELECT count(*) FILTER (WHERE status='complete')::int AS complete, count(*) FILTER (WHERE status='no_index')::int AS no_index,
        count(*) FILTER (WHERE status='error')::int AS errors, COALESCE(sum(form4_count) FILTER (WHERE status='complete'),0)::int AS listed,
        min(day) FILTER (WHERE status='complete') AS earliest, max(day) FILTER (WHERE status='complete') AS latest
      FROM sec_index_days WHERE day=ANY($1::date[])`, [want]),
    run(`SELECT DISTINCT ON (job) job,status,started_at,finished_at,stats,error_message FROM sec_sync_runs ORDER BY job,started_at DESC`),
    run(`SELECT DISTINCT ON (job) job,finished_at FROM sec_sync_runs WHERE status IN ('success','partial') ORDER BY job,finished_at DESC`),
    run(`SELECT d.day,d.form4_count,count(q.accession) FILTER (WHERE q.status='done')::int AS done,
        count(q.accession) FILTER (WHERE q.status='failed')::int AS failed, count(q.accession) FILTER (WHERE q.status IN ('pending','retry','running'))::int AS waiting
      FROM sec_index_days d LEFT JOIN sec_ingest_queue q ON q.index_day=d.day
      WHERE d.status='complete' AND d.day=ANY($1::date[]) GROUP BY d.day,d.form4_count ORDER BY d.day DESC LIMIT 120`, [want])
  ]);
  const q = Object.fromEntries(queue.rows.map(r => [r.status, r.n]));
  const e = ent.rows[0], f = filings.rows[0], ix = idx.rows[0];
  const lastOk = Object.fromEntries(oldest.rows.map(r => [r.job, iso(r.finished_at)]));
  const listedInIndex = n(ix.listed), importedFromIndex = perDay.rows.reduce((s, r) => s + n(r.done), 0);
  return {
    generatedAt: new Date().toISOString(),
    universe: {
      companies: "CIKs on the SEC company ticker list (company_tickers_exchange.json), every issuer on an imported Form 4, and any EDGAR filer looked up by CIK or name.",
      reportingPersons: "Every reporting owner (CIK) named on an imported Form 4 or 4/A, joint filers included, and any EDGAR filer resolved on demand.",
      filings: `SEC Form 4 and 4/A filed on EDGAR in the last ${days} calendar days, reconciled against EDGAR's daily form indexes.`,
      notCovered: ["Forms 3 and 5 (initial statements and annual statements) are not imported", `Form 4 filings older than ${days} days are not backfilled`,
        "Paper filings and filings without ownership XML cannot be parsed", "Companies not registered with the SEC, and people who have never filed with the SEC, are outside EDGAR",
        "Person vs organization is decided from the filed name for reporting owners, not from an SEC field"]
    },
    entities: { total: e.entities, companies: e.companies, listedCompanies: e.listed, unlistedCompanies: e.unlisted_companies, leftTickerList: e.left_ticker_list,
      issuersWithImportedFilings: e.issuers_with_filings, persons: e.persons, organizations: e.organizations, reportingOwners: e.reporting_owners,
      reportingOwnersWithImportedFilings: e.owners_with_filings, unresolved: e.unresolved, resolvedFromEdgar: e.resolved_from_edgar,
      searchableNames: names.rows[0].names, formerNames: names.rows[0].former, tickers: names.rows[0].tickers },
    filings: { parsed: f.parsed, failed: f.errors, pending: f.pending, transactions: f.transactions, distinctOwnerCiks: f.distinct_owner_ciks,
      newestPublishedAt: iso(f.newest), oldestPublishedAt: iso(f.oldest) },
    queue: { pending: n(q.pending), retry: n(q.retry), running: n(q.running), done: n(q.done), failed: n(q.failed) },
    backfill: { windowDays: days, businessDays: want.length, indexDaysRead: n(ix.complete), indexDaysMissing: n(ix.no_index), indexDayErrors: n(ix.errors),
      earliestDay: ix.earliest ? dayKey(new Date(ix.earliest)) : null, latestDay: ix.latest ? dayKey(new Date(ix.latest)) : null,
      listedByEdgar: listedInIndex, imported: importedFromIndex, percentImported: listedInIndex ? Math.round(importedFromIndex / listedInIndex * 1000) / 10 : null },
    reconciliation: perDay.rows.map(r => ({ day: dayKey(new Date(r.day)), listedByEdgar: r.form4_count, imported: r.done, failed: r.failed, waiting: r.waiting,
      missing: Math.max(0, r.form4_count - r.done - r.failed - r.waiting) })),
    lastSuccessfulSync: lastOk,
    jobs: runs.rows.map(r => ({ job: r.job, status: r.status, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), stats: r.stats, error: r.error_message }))
  };
}

/* Data-quality measurements. Each check is a count with up to five example rows, never a pass/fail invented here. */
export async function qualityChecks({ run = queryDb, now = new Date() } = {}) {
  const checks = [
    ["transaction_after_filing", "Transaction dated after its filing was published", `SELECT t.id AS example FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession
      WHERE t.transaction_date > (f.published_at AT TIME ZONE 'America/New_York')::date + 1`],
    ["implausible_transaction_date", "Transaction date before 1990 or in the future", `SELECT id AS example FROM sec_transactions WHERE transaction_date < '1990-01-01' OR transaction_date > current_date + 1`],
    ["missing_transaction_date", "Transaction without a date", `SELECT id AS example FROM sec_transactions WHERE transaction_date IS NULL`],
    ["broken_source_link", "Source link not an SEC EDGAR archive URL for its accession", `SELECT accession AS example FROM sec_filings WHERE ingest_status='parsed'
      AND source_url !~ ('^https://www\\.sec\\.gov/Archives/edgar/data/[0-9]+/'||accession||'/')`],
    ["purchase_misclassified", "Line classed as a purchase that is not a non-derivative P/A", `SELECT id AS example FROM sec_transactions WHERE category='reported_purchase'
      AND (derivative OR transaction_code IS DISTINCT FROM 'P' OR acquired_disposed IS DISTINCT FROM 'A')`],
    ["sale_misclassified", "Line classed as a sale that is not a non-derivative S/D", `SELECT id AS example FROM sec_transactions WHERE category='reported_sale'
      AND (derivative OR transaction_code IS DISTINCT FROM 'S' OR acquired_disposed IS DISTINCT FROM 'D')`],
    ["unclassified_open_market", "Non-derivative P/A or S/D line not classed as a purchase or sale", `SELECT id AS example FROM sec_transactions WHERE category='other' AND NOT derivative
      AND ((transaction_code='P' AND acquired_disposed='A') OR (transaction_code='S' AND acquired_disposed='D'))`],
    ["value_mismatch", "Estimated value not equal to shares × price", `SELECT id AS example FROM sec_transactions WHERE estimated_value IS NOT NULL AND shares IS NOT NULL AND price_per_share IS NOT NULL
      AND abs(estimated_value - round(shares*price_per_share,2)) > 0.05`],
    ["filing_without_owner", "Parsed filing with no reporting owner row", `SELECT f.accession AS example FROM sec_filings f WHERE f.ingest_status='parsed'
      AND NOT EXISTS (SELECT 1 FROM sec_filing_owners o WHERE o.accession=f.accession)
      AND NOT EXISTS (SELECT 1 FROM sec_transactions t WHERE t.accession=f.accession AND t.owner_cik IS NOT NULL)`],
    ["owner_without_role", "Reporting owner with no relationship stated (director, officer, 10% owner or other)", `SELECT accession||':'||owner_cik AS example FROM sec_filing_owners
      WHERE NOT is_director AND NOT is_officer AND NOT is_ten_percent_owner AND COALESCE(other_text,'')=''`],
    ["issuer_not_in_directory", "Issuer CIK on a filing that is not in the entity directory", `SELECT DISTINCT f.issuer_cik AS example FROM sec_filings f WHERE f.ingest_status='parsed' AND f.issuer_cik IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM sec_entities e WHERE e.cik=LPAD(LTRIM(f.issuer_cik,'0'),10,'0'))`],
    ["filing_without_ticker_mapping", "Filing whose issuer has no ticker on the filing and none in the directory", `SELECT DISTINCT f.issuer_cik AS example FROM sec_filings f
      LEFT JOIN sec_entities e ON e.cik=LPAD(LTRIM(f.issuer_cik,'0'),10,'0') WHERE f.ingest_status='parsed' AND f.ticker IS NULL AND COALESCE(cardinality(e.tickers),0)=0`],
    ["ticker_on_several_ciks", "Ticker currently listed for more than one CIK", `SELECT n.norm AS example FROM sec_entity_names n JOIN sec_entities e ON e.cik=n.cik
      WHERE n.name_kind='ticker' AND e.listed AND n.norm = ANY(e.tickers) GROUP BY n.norm HAVING count(DISTINCT n.cik)>1`],
    ["possible_duplicate_people", "Same filed person name under more than one CIK (may be different people)", `SELECT n.norm AS example FROM sec_entity_names n JOIN sec_entities e ON e.cik=n.cik
      WHERE e.kind='person' AND n.name_kind IN ('name','filed') GROUP BY n.norm HAVING count(DISTINCT n.cik)>1`],
    ["unparsed_filings", "Filings that failed to parse (stored with their error)", `SELECT accession AS example FROM sec_filings WHERE ingest_status='error'`],
    ["queue_failed", "Queued accessions that failed every attempt", `SELECT accession AS example FROM sec_ingest_queue WHERE status='failed'`],
    ["validation_flagged", "Filings that failed validation (kept, shown with their issues, never alerted)", `SELECT accession||': '||COALESCE((SELECT string_agg(i->>'code',',') FROM jsonb_array_elements(validation_issues) i WHERE i->>'severity'='error'),'') AS example FROM sec_filings WHERE validation_status='flagged'`],
    ["older_parser", "Filings read by an older parser version, waiting to be re-read", `SELECT accession AS example FROM sec_filings WHERE ingest_status='parsed' AND COALESCE(parser_version,0)<${PARSER_VERSION}`],
    ["queue_overdue", "Queued accessions waiting more than a day", `SELECT accession AS example FROM sec_ingest_queue WHERE status IN ('pending','retry') AND created_at<now()-interval '1 day'`],
    ["holdings_negative", "13F holding with a negative value or share count", `SELECT accession||':'||row_no AS example FROM form13f_holdings WHERE value_usd<0 OR shares_or_principal<0`]
  ];
  const out = [];
  for (const [key, label, sql] of checks) {
    try {
      const rows = (await run(`SELECT count(*) OVER ()::int AS n, example FROM (${sql}) x LIMIT 5`)).rows;
      out.push({ key, label, count: rows[0]?.n || 0, examples: rows.map(r => String(r.example)) });
    } catch (e) { out.push({ key, label, count: null, error: String(e?.message || e).slice(0, 160) }); }
  }
  const fresh = (await run(`SELECT max(published_at) AS newest FROM sec_filings WHERE ingest_status='parsed'`)).rows[0]?.newest;
  const ageH = fresh ? (now - new Date(fresh)) / 3600_000 : null;
  // Weekends and holidays are quiet on EDGAR; four days without a new filing means the import has stopped.
  out.push({ key: "stale_filings", label: "Hours since the newest imported filing was published", count: ageH == null ? null : Math.round(ageH), stale: ageH == null || ageH > 96, examples: fresh ? [new Date(fresh).toISOString()] : [] });
  return out;
}
