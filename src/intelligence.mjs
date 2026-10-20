/* Public SEC intelligence: deterministic, traceable, read-only. No LLM, trade signals, or broker orders. */
import { secFetch } from "./sec.mjs";
import { createCache } from "./cache.mjs";

const TTL = 15 * 60 * 1000;
const INDEX_TTL = 24 * 60 * 60 * 1000;
const cached = createCache(160);
const isDate = value => typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const canonicalDate = value => {
  if (value instanceof Date) return Number.isNaN(value.getTime())?null:value.toISOString().slice(0,10);
  if (isDate(value)) return value;
  if (typeof value==="string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) return value.slice(0,10);
  return null;
};
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
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
const description = {
  "8-K":"Company current report","8-K/A":"Amended company current report",
  "10-Q":"Quarterly financial report","10-Q/A":"Amended quarterly report",
  "10-K":"Annual financial report","10-K/A":"Amended annual report",
  "10-KT":"Transition period annual report",
  "20-F":"Foreign issuer annual report","20-F/A":"Amended foreign issuer annual report",
  "40-F":"Canadian issuer annual report","40-F/A":"Amended Canadian issuer annual report",
  "6-K":"Foreign issuer current report","6-K/A":"Amended foreign issuer current report",
  "SC 13D":"Beneficial ownership disclosure","SC 13D/A":"Amended beneficial ownership disclosure",
  "SC 13G":"Beneficial ownership disclosure","SC 13G/A":"Amended beneficial ownership disclosure",
  "SCHEDULE 13D":"Beneficial ownership disclosure","SCHEDULE 13D/A":"Amended beneficial ownership disclosure",
  "SCHEDULE 13G":"Beneficial ownership disclosure","SCHEDULE 13G/A":"Amended beneficial ownership disclosure",
  "DEF 14A":"Definitive proxy statement","DEFA14A":"Additional proxy materials",
  "S-1":"Registration statement","S-3":"Shelf registration statement","S-4":"Business combination registration",
  "S-8":"Employee benefit plan registration","424B2":"Prospectus supplement","11-K":"Employee stock plan annual report",
  "SD":"Specialized disclosure report","ARS":"Annual report to security holders"
};
const interesting = new Set(Object.keys(description));
// SEC Form 8-K item numbers (General Instructions B) used for announcement headlines.
export const EIGHT_K_ITEMS = Object.freeze({
  "1.01":"Entry into a material definitive agreement","1.02":"Termination of a material definitive agreement",
  "1.03":"Bankruptcy or receivership","1.04":"Mine safety disclosure","1.05":"Material cybersecurity incident",
  "2.01":"Completion of an acquisition or disposition of assets","2.02":"Results of operations and financial condition",
  "2.03":"Creation of a direct financial obligation","2.04":"Triggering events for a financial obligation",
  "2.05":"Costs associated with exit or disposal activities","2.06":"Material impairments",
  "3.01":"Notice of delisting or listing-rule transfer","3.02":"Unregistered sales of equity securities",
  "3.03":"Material modification to security holders' rights","4.01":"Change in certifying accountant",
  "4.02":"Non-reliance on previously issued financial statements","5.01":"Change in control",
  "5.02":"Departure or appointment of directors or officers","5.03":"Amendments to articles or bylaws",
  "5.04":"Suspension of employee benefit plan trading","5.05":"Code of ethics amendment or waiver",
  "5.06":"Change in shell company status","5.07":"Shareholder vote results","5.08":"Shareholder director nominations",
  "6.01":"ABS informational material","7.01":"Regulation FD disclosure","8.01":"Other events",
  "9.01":"Financial statements and exhibits"
});
export function eightKItems(raw) {
  return String(raw||"").split(",").map(x=>x.trim()).filter(x=>/^\d\.\d{2}$/.test(x)&&EIGHT_K_ITEMS[x]).map(code=>({code,label:EIGHT_K_ITEMS[code]}));
}
export function extractFilings(submissions, cik, limit=15) {
  const recent = submissions?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) return [];
  const output = [];
  for(let i=0;i<Math.min(recent.form.length,2000);i++){
    const form = recent.form[i], accession=recent.accessionNumber?.[i],filed=recent.filingDate?.[i];
    if (!interesting.has(form) || !accessionOk(accession) || !isDate(filed))continue;
    const items = /^8-K/.test(form) ? eightKItems(recent.items?.[i]) : [];
    output.push({
      form,headline:description[form],filedAt:filed,
      reportDate:isDate(recent.reportDate?.[i])?recent.reportDate[i]:null,
      accession,sourceUrl:secFilingUrl(cik,accession,recent.primaryDocument?.[i]),
      ...(items.length?{items}:{}),
      source:"SEC EDGAR submissions"
    });
  }
  return output.sort((a,b)=>b.filedAt.localeCompare(a.filedAt)||b.accession.localeCompare(a.accession)).slice(0,limit);
}

