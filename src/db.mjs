import { createHash } from "node:crypto";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { config } from "./config.mjs";
import { PARSER_VERSION, validateOwnership } from "./sec.mjs";
const { Pool } = pg;
/* JIT compilation costs far more than it saves on this engine's short queries: on PostgreSQL 16 it
 * added 0.6-1.4 s to the followed-people feed, whose plan itself runs in about 0.15 s (150 follows),
 * because the planner's cost estimate crosses jit_above_cost. So it is off for the engine's
 * connections, unless DATABASE_URL carries its own `options`, which then apply exactly as given. */
export const poolOptions = url => /[?&]options=/.test(String(url || "")) ? {} : { options: "-c jit=off" };
/* Each background job holds one connection for its advisory lock while its queries use others, and about a dozen jobs
 * start within minutes of each other after a deploy: six connections ran out (a job then waited 10 s and failed before
 * recording anything). PGPOOL_MAX overrides; PostgreSQL's default limit is 100 connections. */
const poolMax = Math.max(4, Math.min(50, Math.trunc(Number(process.env.PGPOOL_MAX)) || 20));
export const pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl, max: poolMax, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000, ...poolOptions(config.databaseUrl) }) : null;
// An idle client that loses its connection (database restart, failover) emits "error" on the pool;
// without a listener Node treats it as uncaught and the whole engine exits. Log it and let the pool reconnect.
pool?.on("error", err => console.error("Postgres idle client error", err?.code || "", err?.message || err));
export function requireDb() {
  if (!pool) throw Object.assign(new Error("DATABASE_URL not configured"),{status:503});
  return pool;
}
export async function query(sql, params=[]) { return requireDb().query(sql,params); }
// Applied in order on every start, inside one transaction under an advisory lock; each file is idempotent.
export const MIGRATIONS=Object.freeze(["001_initial.sql","002_billing.sql","003_research_decisions.sql","004_brokerage_oauth.sql",
  "005_manual_holdings.sql","006_followed_people.sql","007_entity_media.sql","008_filing_owners.sql","009_creator_referrals.sql",
  "010_paid_trial.sql","011_compliance_records.sql","012_entity_media_gif.sql","013_account_security.sql","013_intelligence_delivery.sql","014_email.sql","014_intelligence_platform.sql","015_query_indexes.sql","015_sec_events.sql","016_explanations.sql","016_funnel_events.sql","017_notifications.sql","018_coverage.sql","019_form4_detail.sql","020_cost_controls.sql","021_autopilot.sql"]);
// `db` defaults to the engine's pool; tests that build the schema through their own pool pass it.
export async function migrate(db=requireDb()) {
  // Every file is idempotent, but even a no-op ALTER TABLE takes an exclusive table lock, so re-running them all on
  // each start deadlocked with another instance's live queries. schema_migrations records each file's SHA-256: a
  // start runs only files that are new or whose text changed, and an unchanged database takes no table lock.
  // Should a deadlock still happen (a real migration meeting live traffic), the transaction rolls back and is retried.
  const files=await Promise.all(MIGRATIONS.map(async name=>{const sql=await readFile(new URL("../sql/"+name,import.meta.url),"utf8");return {name,sql,checksum:createHash("sha256").update(sql).digest("hex")};}));
  for(let attempt=1;;attempt++){
    const client=await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(813076521)");
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      const applied=new Map((await client.query("SELECT name,checksum FROM schema_migrations")).rows.map(r=>[r.name,r.checksum]));
      for(const f of files){
        if(applied.get(f.name)===f.checksum)continue;
        await client.query(f.sql);
        await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2) ON CONFLICT (name) DO UPDATE SET checksum=EXCLUDED.checksum,applied_at=now()",[f.name,f.checksum]);
      }
      await client.query("COMMIT");
      return;
    } catch(e) {
      await client.query("ROLLBACK").catch(()=>{});
      if(e?.code!=="40P01"||attempt>=4)throw e;
      await new Promise(r=>setTimeout(r,250*attempt+Math.floor(Math.random()*250)));
    } finally {client.release()}
  }
}
export async function health() {
  if(!pool) return {ok:false,db:"not_configured"};
  try {await pool.query("SELECT 1");return {ok:true,db:"connected"};} catch {return {ok:false,db:"unavailable"}}
}
export async function isParsed(accession) {
  const r=await query("SELECT ingest_status FROM sec_filings WHERE accession=$1",[accession]);
  return r.rows[0]?.ingest_status==="parsed";
}
/* Every reporting owner of one filing into sec_filing_owners (sql/008), replacing what was there.
 * run(sql, params) is a client's or the pool's query. Owners without a usable CIK are skipped; a CIK
 * listed twice in one filing keeps its first row. Returns the number of rows written. Used by
 * persistFiling (inside its transaction) and scripts/backfill-filing-owners.mjs. */
