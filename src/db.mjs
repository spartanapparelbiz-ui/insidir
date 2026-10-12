import pg from "pg";
import { readFile } from "node:fs/promises";
import { config } from "./config.mjs";
const { Pool } = pg;
export const pool = config.databaseUrl ? new Pool({ connectionString: config.databaseUrl, max: 6, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 }) : null;
export function requireDb() {
  if (!pool) throw Object.assign(new Error("DATABASE_URL not configured"),{status:503});
  return pool;
}
export async function query(sql, params=[]) { return requireDb().query(sql,params); }
export async function migrate() {
  const db=requireDb();
  const client=await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(813076521)");
    const schema=await readFile(new URL("../sql/001_initial.sql",import.meta.url),"utf8");
    await client.query(schema);
    const billingSchema=await readFile(new URL("../sql/002_billing.sql",import.meta.url),"utf8");
    await client.query(billingSchema);
    const researchSchema=await readFile(new URL("../sql/003_research_decisions.sql",import.meta.url),"utf8");
    await client.query(researchSchema);
    await client.query("COMMIT");
  } catch(e) { await client.query("ROLLBACK");throw e; }
  finally {client.release()}
}
export async function health() {
  if(!pool) return {ok:false,db:"not_configured"};
  try {await pool.query("SELECT 1");return {ok:true,db:"connected"};} catch {return {ok:false,db:"unavailable"}}
}
export async function isParsed(accession) {
  const r=await query("SELECT ingest_status FROM sec_filings WHERE accession=$1",[accession]);
  return r.rows[0]?.ingest_status==="parsed";
}
export async function persistFiling(filing) {
  const client=await requireDb().connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO sec_filings
      (accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,period_of_report,is_amendment,source_url,xml_url,owner_names,ingest_status,retrieved_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'parsed',now(),now())
      ON CONFLICT (accession) DO UPDATE SET
      issuer_cik=EXCLUDED.issuer_cik,issuer_name=EXCLUDED.issuer_name,ticker=EXCLUDED.ticker,title=EXCLUDED.title,
      form_type=EXCLUDED.form_type,published_at=EXCLUDED.published_at,period_of_report=EXCLUDED.period_of_report,
      is_amendment=EXCLUDED.is_amendment,source_url=EXCLUDED.source_url,xml_url=EXCLUDED.xml_url,
      owner_names=EXCLUDED.owner_names,ingest_status='parsed',error_message=NULL,retrieved_at=now(),updated_at=now()`,
      [filing.accession,filing.filerCik,filing.issuerCik,filing.issuerName,filing.ticker,filing.title,filing.formType,
       filing.publishedAt,filing.periodOfReport,filing.isAmendment,filing.sourceUrl,filing.xmlUrl,filing.owners.map(o=>o.name)]);
    await client.query("DELETE FROM sec_transactions WHERE accession=$1",[filing.accession]);
    for(const t of filing.transactions) {
      await client.query(`INSERT INTO sec_transactions
        (id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,security_title,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,direct_ownership,source_url)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [t.id,t.accession,t.issuerCik,t.ticker,t.ownerCik,t.ownerName,t.transactionDate,t.securityTitle,t.code,t.acquiredDisposed,
         t.category,t.derivative,t.shares,t.pricePerShare,t.estimatedValue,t.directOwnership,t.sourceUrl]);
    }
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e}
  finally{client.release()}
}
export async function persistFailure(filing,error) {
  const text=String(error?.message||error).slice(0,500);
  await query(`INSERT INTO sec_filings(accession,filer_cik,title,form_type,source_url,published_at,ingest_status,error_message)
    VALUES($1,$2,$3,$4,$5,$6,'error',$7)
    ON CONFLICT(accession) DO UPDATE SET ingest_status='error',error_message=EXCLUDED.error_message,updated_at=now()`,
    [filing.accession,filing.filerCik,filing.title,filing.formType,filing.sourceUrl,filing.publishedAt,text]);
}
