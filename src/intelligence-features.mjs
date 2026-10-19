/* Insidir Intelligence: bounded, source-linked research, no trade execution.
 * Shared event ingestion is handled by intelligence-monitor.mjs; these views
 * query indexed facts rather than invoking a model per page view. */
import {query as queryDb} from "./db.mjs";
export async function intelligenceBriefing(userId,run=queryDb){
 const r=await run(`SELECT e.event_key,e.title,e.subject,e.source_type,e.source_url,e.published_at,e.observed_at
 FROM research_events e JOIN watchlist w ON w.ticker=e.subject AND w.user_id=$1
 WHERE e.verified=true AND e.observed_at>=now()-interval '7 days'
 ORDER BY e.observed_at DESC LIMIT 25`,[userId]);
 return {items:r.rows,windowDays:7,generatedBy:"verified_source_index",personalizedBy:"watchlist",advice:false,executed:false};
}
export async function investigateCompany(userId,symbol,run=queryDb){
 if(!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol))throw Object.assign(new Error("Invalid ticker"),{status:400});
 const [events,filings]=await Promise.all([
  run(`SELECT event_key,title,source_url,published_at,source_type FROM research_events
 WHERE verified=true AND (subject=$1 OR metadata->>'ticker'=$1)
 AND observed_at>=now()-interval '30 days' ORDER BY observed_at DESC LIMIT 20`,[symbol]),
  run(`SELECT accession,form_type,issuer_name,published_at,source_url FROM sec_filings
 WHERE ticker=$1 AND ingest_status='parsed' AND published_at>=now()-interval '30 days'
 ORDER BY published_at DESC LIMIT 20`,[symbol])
 ]);
 return {ticker:symbol,events:events.rows,filings:filings.rows,windowDays:30,
  summary:events.rows.length+filings.rows.length?
  `Found ${events.rows.length} verified public notices and ${filings.rows.length} imported SEC filings for ${symbol} in the past 30 days. Review the original sources below.`:
  `No matching indexed records for ${symbol} in the past 30 days. This does not establish that no activity occurred.`,
  mode:"source_linked_research",advice:false,executed:false};
}

/* Form 4 research events (sec_events, src/research-events.mjs) for the companies a member watches and the people
 * they follow. Each row keeps the trade date, the SEC filing time and the reporting lag apart, with its sources. */
import {eventSummary} from "./research-events.mjs";
const EVENT_COLS=`e.id,e.event_type,e.ticker,e.issuer_name,e.owner_cik,e.owner_name,e.transaction_date,e.transaction_date_end,
 e.filing_date,e.reporting_lag_days,e.accessions,e.source_urls,e.facts`;
const followedCiks=async(userId,run)=>(await run("SELECT lpad(ltrim(owner_cik,'0'),10,'0') AS cik FROM followed_people WHERE user_id=$1",[userId])).rows.map(r=>r.cik);
const shape=e=>({id:String(e.id),eventType:e.event_type,ticker:e.ticker,issuerName:e.issuer_name,ownerCik:e.owner_cik,ownerName:e.owner_name,
 transactionDate:e.transaction_date,transactionDateEnd:e.transaction_date_end,filingDate:e.filing_date,reportingLagDays:e.reporting_lag_days,
 totalShares:e.facts?.totalShares??null,totalValue:e.facts?.totalValue??null,valueComplete:e.facts?.valueComplete!==false,amended:!!e.facts?.amended,
 accessions:e.accessions,sourceUrls:e.source_urls,summary:eventSummary(e)});

export async function filingBriefing(userId,run=queryDb,{days=7,limit=30}={}){
 const ciks=await followedCiks(userId,run);
 const r=await run(`SELECT ${EVENT_COLS} FROM sec_events e
 WHERE e.status='active' AND e.event_type<>'company_disclosure' AND e.filing_date>=now()-make_interval(days=>$3)
  AND (e.ticker IN (SELECT ticker FROM watchlist WHERE user_id=$1)
   OR EXISTS(SELECT 1 FROM sec_event_people p WHERE p.event_id=e.id AND p.owner_cik=ANY($2::text[])))
 ORDER BY e.filing_date DESC,e.id DESC LIMIT $4`,[userId,ciks,days,limit]);
 return {items:r.rows.map(shape),windowDays:days,source:"SEC Form 4, as imported",advice:false};
}

/* Mirror: the reported open-market record of the people a member follows, exactly as filed. It reflects
 * disclosures after the fact (Form 4 is due two business days after a trade, and often arrives later); it does not
 * copy trades, place orders, model a portfolio or estimate returns, and research-only mode has no way to. */
export const MIRROR_LIMITS=Object.freeze({copyTrading:"not_available",orderPlacement:"not_available",simulatedPortfolio:"not_built",
 note:"Mirror shows what followed people reported to the SEC, after the fact. It does not copy trades, place orders or track live positions."});
export async function mirrorRecord(userId,run=queryDb,{days=180,limit=80}={}){
 const ciks=await followedCiks(userId,run);
 if(!ciks.length)return {people:[],items:[],following:0,windowDays:days,...MIRROR_LIMITS,advice:false,executed:false};
 const [items,people]=await Promise.all([
  run(`SELECT ${EVENT_COLS} FROM sec_events e
  WHERE e.status='active' AND e.event_type IN ('insider_purchase','insider_sale') AND e.filing_date>=now()-make_interval(days=>$2)
   AND EXISTS(SELECT 1 FROM sec_event_people p WHERE p.event_id=e.id AND p.owner_cik=ANY($1::text[]))
  ORDER BY e.filing_date DESC,e.id DESC LIMIT $3`,[ciks,days,limit]),
  run(`SELECT p.owner_cik,max(e.owner_name) AS owner_name,count(*) FILTER (WHERE e.event_type='insider_purchase')::int AS purchases,
   count(*) FILTER (WHERE e.event_type='insider_sale')::int AS sales,round(avg(e.reporting_lag_days)::numeric,1) AS avg_lag_days,max(e.filing_date) AS last_filed
  FROM sec_event_people p JOIN sec_events e ON e.id=p.event_id
  WHERE p.owner_cik=ANY($1::text[]) AND e.status='active' AND e.event_type IN ('insider_purchase','insider_sale') AND e.filing_date>=now()-make_interval(days=>$2)
  GROUP BY p.owner_cik ORDER BY max(e.filing_date) DESC`,[ciks,days])]);
 return {people:people.rows.map(p=>({ownerCik:p.owner_cik,ownerName:p.owner_name,purchases:p.purchases,sales:p.sales,
   avgLagDays:p.avg_lag_days==null?null:Number(p.avg_lag_days),lastFiled:p.last_filed})),
  items:items.rows.map(shape),following:ciks.length,windowDays:days,source:"SEC Form 4, as imported",...MIRROR_LIMITS,advice:false,executed:false};
}
