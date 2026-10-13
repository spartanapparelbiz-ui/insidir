/* Insidir universal company finance report.
 * Uses real, verified SEC financial facts and Form 4 records only. Never generates stock quotes.
 */
(()=>{"use strict";
const $=id=>document.getElementById(id);
const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const symbol=x=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(x??"").toUpperCase())?String(x).toUpperCase():"";
const date=x=>{if(!x)return "Not reported";const d=new Date(x);return Number.isNaN(d.getTime())?"Not reported":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d)};
const usd=x=>{const n=Number(x);if(x==null||!Number.isFinite(n))return "—";return (n<0?"−":"")+"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(Math.abs(n));};
const exactUsd=x=>{const n=Number(x);return x==null||!Number.isFinite(n)?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n)};
const number=x=>Number.isFinite(Number(x))?new Intl.NumberFormat("en-US").format(Number(x)):"—";
const secLink=x=>{try{const u=new URL(String(x));return u.protocol==="https:"&&(u.hostname==="www.sec.gov"||u.hostname==="sec.gov")&&!u.username&&!u.password?u.href:""}catch{return ""}};
const anchor=(url,label)=>{const href=secLink(url);return href?'<a href="'+escape(href)+'" target="_blank" rel="noopener noreferrer">'+escape(label)+' ↗</a>':'<span class="c11-muted">Source unavailable</span>'};
const media=window.InsidirMedia;
const empty=s=>'<p class="c11-empty">'+escape(s)+'</p>';
const setText=(id,s)=>{if($(id))$(id).textContent=s};
const setHTML=(id,s)=>{if($(id))$(id).innerHTML=s};
const reportHref=t=>"company.html?ticker="+encodeURIComponent(t);
let activeTicker="",detail=null,transactions=[],imports=[],chartMetric="revenue",chartRange=5,filingFilter="all",insiderFilter="all",watchlistState=null,runId=0;
async function get(path,options={}){
 const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},...options});
 let data;try{data=await r.json()}catch{throw Error("The research service returned an unreadable response.")};
 if(!r.ok){const e=Error(data.error||"Research service unavailable");e.status=r.status;throw e}
 return data;
}
function annual(id){return Array.isArray(detail?.financialHistory?.[id]?.points)?detail.financialHistory[id].points.filter(p=>Number.isFinite(Number(p.value))&&p.periodEnd):[]}
function latest(id){const x=detail?.facts?.find(f=>f.id===id);if(x&&Number.isFinite(Number(x.value)))return x;const p=annual(id).at(-1);return p?{id,value:p.value,periodEnd:p.periodEnd,sourceUrl:p.sourceUrl,form:p.form,label:detail?.financialHistory?.[id]?.label||id}:null}
function annualCompare(id){const xs=annual(id);return xs.length?xs.at(-1):null}
function hydrate(id){media?.hydrate($(id))}
function activateTab(id,track=true){
 const dest=$(id);if(!dest)return;
 for(const el of document.querySelectorAll(".c11-tab-panel"))el.hidden=el!==dest;
 for(const button of document.querySelectorAll("[data-company-tab]")){
  const on=button.dataset.companyTab===id;button.classList.toggle("is-active",on);button.setAttribute("aria-selected",String(on));
 }
 if(track&&activeTicker)history.replaceState(null,"",reportHref(activeTicker)+"#"+id);
}
function chart(){
 const p=annual(chartMetric),xs=p.slice(-chartRange),descriptor=detail?.financialHistory?.[chartMetric];
 const head=xs.at(-1),prev=xs.at(-2);
 setText("c11-period-caption","· "+(head?date(xs[0].periodEnd)+" to "+date(head.periodEnd):"No annual history"));
 setText("c11-chart-value",head?usd(head.value):"—");
 setText("c11-chart-period",head?"Fiscal year ended "+date(head.periodEnd):"No reported period");
 if(head&&prev&&Number(prev.value)!==0){
  const growth=(Number(head.value)-Number(prev.value))/Math.abs(Number(prev.value))*100;
  setText("c11-chart-change",(growth>=0?"+":"")+growth.toFixed(1)+"% vs. previous full fiscal year");
  $("c11-chart-change").style.color=growth>=0?"#30d3a7":"#ff9898";
 }else setText("c11-chart-change",head?"Official annual SEC report":"No comparable annual data");
 $("c11-chart-source").href=secLink(head?.sourceUrl)||"https://www.sec.gov/edgar/search/";
 for(const b of document.querySelectorAll("[data-metric]")){const on=b.dataset.metric===chartMetric;b.classList.toggle("is-active",on);b.setAttribute("aria-pressed",String(on))}
 for(const b of document.querySelectorAll("[data-range]")){const on=Number(b.dataset.range)===chartRange;b.classList.toggle("is-active",on);b.setAttribute("aria-pressed",String(on))}
 if(!xs.length){setHTML("c11-chart",empty("Comparable annual "+(descriptor?.label||"financial")+" information is not reported in the available SEC 10-K filings. No chart values have been invented."));return}
 const W=800,H=230,LEFT=68,RIGHT=65,TOP=17,BOTTOM=31,values=xs.map(x=>Number(x.value));
 let lo=Math.min(0,...values),hi=Math.max(0,...values),span=hi-lo;
 if(span===0){hi+=1;lo-=1;span=hi-lo}
 const padding=span*.10;lo-=padding;hi+=padding;span=hi-lo;
 const x=i=>LEFT+(xs.length===1?0.5:i/(xs.length-1))*(W-LEFT-RIGHT);
 const y=n=>TOP+(hi-n)/span*(H-TOP-BOTTOM);
 const points=xs.map((row,i)=>[x(i),y(Number(row.value))]);
 const zero=y(0),line=points.map((pt,i)=>(i?"L":"M")+pt[0].toFixed(1)+" "+pt[1].toFixed(1)).join(" ");
 const fill="M"+points[0][0]+" "+zero+" L"+points.map(p=>p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L")+" L"+points.at(-1)[0]+" "+zero+" Z";
 const ticks=[0,.25,.5,.75,1].map(a=>{let val=lo+(hi-lo)*a,pos=y(val);return '<line x1="'+LEFT+'" y1="'+pos+'" x2="'+(W-RIGHT)+'" y2="'+pos+'" class="c11-gridline"/><text x="'+(LEFT-11)+'" y="'+(pos+4)+'" class="c11-axis" text-anchor="end">'+escape(usd(val))+'</text>'}).join("");
 const circles=points.map((pt,i)=>'<circle class="c11-plot-circle" cx="'+pt[0]+'" cy="'+pt[1]+'" r="4.5" tabindex="0" aria-label="'+escape(date(xs[i].periodEnd)+": "+usd(xs[i].value))+'"><title>'+escape(descriptor?.label||chartMetric)+" · FY ended "+escape(date(xs[i].periodEnd))+" · "+escape(usd(xs[i].value))+'</title></circle>').join("");
 const labels=points.map((pt,i)=>'<text x="'+pt[0]+'" y="'+(H-6)+'" class="c11-axis" text-anchor="middle">'+escape(xs[i].periodEnd.slice(0,4))+'</text>').join("");
 const svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+escape((descriptor?.label||chartMetric)+" annual SEC financial history from "+date(xs[0].periodEnd)+" to "+date(head.periodEnd))+'" preserveAspectRatio="none"><defs><linearGradient id="c11-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#25d4a5" stop-opacity=".26"/><stop offset="100%" stop-color="#25d4a5" stop-opacity="0"/></linearGradient></defs>'+ticks+'<line x1="'+LEFT+'" y1="'+zero+'" x2="'+(W-RIGHT)+'" y2="'+zero+'" class="c11-zero"/><path d="'+fill+'" fill="url(#c11-fill)"/><path d="'+line+'" class="c11-plot-line"/>'+circles+labels+'</svg>';
 setHTML("c11-chart",svg);
}
function renderSnapshot(){
 const ids=[["revenue","Revenue"],["netIncome","Net income"],["operatingIncome","Operating income"],["operatingCashFlow","Operating cash flow"],["assets","Total assets"],["equity","Shareholders' equity"]];
 setHTML("c11-snapshot-rows",ids.map(([id,label])=>'<div class="c11-snapshot__row"><span>'+escape(label)+'</span><strong>'+usd(latest(id)?.value)+'</strong></div>').join(""));
 const asOf=detail?.dataAsOf?date(detail.dataAsOf):"Reported SEC measures";
 setText("c11-snapshot-asof","SEC submissions · Retrieved "+asOf);
}
function renderKPIs(){
 const ids=[["revenue","Revenue"],["netIncome","Net income"],["operatingIncome","Operating income"],["operatingCashFlow","Operating cash flow"],["assets","Total assets"],["equity","Shareholders' equity"]];
 setHTML("c11-kpis",ids.map(([id,label])=>{
  const f=latest(id),period=f?.start?date(f.start)+" – "+date(f.periodEnd):f?.periodEnd?"Ended "+date(f.periodEnd):"Not reported";
  return '<article class="c11-kpi"><span>'+escape(label)+'</span><strong>'+usd(f?.value)+'</strong><small>'+escape(period)+'</small>'+(f?anchor(f.sourceUrl,"Verify filing"):"")+'</article>';
 }).join(""));
}
function renderRevenueBars(){
 const xs=annual("revenue").slice(-6);
 if(!xs.length){setHTML("c11-revenue-graph",empty("Revenue history isn't available as comparable full-year SEC facts for this issuer."));return}
 const max=Math.max(1,...xs.map(x=>Math.max(0,Number(x.value))));
 setHTML("c11-revenue-graph",'<div class="c11-bar-chart" role="img" aria-label="Annual SEC reported revenue by fiscal year">'+xs.map(p=>{
 const height=Math.max(2,Number(p.value)>0?Math.min(100,Number(p.value)/max*100):2);
 return '<div class="c11-bar" title="Year ended '+escape(date(p.periodEnd))+': '+escape(usd(p.value))+'"><span class="c11-bar__value">'+escape(usd(p.value))+'</span><div class="c11-bar__track"><div class="c11-bar__fill" style="height:'+height+'%"></div></div><span class="c11-bar__period">'+escape(p.periodEnd.slice(0,4))+'</span></div>';
 }).join("")+'</div><p class="c11-bar-footnote">Fiscal-year revenue, SEC 10-K. Period-end dates shown; no extrapolation.</p>');
}
function renderRatios(){
 const rev=annualCompare("revenue"),end=rev?.periodEnd;const r=Number(rev?.value);
 if(!end||!(r>0)){setHTML("c11-ratios",empty("Profitability ratios require positive annual revenue and same-period SEC operating income, net income or gross profit."));return}
 const definitions=[["Gross margin","grossProfit"],["Operating margin","operatingIncome"],["Net margin","netIncome"]],result=[];
 for(const [label,id] of definitions){
  const p=annual(id).find(x=>x.periodEnd===end);if(!p)continue;
  const percent=Number(p.value)/r*100;
  if(!Number.isFinite(percent))continue;
  result.push('<div class="c11-ratio"><div><span>'+escape(label)+'</span><strong>'+escape(percent.toFixed(1))+'%</strong></div><div class="c11-ratio__track"><span style="width:'+Math.max(0,Math.min(100,percent))+'%"></span></div></div>');
 }
 setHTML("c11-ratios",result.length?result.join("")+'<p class="c11-bar-footnote">Derived only from matched SEC full-year fiscal period ending '+escape(date(end))+'. Negative margins have zero-length bars.</p>':empty("Same-period annual profitability measures are unavailable for this company."));
}
function forms(){return detail?.filings?.length?detail.filings:(imports||[]).map(f=>({form:f.form_type||"4",headline:f.issuer_name||"SEC ownership disclosure",filedAt:f.published_at,reportDate:f.period_of_report||null,sourceUrl:f.source_url,isAmendment:Boolean(f.is_amendment)}))}
function renderFilingSummary(){
 const a=forms(),counts=[a.filter(x=>/^10-K/.test(x.form)).length,a.filter(x=>/^10-Q/.test(x.form)).length,a.filter(x=>!/^10-[KQ]/.test(x.form)).length],total=a.length;
 if(!total){setHTML("c11-filings-summary",empty("No selected SEC company submissions were returned."));return}
 const pct=counts.map(x=>Math.round(x/total*100)),pA=pct[0]+"%",pB=(pct[0]+pct[1])+"%";
 setHTML("c11-filings-summary",'<div class="c11-form-donut" role="img" aria-label="'+escape(total+' selected filings: '+counts.join(', '))+'" style="--part-a:'+pA+';--part-b:'+pB+'"><strong>'+number(total)+'</strong></div><div class="c11-donut-legend">'+[["Annual reports",counts[0],"#77aaf4"],["Quarterly reports",counts[1],"#24cba0"],["Other filings",counts[2],"#e3a766"]].map(([label,n,color])=>'<div><span><i class="c11-dot" style="--dot:'+color+'"></i>'+escape(label)+'</span><b>'+n+'</b></div>').join("")+'</div><p class="c11-bar-footnote">Counts cover the selected SEC data returned, not all historical filings.</p>');
}
function renderEvents(){
 const rows=forms().slice(0,4);
 setHTML("c11-latest-events",rows.length?rows.map(f=>'<div class="c11-list-row"><div class="c11-list-row__main"><span class="c11-form-tag">'+escape(f.form||"SEC")+'</span><div><strong>'+escape(f.headline||"Official SEC disclosure")+'</strong><small>Filed '+escape(date(f.filedAt))+'</small></div></div><span class="c11-list-row__side">'+anchor(f.sourceUrl,"SEC")+'</span></div>').join(""):empty("Recent SEC submissions are not available for this issuer."));
}
function summarizeOwners(){
 const map=new Map();
 for(const r of transactions){
  const name=String(r.owner_name||"").trim();if(!name)continue;
  const key=r.owner_cik?"cik:"+r.owner_cik:"name:"+name.toUpperCase();
  const prev=map.get(key)||{name,ticker:activeTicker,filings:0,cik:r.owner_cik||"",last:r.transaction_date||r.published_at};
  prev.filings+=1;if(String(r.transaction_date||"")>String(prev.last||""))prev.last=r.transaction_date;
  map.set(key,prev);
 }
 return [...map.values()].sort((a,b)=>b.filings-a.filings||a.name.localeCompare(b.name));
}
function renderOwnerPreview(){
 const rows=summarizeOwners().slice(0,4);
 setHTML("c11-owner-preview",rows.length?rows.map(p=>'<div class="c11-list-row"><div class="c11-list-row__main">'+(media?.portrait(p.name,activeTicker,"sm")||"")+'<div><strong>'+escape(p.name)+'</strong><small>'+p.filings+' transaction'+(p.filings===1?'':'s')+' in retrieved window</small></div></div><a href="people.html?q='+encodeURIComponent(p.name)+'">Research ↗</a></div>').join(""):empty("No reporting-person records in the current imported Form 4 window."));
 hydrate("c11-owner-preview");
}
function renderInsiderPreview(){
 const rows=transactions.slice(0,4);
 setHTML("c11-insider-preview",rows.length?rows.map(r=>{
  const type=r.category==="reported_purchase"?"Reported purchase":r.category==="reported_sale"?"Reported sale":"Other transaction";
  return '<div class="c11-list-row"><div class="c11-list-row__main">'+(media?.portrait(r.owner_name,activeTicker,"sm")||"")+'<div><strong>'+escape(r.owner_name||"Reporting person")+'</strong><small>'+escape(type)+' · '+escape(date(r.transaction_date))+'</small></div></div><span class="c11-list-row__side">'+escape(usd(r.estimated_value))+'</span></div>';
 }).join(""):empty("No imported ownership transactions for this company."));
 hydrate("c11-insider-preview");
}
function renderFilingRows(){
 const all=forms(),filtered=all.filter(f=>filingFilter==="all"?true:filingFilter==="other"?!/^(10-K|10-Q|8-K)/.test(f.form):String(f.form||"").startsWith(filingFilter));
 setText("cv-filing-count",String(all.length));
 document.querySelectorAll("[data-form-filter]").forEach(b=>b.classList.toggle("is-active",b.dataset.formFilter===filingFilter));
 setHTML("cv-filings-list",filtered.length?filtered.map(f=>'<tr><td><span class="c11-form-tag">'+escape(f.form||"SEC")+'</span></td><td>'+escape(f.headline||"Public company disclosure")+'</td><td>'+escape(date(f.reportDate))+'</td><td class="c11-num">'+escape(date(f.filedAt))+'</td><td>'+anchor(f.sourceUrl,"View original")+'</td></tr>').join(""):'<tr><td colspan="5">'+empty("No records match this form filter in the available SEC data.")+'</td></tr>');
}
function renderTransactionRows(){
 document.querySelectorAll("[data-insider-filter]").forEach(b=>b.classList.toggle("is-active",b.dataset.insiderFilter===insiderFilter));
 setText("cv-transaction-count",String(transactions.length));
 const xs=transactions.filter(x=>insiderFilter==="all"||x.category===insiderFilter);
 setHTML("cv-transactions-list",xs.length?xs.map(r=>{
  const kind=r.category==="reported_purchase"?"Purchase":r.category==="reported_sale"?"Sale":"Other";
  return '<tr><td><div class="ins-person-cell">'+(media?.portrait(r.owner_name,activeTicker,"sm")||"")+'<span class="ins-person-cell__name">'+escape(r.owner_name||"Reporting person")+'</span></div></td><td><span class="'+(r.category==="reported_purchase"?"c11-tag--buy":r.category==="reported_sale"?"c11-tag--sell":"")+'">'+escape(kind)+'</span></td><td class="c11-num">'+escape(date(r.transaction_date))+'</td><td class="c11-num">'+escape(usd(r.estimated_value))+'</td><td>'+anchor(r.source_url,"SEC Form 4")+'</td></tr>';
 }).join(""):'<tr><td colspan="5">'+empty("No imported transactions match this filter.")+'</td></tr>');
 hydrate("cv-transactions-list");
}
function renderOwnerList(){
 const rows=summarizeOwners();
 setHTML("c11-owner-list",rows.length?rows.map(x=>'<article class="c11-owner">'+(media?.portrait(x.name,activeTicker,"lg")||"")+'<div><h3>'+escape(x.name)+'</h3><p>'+x.filings+' disclosed transaction'+(x.filings===1?'':'s')+' in the current import · latest '+escape(date(x.last))+'</p><a href="people.html?q='+encodeURIComponent(x.name)+'">Search this reporting person ↗</a></div></article>').join(""):empty("The current SEC import has no reporting-person transactions for this company."));
 hydrate("c11-owner-list");
}
function renderFinancialTable(){
 const defs=[["Revenue","revenue"],["Gross profit","grossProfit"],["Operating income","operatingIncome"],["Net income","netIncome"],["Operating cash flow","operatingCashFlow"],["Capital expenditures","capex"],["Total assets","assets"],["Total liabilities","liabilities"],["Shareholders' equity","equity"],["Cash & cash equivalents","cash"]];
 let periods=annual("revenue").map(p=>p.periodEnd);
 if(!periods.length)periods=[...new Set(defs.flatMap(([,id])=>annual(id).map(x=>x.periodEnd)))].sort();
 periods=periods.slice(-6).reverse();
 if(!periods.length){setHTML("c11-history-table",empty("No comparable annual company financial statements are available from the SEC XBRL source."));return}
 let out='<table class="c11-table"><thead><tr><th>FULL FISCAL YEAR</th>'+periods.map(p=>'<th>'+escape(date(p))+'</th>').join("")+'</tr></thead><tbody>';
 for(const [label,id] of defs){
  const xs=annual(id);
  if(!xs.length)continue;
  out+='<tr><td>'+escape(label)+'</td>'+periods.map(end=>{
    const row=xs.find(p=>p.periodEnd===end);return '<td class="c11-num">'+(row?'<span title="Filed '+escape(date(row.filedAt))+'">'+escape(usd(row.value))+'</span>':'—')+'</td>';
  }).join("")+'</tr>';
 }
 out+='</tbody></table><p class="c11-bar-footnote">Only official full-year SEC 10-K measurements appear. The date is each fiscal period end; no forward estimates or fake data.</p>';
 setHTML("c11-history-table",out);
}
function renderFacts(){
 const facts=Array.isArray(detail?.facts)?detail.facts:[];
 setText("cv-fact-count",facts.length+" current SEC measures");
 setHTML("cv-facts-grid",facts.length?facts.map(f=>'<div class="c11-fact"><span>'+escape(f.label||f.id)+'</span><strong>'+escape(usd(f.value))+'</strong><small>Period '+escape(f.start?date(f.start)+" – ":"")+escape(date(f.periodEnd))+' · '+escape(f.form||"SEC report")+'</small><small>Filed '+escape(date(f.filedAt))+'</small>'+anchor(f.sourceUrl,"Original record")+'</div>').join(""):empty("No current SEC XBRL financial measures were returned."));
}
function renderAll(){
 renderSnapshot();renderKPIs();chart();renderRevenueBars();renderRatios();renderFilingSummary();renderEvents();
 renderInsiderPreview();renderOwnerPreview();renderFilingRows();renderTransactionRows();renderOwnerList();renderFinancialTable();renderFacts();
}
async function fetchWatchlist(t){
 const b=$("cv-follow");if(!b)return;
 b.hidden=false;b.disabled=false;watchlistState=null;b.textContent="+ Add to watchlist";
 try{
  const d=await get("/v1/me/watchlist");
  if(activeTicker!==t)return;
  watchlistState=(d.items||[]).some(x=>symbol(x.ticker)===t);
  b.textContent=watchlistState?"✓ Following company":"+ Add to watchlist";
 }catch(e){if(e.status===401){watchlistState="signed_out";b.textContent="+ Sign in to save"}else{watchlistState="error";b.textContent="+ Add to watchlist"}}
}
async function load(t){
 const validated=symbol(t);if(!validated){setText("cv-status","Enter a valid public company ticker.");return}
 const seq=++runId;activeTicker=validated;detail=null;transactions=[];imports=[];chartMetric="revenue";chartRange=5;filingFilter="all";insiderFilter="all";
 history.replaceState(null,"",reportHref(validated));
 setText("cv-bread-ticker",validated);setText("c11-ticker-label",validated);setText("cv-name",validated);
 setText("cv-details","Looking up official SEC records…");
 setText("cv-description","Retrieving SEC company disclosures, annual financial measures and imported reporting-person transactions.");
 setText("cv-status","Loading "+validated+" from the SEC and the Insidir filing index…");
 $("cv-symbol").innerHTML=media?.logo(validated,"lg")||"";hydrate("cv-symbol");
 $("cv-ticker").value=validated;$("cv-follow").hidden=false;
 setText("c11-snapshot-asof","Loading financial fundamentals…");
 setHTML("c11-chart",empty("Loading annual SEC filings…"));
 setHTML("c11-kpis",empty("Loading official company data…"));
 setHTML("c11-owner-list",empty("Loading SEC reporting people…"));
 activateTab("cv-summary",false);
 $("cv-research").href="research.html?ticker="+encodeURIComponent(validated);
 $("c11-alerts").href="alerts.html";
 const batch=await Promise.allSettled([
  get("/v1/intelligence?ticker="+encodeURIComponent(validated)),
  get("/v1/transactions?ticker="+encodeURIComponent(validated)+"&limit=100"),
  get("/v1/filings?ticker="+encodeURIComponent(validated)+"&limit=100")
 ]);
 if(seq!==runId)return;
 detail=batch[0].status==="fulfilled"?batch[0].value:null;
 transactions=batch[1].status==="fulfilled"&&Array.isArray(batch[1].value.items)?batch[1].value.items:[];
 imports=batch[2].status==="fulfilled"&&Array.isArray(batch[2].value.items)?batch[2].value.items:[];
 const company=detail?.company;
 if(company){
  setText("cv-name",company.name||validated);
  setText("cv-details",validated+" · SEC CIK "+(company.cik||"not reported")+" · Official company record");
  setText("cv-description","Explore reported financial performance, official disclosures and ownership activity. Every available figure links back to its filing.");
  const cik=String(company.cik||"");
  if(/^\d{10}$/.test(cik))$("cv-sec").href="https://www.sec.gov/edgar/browse/?CIK="+encodeURIComponent(cik);
  const warnings=(detail.warnings||[]).filter(Boolean);
  setText("cv-status","SEC financial intelligence loaded for "+validated+". "+(warnings.length?warnings.join(" "):"Source links and reporting periods are available for verification."));
 }else{
  const fallback=imports[0]?.issuer_name;
  setText("cv-name",fallback||validated);
  setText("cv-details",validated+" · SEC public record research");
  setText("cv-description",fallback?"Imported SEC ownership filings are available; expanded company financial statements may be temporarily unavailable.":"No verified company report is available for this ticker yet.");
  const err=batch[0].status==="rejected"?batch[0].reason.message:"No SEC company intelligence";
  setText("cv-status","Detailed SEC company intelligence unavailable: "+err+(transactions.length||imports.length?" · Showing verified imported ownership records.":""));
 }
 renderAll();
 void fetchWatchlist(validated);
}
document.addEventListener("DOMContentLoaded",()=>{
 const lookup=$("cv-search"),input=$("cv-ticker");
 lookup?.addEventListener("submit",e=>{
  e.preventDefault();const t=symbol(input.value.trim());
  if(!t){input.setCustomValidity("Enter a valid ticker");input.reportValidity();return}
  input.setCustomValidity("");void load(t);
 });
 input?.addEventListener("input",()=>input.setCustomValidity(""));
 document.querySelectorAll("[data-company-tab]").forEach(b=>b.addEventListener("click",()=>activateTab(b.dataset.companyTab)));
 document.querySelectorAll("[data-company-go]").forEach(b=>b.addEventListener("click",()=>activateTab(b.dataset.companyGo)));
 document.querySelectorAll("[data-metric]").forEach(b=>b.addEventListener("click",()=>{chartMetric=b.dataset.metric;chart()}));
 document.querySelectorAll("[data-range]").forEach(b=>b.addEventListener("click",()=>{chartRange=Number(b.dataset.range)||5;chart()}));
 document.querySelectorAll("[data-form-filter]").forEach(b=>b.addEventListener("click",()=>{filingFilter=b.dataset.formFilter;renderFilingRows()}));
 document.querySelectorAll("[data-insider-filter]").forEach(b=>b.addEventListener("click",()=>{insiderFilter=b.dataset.insiderFilter;renderTransactionRows()}));
 $("c11-print")?.addEventListener("click",()=>window.print());
 $("c11-share")?.addEventListener("click",async()=>{
  const url=location.href,button=$("c11-share");
  try{if(navigator.share)await navigator.share({title:document.title,url});
  else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);button.textContent="Link copied ✓";setTimeout(()=>button.textContent="Share ↗",1800)}
  else window.prompt("Copy research link:",url);
  }catch(e){if(e.name!=="AbortError")window.prompt("Copy research link:",url)}
 });
 $("cv-follow")?.addEventListener("click",async()=>{
  if(!activeTicker)return;
  if(watchlistState==="signed_out"){location.href="signin.html";return}
  const b=$("cv-follow");b.disabled=true;
  try{
   if(watchlistState===true)await get("/v1/me/watchlist/"+encodeURIComponent(activeTicker),{method:"DELETE"});
   else await get("/v1/me/watchlist",{method:"POST",body:JSON.stringify({ticker:activeTicker})});
   watchlistState=watchlistState===true?false:true;
   b.textContent=watchlistState?"✓ Following company":"+ Add to watchlist";
  }catch(e){if(e.status===401){watchlistState="signed_out";b.textContent="+ Sign in to save"}else{setText("cv-status","Could not update watchlist: "+e.message)}}
  finally{b.disabled=false}
 });
 const initial=symbol(new URLSearchParams(location.search).get("ticker"));
 if(initial){void load(initial);const anchorId=location.hash.slice(1);if(["cv-summary","cv-facts","cv-filings","cv-transactions","c11-owners"].includes(anchorId))activateTab(anchorId,false)}
 else{setText("cv-status","Enter a company ticker to see official financial reports, SEC filings and insider ownership records.");$("cv-symbol").innerHTML=media?.logo("","lg")||"";renderAll()}
});
})();