export const FILING_OWNER_INSERT=`INSERT INTO sec_filing_owners(accession,owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner,other_text)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (accession,owner_cik) DO NOTHING`;
export async function writeFilingOwners(run,accession,owners){
  await run("DELETE FROM sec_filing_owners WHERE accession=$1",[accession]);
  let written=0;
  for(const o of Array.isArray(owners)?owners:[]){
    const cik=String(o?.cik??"").trim();
    if(!/^\d{1,10}$/.test(cik)||!/[1-9]/.test(cik))continue;
    const r=await run(FILING_OWNER_INSERT,[accession,cik,String(o.name||"Unspecified reporting owner"),Boolean(o.isDirector),Boolean(o.isOfficer),
      o.officerTitle??null,Boolean(o.isTenPercentOwner),o.otherText??null]);
    written+=r?.rowCount??0;
  }
  return written;
}
export async function persistFiling(filing) {
  const check=validateOwnership(filing);
  const client=await requireDb().connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO sec_filings
      (accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,period_of_report,is_amendment,source_url,xml_url,owner_names,rule_10b5_1,original_filed_on,parser_version,validation_status,validation_issues,ingest_status,retrieved_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'parsed',now(),now())
      ON CONFLICT (accession) DO UPDATE SET
      issuer_cik=EXCLUDED.issuer_cik,issuer_name=EXCLUDED.issuer_name,ticker=EXCLUDED.ticker,title=EXCLUDED.title,
      form_type=EXCLUDED.form_type,published_at=COALESCE(sec_filings.published_at,EXCLUDED.published_at),period_of_report=EXCLUDED.period_of_report,
      is_amendment=EXCLUDED.is_amendment,source_url=EXCLUDED.source_url,xml_url=EXCLUDED.xml_url,
      owner_names=EXCLUDED.owner_names,rule_10b5_1=EXCLUDED.rule_10b5_1,original_filed_on=EXCLUDED.original_filed_on,parser_version=EXCLUDED.parser_version,validation_status=EXCLUDED.validation_status,validation_issues=EXCLUDED.validation_issues,
      ingest_status='parsed',error_message=NULL,retrieved_at=now(),updated_at=now()`,
      [filing.accession,filing.filerCik,filing.issuerCik,filing.issuerName,filing.ticker,filing.title,filing.formType,
       filing.publishedAt,filing.periodOfReport,filing.isAmendment,filing.sourceUrl,filing.xmlUrl,filing.owners.map(o=>o.name),
       filing.rule10b51??null,filing.originalFiledOn??null,PARSER_VERSION,check.status,JSON.stringify(check.issues)]);
    await client.query("DELETE FROM sec_transactions WHERE accession=$1",[filing.accession]);
    for(const t of filing.transactions) {
      await client.query(`INSERT INTO sec_transactions
        (id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,security_title,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,direct_ownership,source_url,
         timeliness,nature_of_ownership,exercise_price,underlying_title,underlying_shares,exercise_date,expiration_date,shares_after)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [t.id,t.accession,t.issuerCik,t.ticker,t.ownerCik,t.ownerName,t.transactionDate,t.securityTitle,t.code,t.acquiredDisposed,
         t.category,t.derivative,t.shares,t.pricePerShare,t.estimatedValue,t.directOwnership,t.sourceUrl,
         t.timeliness??null,t.natureOfOwnership??null,t.exercisePrice??null,t.underlyingTitle??null,t.underlyingShares??null,t.exerciseDate??null,t.expirationDate??null,t.sharesAfter??null]);
    }
    // One row per reporting owner. A joint filing's lines above keep owner_cik NULL (counted once in
    // market totals); these rows attribute them to each owner (profiles, follows, the followed feed).
    await writeFilingOwners((sql,params)=>client.query(sql,params),filing.accession,filing.owners);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e}
  finally{client.release()}
}
export async function persistFailure(filing,error) {
  const text=String(error?.message||error).slice(0,500);
  await query(`INSERT INTO sec_filings(accession,filer_cik,title,form_type,source_url,published_at,ingest_status,error_message)
    VALUES($1,$2,$3,$4,$5,$6,'error',$7)
    ON CONFLICT(accession) DO UPDATE SET ingest_status='error',error_message=EXCLUDED.error_message,updated_at=now()`+
    // Retried with backoff (15 minutes, doubling, at most a day) by the retry worker; see research-events.mjs.
    `,attempts=sec_filings.attempts+1,next_retry_at=now()+LEAST(interval '1 day',interval '15 minutes'*power(2,sec_filings.attempts))`,
    [filing.accession,filing.filerCik,filing.title,filing.formType,filing.sourceUrl,filing.publishedAt,text]);
}