/* Taxonomy support: US GAAP filers (10-K/10-Q) and IFRS foreign issuers (20-F/40-F). */
const ANNUAL_FORMS = new Set(["10-K","10-K/A","10-KT","10-KT/A","20-F","20-F/A","40-F","40-F/A"]);
const QUARTER_FORMS = new Set(["10-Q","10-Q/A"]);
const REPORT_FORMS = new Set([...ANNUAL_FORMS,...QUARTER_FORMS]);
const IFRS = {
  revenue:["Revenue","RevenueFromContractsWithCustomers"],
  netIncome:["ProfitLossAttributableToOwnersOfParent","ProfitLoss"],
  assets:["Assets"],operatingIncome:["ProfitLossFromOperatingActivities"],grossProfit:["GrossProfit"],
  equity:["EquityAttributableToOwnersOfParent","Equity"],cash:["CashAndCashEquivalents"],liabilities:["Liabilities"],
  operatingCashFlow:["CashFlowsFromUsedInOperatingActivities"],
  capex:["PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities","PurchaseOfPropertyPlantAndEquipment"],
  eps:["DilutedEarningsPerShare","BasicEarningsPerShare"]
};
const currencyCode = unit => /^[A-Z]{3}$/.test(unit);
/* Reporting currency: USD whenever reported, otherwise the currency used for core statements. */
export function reportingCurrency(companyFacts) {
  const counts = new Map();
  for (const taxonomy of ["us-gaap","ifrs-full"]) {
    const facts = companyFacts?.facts?.[taxonomy] || {};
    for (const tag of ["Assets","NetIncomeLoss","ProfitLoss","Revenues","Revenue","Equity","StockholdersEquity"]) {
      for (const [unit,rows] of Object.entries(facts[tag]?.units||{})) {
        if (currencyCode(unit) && Array.isArray(rows)) counts.set(unit,(counts.get(unit)||0)+rows.length);
      }
    }
  }
  if (!counts.size || counts.has("USD")) return "USD";
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
}
function conceptRows(companyFacts, gaapTags, ifrsTags, unit) {
  const out = [];
  for (const [taxonomy,tags] of [["us-gaap",gaapTags||[]],["ifrs-full",ifrsTags||[]]]) {
    const facts = companyFacts?.facts?.[taxonomy] || {};
    for (const tag of tags) {
      const rows = facts[tag]?.units?.[unit];
      if (Array.isArray(rows)) out.push({tag,taxonomy,rows:rows.filter(row=>row && typeof row==="object" && Number.isFinite(row.val) &&
        isDate(row.end) && isDate(row.filed) && accessionOk(row.accn) && REPORT_FORMS.has(row.form))});
    }
  }
  return out;
}

