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
