/* Public SEC intelligence: deterministic, traceable, read-only. No LLM, trade signals, or broker orders. */
import { secFetch } from "./sec.mjs";

const TTL = 15 * 60 * 1000;
const INDEX_TTL = 24 * 60 * 60 * 1000;
const cache = new Map();
function cached(key, lifetime, work) {
  const existing = cache.get(key);
  if (existing && Date.now() < existing.expiresAt) return existing.value;
  const promise = Promise.resolve().then(work);
  cache.delete(key);
  cache.set(key, {value:promise,expiresAt:Date.now()+lifetime});
  if (cache.size > 160) cache.delete(cache.keys().next().value);
  promise.catch(() => {if(cache.get(key)?.value===promise)cache.delete(key);});
  return promise;
}
const isDate = value => typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const accessionOk = value => typeof value === "string" && /^\d{10}-\d{2}-\d{6}$/.test(value);
const docOk = value => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/.test(value);
const cikOk = value => typeof value === "string" && /^\d{10}$/.test(value);
export function secFilingUrl(cik, accession, primaryDocument) {
  if (!cikOk(cik) || !accessionOk(accession)) return null;
  const directory = "https://www.sec.gov/Archives/edgar/data/" + String(Number(cik)) + "/" + accession.replace(/-/g,"") + "/";
  return directory + (docOk(primaryDocument) ? primaryDocument : accession + "-index.html");
}
export function tickerRecord(index, symbol) {
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(symbol||""))) return null;
  for (const record of Object.values(index||{})) {
    if (!record || typeof record !== "object" || String(record.ticker||"").toUpperCase()!==symbol)continue;
    const id = String(record.cik_str||"");
    if (!/^\d{1,10}$/.test(id)) continue;
    return {ticker:symbol,cik:id.padStart(10,"0"),name:String(record.title||symbol).slice(0,150)};
  }
  return null;
}
const interesting = new Set(["8-K","8-K/A","10-Q","10-Q/A","10-K","10-K/A","SC 13D","SC 13D/A","SC 13G","SC 13G/A","DEF 14A"]);
const description = {
  "8-K":"Company current report","8-K/A":"Amended company current report",
  "10-Q":"Quarterly financial report","10-Q/A":"Amended quarterly report",
  "10-K":"Annual financial report","10-K/A":"Amended annual report",
  "SC 13D":"Beneficial ownership disclosure","SC 13D/A":"Amended beneficial ownership disclosure",
  "SC 13G":"Beneficial ownership disclosure","SC 13G/A":"Amended beneficial ownership disclosure",
  "DEF 14A":"Definitive proxy statement"
};
export function extractFilings(submissions, cik, limit=15) {
  const recent = submissions?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) return [];
  const output = [];
  for(let i=0;i<Math.min(recent.form.length,1500);i++){
    const form = recent.form[i], accession=recent.accessionNumber?.[i],filed=recent.filingDate?.[i];
    if (!interesting.has(form) || !accessionOk(accession) || !isDate(filed))continue;
    output.push({
      form,headline:description[form],filedAt:filed,
      reportDate:isDate(recent.reportDate?.[i])?recent.reportDate[i]:null,
      accession,sourceUrl:secFilingUrl(cik,accession,recent.primaryDocument?.[i]),
      source:"SEC EDGAR submissions"
    });
  }
  return output.sort((a,b)=>b.filedAt.localeCompare(a.filedAt)||b.accession.localeCompare(a.accession)).slice(0,limit);
}
const metrics = [
  {id:"revenue",label:"Reported revenue",tags:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet","RevenueFromContractWithCustomerIncludingAssessedTax"]},
  {id:"netIncome",label:"Reported net income",tags:["NetIncomeLoss"]},
  {id:"assets",label:"Reported total assets",tags:["Assets"]},
  {id:"operatingCashFlow",label:"Reported operating cash flow",tags:["NetCashProvidedByUsedInOperatingActivities"]}
];
export function extractFinancialFacts(companyFacts,cik) {
  const gaap=companyFacts?.facts?.["us-gaap"]||{};
  return metrics.flatMap(metric=>{
    let options=[];
    for(const tag of metric.tags){
      const entries=gaap[tag]?.units?.USD;
      if(!Array.isArray(entries))continue;
      options=entries.filter(x=>x && typeof x==="object" && Number.isFinite(x.val) &&
        isDate(x.filed) && isDate(x.end) && ["10-K","10-Q","10-K/A","10-Q/A"].includes(x.form) &&
        accessionOk(x.accn));
      if(options.length)break;
    }
    if(!options.length)return [];
    options.sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));
    const value=options[0];
    return [{
      id:metric.id,label:metric.label,value:value.val,unit:"USD",start:isDate(value.start)?value.start:null,
      periodEnd:value.end,filedAt:value.filed,form:value.form,
      fiscalYear:Number.isInteger(value.fy)?value.fy:null,
      fiscalPeriod:typeof value.fp==="string"?value.fp:null,
      sourceUrl:secFilingUrl(cik,value.accn),source:"SEC XBRL company facts"
    }];
  });
}
export function buildEvidenceBrief({company,filings=[],facts=[],transactions=[]}) {
  const items=[];
  for(const f of filings.slice(0,10)){
    items.push({id:"filing:"+f.accession,kind:"company_filing",title:f.headline+" filed",
      explanation:company.name+" reported a "+f.form+" on "+f.filedAt+". This record alone does not describe the contents of its exhibits or predict a price move.",
      reportedAt:f.filedAt,source:f.source,sourceUrl:f.sourceUrl});
  }
  for(const t of transactions.slice(0,20)){
    const action=t.category==="reported_purchase"?"a reported non-derivative purchase":
      t.category==="reported_sale"?"a reported non-derivative sale":"another Form 4 transaction";
    if (!isDate(String(t.published_at||"").slice(0,10))) continue;
    items.push({id:"ownership:"+t.id,kind:"insider_disclosure",
      title:"Insider disclosure published",
      explanation:(t.owner_name||"A reporting person")+" disclosed "+action+
        (t.transaction_date?" dated "+String(t.transaction_date).slice(0,10):"")+
        ". Filing publication can occur after the transaction; verify amendments and transaction codes.",
      reportedAt:String(t.published_at).slice(0,10),source:"SEC Form 4",sourceUrl:t.source_url});
  }
  items.sort((a,b)=>b.reportedAt.localeCompare(a.reportedAt)||a.id.localeCompare(b.id));
  return {
    headline:"Public records connected to "+company.ticker,
    summary:"Found "+filings.length+" recent selected company filings, "+facts.length+
      " reported financial measures, and "+transactions.length+
      " imported ownership transactions in this research view. These are different types of SEC records associated with a company, not evidence that events caused one another.",
    findings:items.slice(0,16),
    caveats:["This is a descriptive research summary, not an AI prediction or investment recommendation.",
      "Filings may be delayed, amended, incomplete or absent from the imported window. Review each official filing before making an investment decision.",
      "SEC XBRL facts can cover different fiscal periods and accounting concepts; do not compare figures without matching their periods."]
  };
}
export async function getCompanyIntelligence(ticker,transactions=[],fetcher=secFetch) {
  const index=await cached("official-ticker-index",INDEX_TTL,()=>fetcher("https://www.sec.gov/files/company_tickers.json",{json:true}));
  const company=tickerRecord(index,ticker);
  if(!company) return null;
  const cik=company.cik;
  const [submissions,factsResult] = await Promise.all([
    cached("submissions:"+cik,TTL,()=>fetcher("https://data.sec.gov/submissions/CIK"+cik+".json",{json:true})),
    cached("facts:"+cik,TTL,async()=>extractFinancialFacts(
      await fetcher("https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json",{json:true}),cik))
      .then(value=>({value})).catch(()=>({value:null}))
  ]);
  const filings=extractFilings(submissions,cik);
  const facts=factsResult.value||[];
  const matchedTransactions=transactions.filter(x=>!x.issuer_cik||String(Number(x.issuer_cik))===String(Number(cik)));
  return {company:{...company,name:typeof submissions.name==="string"?submissions.name.slice(0,150):company.name},
    filings,facts,brief:buildEvidenceBrief({company,filings,facts,transactions:matchedTransactions}),
    dataAsOf:new Date().toISOString(),sources:[
      {name:"Official SEC ticker mapping",url:"https://www.sec.gov/files/company_tickers.json"},
      {name:"SEC EDGAR company submissions",url:"https://data.sec.gov/submissions/CIK"+cik+".json"},
      {name:"SEC XBRL company facts",url:"https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json"}
    ],warnings:[...(factsResult.value?[]:["SEC XBRL company facts are unavailable for this company right now."]),
      ...(matchedTransactions.length!==transactions.length?["Some imported ownership records could not be matched to the official issuer CIK and were excluded."]:[])]};
}