const metrics = [
  {id:"revenue",label:"Reported revenue",tags:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet","RevenueFromContractWithCustomerIncludingAssessedTax"]},
  {id:"netIncome",label:"Reported net income",tags:["NetIncomeLoss"]},
  {id:"assets",label:"Reported total assets",tags:["Assets"]},
  {id:"operatingIncome",label:"Reported operating income",tags:["OperatingIncomeLoss"]},
  {id:"grossProfit",label:"Reported gross profit",tags:["GrossProfit"]},
  {id:"equity",label:"Reported shareholders' equity",tags:["StockholdersEquity"]},
  {id:"cash",label:"Reported cash and equivalents",tags:["CashAndCashEquivalentsAtCarryingValue"]},
  {id:"liabilities",label:"Reported total liabilities",tags:["Liabilities"]},
  {id:"operatingCashFlow",label:"Reported operating cash flow",tags:["NetCashProvidedByUsedInOperatingActivities"]}
];
/* What period a reported value covers: a balance at one date, one quarter, a year to date, or a fiscal year. A 10-Q
 * reports both the quarter and the year to date with the same end date; they must never be shown as one figure. */
export function periodTypeOf(row){
  if(!isDate(row?.start))return {periodType:"instant",durationDays:null};
  const length=days(row.start,row.end)+1;
  const periodType=length>=80&&length<=100?"quarter":length>=350&&length<=380?"fiscal-year":length>100&&length<350?"year-to-date":"other";
  return {periodType,durationDays:length};
}
// For one end date: the quarter first (the period a 10-Q is about), then the fiscal year, then a year to date.
const PERIOD_RANK={quarter:0,"fiscal-year":1,"year-to-date":2,other:3,instant:0};
export function extractFinancialFacts(companyFacts,cik) {
  const unit=reportingCurrency(companyFacts);
  return metrics.flatMap(metric=>{
    // Compare candidates across SEC taxonomy alternatives. A stale legacy tag
    // must not override a more recent company filing.
    const options=conceptRows(companyFacts,metric.tags,IFRS[metric.id],unit).flatMap(x=>x.rows).map(row=>({...row,...periodTypeOf(row)}))
      .filter(row=>row.periodType!=="other");
    if(!options.length)return [];
    options.sort((a,b)=>b.end.localeCompare(a.end)||PERIOD_RANK[a.periodType]-PERIOD_RANK[b.periodType]||b.filed.localeCompare(a.filed)||String(b.accn).localeCompare(String(a.accn)));
    const value=options[0];
    return [{
      id:metric.id,label:metric.label,value:value.val,unit,start:isDate(value.start)?value.start:null,
      periodEnd:value.end,periodType:value.periodType,durationDays:value.durationDays,filedAt:value.filed,form:value.form,
      fiscalYear:Number.isInteger(value.fy)?value.fy:null,
      fiscalPeriod:typeof value.fp==="string"?value.fp:null,
      accession:value.accn,concept:conceptOf(companyFacts,metric,value),
      sourceUrl:secFilingUrl(cik,value.accn),source:"SEC XBRL company facts"
    }];
  });
}
/* The taxonomy concept a chosen row came from: the first concept with a row of the same accession, period and value. */
function conceptOf(companyFacts,metric,row){
  for(const [taxonomy,tags] of [["us-gaap",metric.tags||[]],["ifrs-full",IFRS[metric.id]||[]]])
    for(const tag of tags)for(const rows of Object.values(companyFacts?.facts?.[taxonomy]?.[tag]?.units||{}))
      if(Array.isArray(rows)&&rows.some(r=>r.accn===row.accn&&r.end===row.end&&r.val===row.val&&r.start===row.start))return taxonomy+":"+tag;
  return null;
}

/* Insidir Changes, financial facts: the latest reported value of each metric against the same period one year
 * earlier (a quarter against the quarter ending about 365 days before it, a fiscal year against the prior fiscal
 * year, a balance against the balance a year earlier), both taken from the latest filing that reports them. No
 * change is computed between periods of different types or lengths. Deterministic; no model. */
const CHANGE_METRICS=["revenue","netIncome","operatingIncome","cash","assets"];
export function extractFactChanges(companyFacts,cik){
  const unit=reportingCurrency(companyFacts),out=[];
  for(const metric of metrics.filter(m=>CHANGE_METRICS.includes(m.id))){
    const rows=conceptRows(companyFacts,metric.tags,IFRS[metric.id],unit).flatMap(x=>x.rows).map(row=>({...row,...periodTypeOf(row)}))
      .filter(row=>row.periodType==="quarter"||row.periodType==="fiscal-year"||row.periodType==="instant");
    if(!rows.length)continue;
    // The latest filing wins for each period (a restated value replaces the original).
    const byPeriod=new Map();
    for(const r of rows){const k=r.periodType+"|"+(r.start||"")+"|"+r.end;const cur=byPeriod.get(k);if(!cur||r.filed>cur.filed||(r.filed===cur.filed&&String(r.accn)>String(cur.accn)))byPeriod.set(k,r)}
    const periods=[...byPeriod.values()].sort((a,b)=>b.end.localeCompare(a.end)||PERIOD_RANK[a.periodType]-PERIOD_RANK[b.periodType]);
    const current=periods[0];
    const prior=periods.find(r=>r.periodType===current.periodType&&Math.abs(days(r.end,current.end)-365)<=10&&
      (current.durationDays==null||Math.abs(r.durationDays-current.durationDays)<=10));
    if(!prior)continue;
    const view=r=>({value:r.val,start:isDate(r.start)?r.start:null,end:r.end,periodType:r.periodType,durationDays:r.durationDays,form:r.form,filedAt:r.filed,accession:r.accn,sourceUrl:secFilingUrl(cik,r.accn)});
    const change=current.val-prior.val;
    out.push({id:metric.id,label:metric.label.replace(/^Reported /,""),unit,concept:conceptOf(companyFacts,metric,current),current:view(current),prior:view(prior),
      change,changePct:prior.val!==0?change/Math.abs(prior.val):null,
      methodology:"Latest reported "+current.periodType+" against the same "+current.periodType+" one year earlier; change = current − prior, as filed."});
  }
  return out;
}
/* The fact changes for a CIK, from SEC company facts (cached like the company page). */
export async function companyFactChanges(cik,fetcher=secFetch){
  const c=String(Number(cik)).padStart(10,"0");
  return cached("factchanges:"+c,TTL,async()=>extractFactChanges(await fetcher("https://data.sec.gov/api/xbrl/companyfacts/CIK"+c+".json",{json:true}),c));
}

const CAPEX_TAGS=["PaymentsToAcquirePropertyPlantAndEquipment","PaymentsToAcquireProductiveAssets","PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets"];
/* Annual SEC XBRL history. Strictly comparable full-year periods, no synthetic price or return values.
 * Latest filing for the same period wins, and each chart point retains its own SEC accession. */
const annualMetrics=[
 {id:"revenue",label:"Revenue",tags:metrics[0].tags,duration:true},
 {id:"netIncome",label:"Net income",tags:["NetIncomeLoss"],duration:true},
 {id:"operatingIncome",label:"Operating income",tags:["OperatingIncomeLoss"],duration:true},
 {id:"grossProfit",label:"Gross profit",tags:["GrossProfit"],duration:true},
 {id:"operatingCashFlow",label:"Operating cash flow",tags:["NetCashProvidedByUsedInOperatingActivities"],duration:true},
 {id:"capex",label:"Capital expenditure",tags:CAPEX_TAGS,duration:true},
 {id:"assets",label:"Total assets",tags:["Assets"],duration:false},
 {id:"liabilities",label:"Total liabilities",tags:["Liabilities"],duration:false},
 {id:"equity",label:"Shareholders' equity",tags:["StockholdersEquity"],duration:false},
 {id:"cash",label:"Cash and cash equivalents",tags:["CashAndCashEquivalentsAtCarryingValue"],duration:false}
];
export function extractAnnualSeries(companyFacts,cik){
 const unit=reportingCurrency(companyFacts),output={};
 for(const metric of annualMetrics){
  let usable=[],latestPeriod="";
  for(const {rows} of conceptRows(companyFacts,metric.tags,IFRS[metric.id],unit)){
   const filtered=rows.filter(row=>{
     if(!ANNUAL_FORMS.has(row.form))return false;
     if(metric.duration){
       if(!isDate(row.start))return false;
       const length=days(row.start,row.end);
       if(length<300||length>380)return false;
     }
     return true;
   });
   // SEC issuers sometimes change taxonomy concepts. Use the concept with the freshest
   // comparable annual filing, not the first tag with any historical data.
   if(filtered.length){
     const fresh=filtered.reduce((max,row)=>row.end>max?row.end:max,"");
     if(fresh>latestPeriod){usable=filtered;latestPeriod=fresh}
   }
  }
  const periods=new Map();
  for(const row of usable){
    const old=periods.get(row.end);
    if(!old || row.filed>old.filed || row.filed===old.filed&&row.accn>old.accn)periods.set(row.end,row);
  }
  const points=[...periods.values()].sort((a,b)=>a.end.localeCompare(b.end)).slice(-9).map(row=>({
    periodEnd:row.end,start:metric.duration?row.start:null,value:row.val,
    filedAt:row.filed,sourceUrl:secFilingUrl(cik,row.accn),form:row.form
  }));
  output[metric.id]={label:metric.label,unit,points,source:"SEC XBRL annual reports, full fiscal years"};
 }
 return output;
}

/* Trailing twelve months for a flow measure: latest fiscal year + current year-to-date − prior
 * year-to-date, using only matched reported periods. Falls back to the fiscal year itself. */
export function trailingTwelveMonths(rows,{fiscalYearOnly=false}={}){
 const unique=new Map();
 for(const row of rows){
  if(!isDate(row.start)||!isDate(row.end)||row.end<=row.start)continue;
  const key=row.start+":"+row.end,old=unique.get(key);
  if(!old||row.filed>old.filed||row.filed===old.filed&&row.accn>old.accn)unique.set(key,row);
 }
 const periods=[...unique.values()].map(row=>({...row,length:days(row.start,row.end)}));
 const annual=periods.filter(row=>ANNUAL_FORMS.has(row.form)&&row.length>=350&&row.length<=380)
  .sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed))[0];
 if(!annual)return null;
 const ytd=periods.filter(row=>QUARTER_FORMS.has(row.form)&&row.end>annual.end&&Math.abs(days(annual.end,row.start)-1)<=7&&row.length>=80&&row.length<=300)
  .sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed))[0];
 const prior=ytd&&periods.filter(row=>Math.abs(days(annual.start,row.start))<=7&&Math.abs(row.length-ytd.length)<=7&&row.end<annual.end)
  .sort((a,b)=>b.filed.localeCompare(a.filed))[0];
 if(fiscalYearOnly||!ytd||!prior)return {value:annual.val,periodStart:annual.start,periodEnd:annual.end,basis:"fiscal-year",rows:[annual]};
 const start=new Date(Date.parse(prior.end)+86400000).toISOString().slice(0,10);
 return {value:annual.val+ytd.val-prior.val,periodStart:start,periodEnd:ytd.end,basis:"ttm",rows:[annual,ytd,prior]};
}
const ttmMetrics=[
 {id:"revenue",label:"Revenue",tags:metrics[0].tags},
 {id:"netIncome",label:"Net income",tags:["NetIncomeLoss"]},
 {id:"operatingIncome",label:"Operating income",tags:["OperatingIncomeLoss"]},
 {id:"grossProfit",label:"Gross profit",tags:["GrossProfit"]},
 {id:"operatingCashFlow",label:"Operating cash flow",tags:["NetCashProvidedByUsedInOperatingActivities"]},
 {id:"capex",label:"Capital expenditure",tags:CAPEX_TAGS},
 {id:"eps",label:"Diluted EPS",tags:["EarningsPerShareDiluted","EarningsPerShareBasic"],perShare:true}
];
export function extractTtm(companyFacts,cik){
 const currency=reportingCurrency(companyFacts),output={},results=[];
 for(const metric of ttmMetrics){
  let best=null;
  for(const {tag,rows} of conceptRows(companyFacts,metric.tags,IFRS[metric.id],metric.perShare?currency+"/shares":currency)){
   // Per-share amounts do not add across periods (the share count changes), so EPS is the fiscal year's as reported.
   const result=trailingTwelveMonths(rows,{fiscalYearOnly:!!metric.perShare});
   if(result&&(!best||result.periodEnd>best.periodEnd))best={...result,tag};
  }
  if(!best)continue;
  results.push([metric,best]);
 }
 // A concept a company stopped reporting years ago is not a trailing figure.
 const freshest=results.reduce((max,[,best])=>best.periodEnd>max?best.periodEnd:max,"");
 for(const [metric,best] of results){
  if(days(best.periodEnd,freshest)>400)continue;
  output[metric.id]={label:metric.label,value:metric.perShare?Math.round(best.value*10000)/10000:best.value,
   unit:metric.perShare?currency+"/share":currency,periodStart:best.periodStart,periodEnd:best.periodEnd,basis:best.basis,
   concept:best.tag,sources:[...new Set(best.rows.map(row=>secFilingUrl(cik,row.accn)).filter(Boolean))]};
 }
 return output;
}

