/* Source-backed, research-only SEC filing explanation. No investor profiling, holdings,
 * price targets, recommendations or self-directed trade execution.
 * One explanation per filing content version, shared by every member (src/ai-gateway.mjs). */
import {query as queryDb} from "./db.mjs";
import {reviewGeneratedText} from "./compliance-guard.mjs";
import {aiConfigured,cachedGeneration,modelFor,sanitizeEvidence,SYSTEM_RULES} from "./ai-gateway.mjs";
const fail=(status,message)=>Object.assign(Error(message),{status});
export const aiReady=()=>aiConfigured();
export const FILING_PROMPT_VERSION="filing-v2";
export function evidenceFromFiling(f,rows){
 const parts=[
 "SEC Form "+String(f.form_type||"4"),
 "Company: "+String(f.issuer_name||"Not specified"),
 "Ticker: "+String(f.ticker||"Not specified"),
 "Publication date: "+String(f.published_at instanceof Date?f.published_at.toISOString():f.published_at||"Not specified"),
 "Period of report: "+String(f.period_of_report instanceof Date?f.period_of_report.toISOString().slice(0,10):f.period_of_report||"Not specified"),
 "Official source URL: "+String(f.source_url||"")
 ];
 for(const r of rows.slice(0,8)){
  parts.push("Reported line: "+String(r.owner_name||"Unspecified owner")+
  "; "+String(r.category||"other")+"; code "+String(r.transaction_code||"Not specified")+
  "; transaction date "+String(r.transaction_date instanceof Date?r.transaction_date.toISOString().slice(0,10):r.transaction_date||"Not specified")+
  "; security "+String(r.security_title||"Not specified")+
  "; shares "+String(r.shares??"Not specified")+
  "; price per share "+String(r.price_per_share??"Not specified")+
  "; reported value "+String(r.estimated_value??"Not specified"));
 }
 if(rows.length>8)parts.push("Additional reported lines not shown: "+(rows.length-8));
 return parts.join("\n").slice(0,5500);
}
export async function loadFilingEvidence(accession,run=queryDb){
 if(!/^\d{18}$/.test(String(accession||"")))throw fail(400,"Invalid SEC accession");
 const f=(await run("SELECT accession,form_type,issuer_name,ticker,published_at,period_of_report,source_url,retrieved_at FROM sec_filings WHERE accession=$1 AND ingest_status='parsed'",[accession])).rows[0];
 if(!f)throw fail(404,"Imported SEC filing not found");
 const rows=(await run("SELECT owner_name,category,transaction_code,transaction_date,security_title,shares,price_per_share,estimated_value FROM sec_transactions WHERE accession=$1 ORDER BY id LIMIT 40",[accession])).rows;
 return {filing:f,evidence:evidenceFromFiling(f,rows),source:f.source_url,retrievedAt:new Date(f.retrieved_at||Date.now()).toISOString()};
}
export async function explainFiling(accession,{run=queryDb,userId=null,env=process.env,generate}={}){
 const source=await loadFilingEvidence(accession,run);
 if(!aiConfigured(env))throw fail(503,"AI explanations are not configured on this deployment");
 const result=await cachedGeneration({sourceType:"sec_filing",sourceId:accession,content:source.evidence,explanationType:"filing_summary",
  promptVersion:FILING_PROMPT_VERSION,tier:"fast",maxTokens:180,userId,feature:"filing_summary",run,env,...(generate?{generate}:{}),
  build:()=>[{role:"system",content:SYSTEM_RULES+" Write 1-3 sentences, under 90 words."},
   {role:"user",content:"Summarize these public SEC facts:\n<evidence>\n"+sanitizeEvidence(source.evidence,6000)+"\n</evidence>"}],
  verify:text=>reviewGeneratedText({text,sources:[{text:source.evidence}],retrievedAt:source.retrievedAt})});
 const base={accession,sourceUrl:source.source,retrievedAt:source.retrievedAt,source:"SEC Form "+String(source.filing.form_type||"4"),automated:true,advice:false};
 if(result.status==="ready")return {...base,explanation:result.text,model:result.model,cached:result.cached,generatedAt:result.generatedAt};
 if(result.status==="limited")throw fail(429,result.error);
 if(result.status==="blocked")throw fail(422,"The generated summary did not pass Insidir's source and advice checks, so it is not shown. Read the original filing instead.");
 if(result.status==="pending")throw fail(503,"This summary is being written for another reader. Try again in a few seconds.");
 throw fail(503,result.error||"AI summary unavailable. Read the original filing instead.");
}
// On-demand only by default; INSIDIR_AI_BACKGROUND_BATCH (0-5) prewarms recent filings, shared by everyone.
const backgroundBatch=()=>Math.max(0,Math.min(5,Number(process.env.INSIDIR_AI_BACKGROUND_BATCH||0)));
let working=false;
export async function aiTick(run=queryDb){
 if(!aiReady()||working)return {enabled:aiReady(),skipped:true};
 working=true;
 try{
  const batch=backgroundBatch();
  if(!batch)return {enabled:true,mode:"on_demand_cache",created:0,failed:0,model:modelFor("fast")};
  const recent=(await run("SELECT f.accession FROM sec_filings f WHERE f.ingest_status='parsed' AND f.published_at>now()-interval '2 days' AND NOT EXISTS(SELECT 1 FROM ai_explanations x WHERE x.source_type='sec_filing' AND x.source_id=f.accession) ORDER BY f.published_at DESC LIMIT $1",[batch])).rows;
  let created=0,failed=0;
  for(const f of recent){try{await explainFiling(f.accession,{run});created++}catch(e){failed++;if(e.status===429)break}}
  return {enabled:true,created,failed};
 }finally{working=false}
}