/* Latest balance-sheet values that enterprise value needs, all from one reporting date. */
function instantAt(companyFacts,tags,ifrsTags,unit,date){
 for(const {rows} of conceptRows(companyFacts,tags,ifrsTags,unit)){
  const found=rows.filter(row=>!row.start&&row.end===date).sort((a,b)=>b.filed.localeCompare(a.filed))[0];
  if(found)return found;
 }
 return null;
}
export function extractBalance(companyFacts,cik){
 const unit=reportingCurrency(companyFacts);
 const anchors=conceptRows(companyFacts,["CashAndCashEquivalentsAtCarryingValue","Assets"],["CashAndCashEquivalents","Assets"],unit)
  .flatMap(x=>x.rows).filter(row=>!row.start);
 if(!anchors.length)return null;
 const asOf=anchors.reduce((max,row)=>row.end>max?row.end:max,"");
 const pick=(gaap,ifrs)=>instantAt(companyFacts,gaap,ifrs,unit,asOf);
 const cash=pick(["CashAndCashEquivalentsAtCarryingValue","CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],["CashAndCashEquivalents"]);
 const combined=pick(["CashCashEquivalentsAndShortTermInvestments"],[]);
 const shortTerm=pick(["MarketableSecuritiesCurrent","ShortTermInvestments","DebtSecuritiesCurrent","AvailableForSaleSecuritiesDebtSecuritiesCurrent"],["CurrentInvestments","OtherCurrentFinancialAssets"]);
 const totalLongTerm=pick(["LongTermDebt"],[]);
 const noncurrent=pick(["LongTermDebtNoncurrent","LongTermDebtAndCapitalLeaseObligations"],["NoncurrentPortionOfNoncurrentBorrowings","NoncurrentBorrowings"]);
 const current=pick(["LongTermDebtCurrent","DebtCurrent"],["CurrentPortionOfNoncurrentBorrowings","CurrentBorrowings"]);
 const paper=pick(["CommercialPaper"],[]);
 const shortBorrowings=pick(["ShortTermBorrowings"],["ShorttermBorrowings"]);
 const cashValue=combined?combined.val:(cash?.val??null)!=null?(cash.val+(shortTerm?.val||0)):null;
 const debtParts=totalLongTerm?[totalLongTerm,paper,shortBorrowings]:[noncurrent,current,paper,shortBorrowings];
 const debtRows=debtParts.filter(Boolean);
 return {asOf,currency:unit,
  cashAndShortTermInvestments:cashValue,
  cash:cash?.val??null,
  totalDebt:debtRows.length?debtRows.reduce((sum,row)=>sum+row.val,0):null,
  sources:[...new Set([cash,combined,shortTerm,...debtRows].filter(Boolean).map(row=>secFilingUrl(cik,row.accn)).filter(Boolean))]};
}

/* Shares outstanding: cover-page count (dei) or balance-sheet count, whichever is newer.
 * For multi-class issuers without either, diluted shares implied by TTM net income ÷ EPS. */
export function extractShares(companyFacts,cik,ttm={}){
 const candidates=[];
 for(const [taxonomy,tag] of [["dei","EntityCommonStockSharesOutstanding"],["us-gaap","CommonStockSharesOutstanding"],["ifrs-full","NumberOfSharesOutstanding"]]){
  const rows=companyFacts?.facts?.[taxonomy]?.[tag]?.units?.shares;
  if(!Array.isArray(rows))continue;
  const usable=rows.filter(row=>row&&Number.isFinite(row.val)&&row.val>0&&isDate(row.end)&&accessionOk(row.accn));
  if(!usable.length)continue;
  const latest=usable.reduce((max,row)=>row.end>max?row.end:max,"");
  // Several classes reported for the same date by one filing are summed (e.g. Class A + Class B).
  const sameDate=usable.filter(row=>row.end===latest);
  const accn=sameDate.sort((a,b)=>b.filed.localeCompare(a.filed))[0].accn;
  const values=[...new Set(sameDate.filter(row=>row.accn===accn).map(row=>row.val))];
  candidates.push({value:values.reduce((s,v)=>s+v,0),asOf:latest,concept:tag,method:"reported",sourceUrl:secFilingUrl(cik,accn)});
 }
 candidates.sort((a,b)=>b.asOf.localeCompare(a.asOf));
 if(candidates[0])return candidates[0];
 const ni=ttm.netIncome,eps=ttm.eps;
 if(ni&&eps&&eps.value>0&&ni.value>0&&ni.periodEnd===eps.periodEnd){
  return {value:Math.round(ni.value/eps.value),asOf:ni.periodEnd,concept:"NetIncomeLoss/EarningsPerShareDiluted",method:"implied",sourceUrl:ni.sources?.[0]||null};
 }
 return null;
}

const fiscalMonths=["January","February","March","April","May","June","July","August","September","October","November","December"];
const titleCase=value=>String(value||"").toLowerCase().replace(/(^|[\s-])([a-z])/g,(m,a,b)=>a+b.toUpperCase());
export function extractSecProfile(submissions,ticker){
 if(!submissions||typeof submissions!=="object")return null;
 const tickers=Array.isArray(submissions.tickers)?submissions.tickers.map(String):[];
 const exchanges=Array.isArray(submissions.exchanges)?submissions.exchanges.map(x=>x==null?null:String(x)):[];
 const position=tickers.findIndex(x=>x.toUpperCase()===String(ticker||"").toUpperCase());
 const exchange=exchanges[position>=0?position:0]||null;
 const address=submissions.addresses?.business||submissions.addresses?.mailing||{};
 const foreign=Boolean(address.isForeignLocation)||Boolean(address.country);
 const city=address.city?titleCase(address.city):null;
 const region=foreign?(address.country||address.stateOrCountryDescription||null):(address.stateOrCountry||null);
 const fye=/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(String(submissions.fiscalYearEnd||""))?submissions.fiscalYearEnd:null;
 let website=null;
 for(const candidate of [submissions.website,submissions.investorWebsite]){
  if(website||typeof candidate!=="string"||!candidate.trim())continue;
  try{const u=new URL(/^https?:\/\//i.test(candidate)?candidate:"https://"+candidate.trim());if(/^https?:$/.test(u.protocol)&&u.hostname.includes("."))website=u.href}catch{}
 }
 return {
  exchange:exchange?(/^nasdaq$/i.test(exchange)?"NASDAQ":exchange.toUpperCase()):null,
  tickers:tickers.slice(0,8),sic:submissions.sic||null,industry:submissions.sicDescription||null,
  filerCategory:submissions.category||null,entityType:submissions.entityType||null,
  fiscalYearEnd:fye?fiscalMonths[Number(fye.slice(0,2))-1]+" "+Number(fye.slice(2)):null,
  stateOfIncorporation:submissions.stateOfIncorporationDescription||submissions.stateOfIncorporation||null,
  headquarters:city?{city,region,foreign,label:city+(region?", "+(foreign?titleCase(region):region):"")}:null,
  website,phone:typeof submissions.phone==="string"?submissions.phone.slice(0,30):null,
  formerNames:Array.isArray(submissions.formerNames)?submissions.formerNames.slice(0,5).map(x=>({name:String(x?.name||""),to:canonicalDate(x?.to)})).filter(x=>x.name):[]
 };
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
    const filed=canonicalDate(t.published_at),tradeDate=canonicalDate(t.transaction_date);
    if (!filed) continue;
    items.push({id:"ownership:"+t.id,kind:"insider_disclosure",
      title:"Insider disclosure published",
      explanation:(t.owner_name||"A reporting person")+" disclosed "+action+
        (tradeDate?" dated "+tradeDate:"")+
        ". Filing publication can occur after the transaction; verify amendments and transaction codes.",
      reportedAt:filed,source:"SEC Form 4",sourceUrl:t.source_url});
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

/* Official ticker → CIK mapping and company submissions, shared by every company endpoint. */
export function tickerIndex(fetcher=secFetch){
  return cached("official-ticker-index",INDEX_TTL,()=>fetcher("https://www.sec.gov/files/company_tickers.json",{json:true}));
}
export async function resolveCompany(ticker,fetcher=secFetch){
  const company=tickerRecord(await tickerIndex(fetcher),ticker);
  if(!company)return null;
  const submissions=await cached("submissions:"+company.cik,TTL,()=>fetcher("https://data.sec.gov/submissions/CIK"+company.cik+".json",{json:true}));
  return {company:{...company,name:typeof submissions?.name==="string"?submissions.name.slice(0,150):company.name},submissions};
}

export async function getCompanyIntelligence(ticker,transactions=[],fetcher=secFetch) {
  const [resolved,factsResult]=await Promise.all([
    resolveCompany(ticker,fetcher),
    tickerIndex(fetcher).then(index=>{
      const record=tickerRecord(index,ticker);
      if(!record)return {value:null};
      const cik=record.cik;
      return cached("facts:"+cik,TTL,async()=>{
        const raw=await fetcher("https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json",{json:true});
        const ttm=extractTtm(raw,cik);
        return {latest:extractFinancialFacts(raw,cik),history:extractAnnualSeries(raw,cik),ttm,
          balance:extractBalance(raw,cik),shares:extractShares(raw,cik,ttm),currency:reportingCurrency(raw)};
      }).then(value=>({value})).catch(()=>({value:null}));
    })
  ]);
  if(!resolved) return null;
  const {company,submissions}=resolved,cik=company.cik;
  const filings=extractFilings(submissions,cik,60);
  const facts=factsResult.value?.latest||[];
  const financialHistory=factsResult.value?.history||{};
  const matchedTransactions=transactions.filter(x=>!x.issuer_cik||String(Number(x.issuer_cik))===String(Number(cik)));
  return {company,profile:extractSecProfile(submissions,ticker),
    filings,facts,financialHistory,
    ttm:factsResult.value?.ttm||{},balance:factsResult.value?.balance||null,shares:factsResult.value?.shares||null,
    currency:factsResult.value?.currency||"USD",
    brief:buildEvidenceBrief({company,filings,facts,transactions:matchedTransactions}),
    dataAsOf:new Date().toISOString(),sources:[
      {name:"Official SEC ticker mapping",url:"https://www.sec.gov/files/company_tickers.json"},
      {name:"SEC EDGAR company submissions",url:"https://data.sec.gov/submissions/CIK"+cik+".json"},
      {name:"SEC XBRL company facts",url:"https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json"}
    ],warnings:[...(factsResult.value?[]:["SEC XBRL company facts are unavailable for this company right now."]),
      ...(matchedTransactions.length!==transactions.length?["Some imported ownership records could not be matched to the official issuer CIK and were excluded."]:[])]};
}
