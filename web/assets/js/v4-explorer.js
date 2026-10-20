/* Interactive, evidence-backed homepage instrument. No fabricated market prices or financial metrics. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const src=x=>{try{const u=new URL(String(x));return u.protocol==="https:"&&["www.sec.gov","sec.gov"].includes(u.hostname)&&!u.username&&!u.password?u.toString():"";}catch{return ""}};
const date=x=>{if(!x)return "Not reported";const d=new Date(x);return Number.isNaN(d.getTime())?"Not reported":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d);};
const cash=x=>{const v=Number(x);if(x==null||!Number.isFinite(v))return "Not reported";return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(v);};
const ico=n=>'<svg class="is4-icon" aria-hidden="true"><use href="assets/icons/interface.svg#'+n+'"></use></svg>';
const host=$("is4-explorer-filings"),facts=$("is4-explorer-facts"),status=$("is4-explorer-status"),name=$("is4-company-name");
if(!host||!facts||!status||!name)return;
const allowed=new Set(["AAPL","MSFT","NVDA","TSLA"]);
const cache=new Map();let inFlight=null,selection="AAPL";
const peopleCache=new Map();let peopleFlight=null;
async function loadPeople(t){
 const host=$("ins-explorer-people");if(!host)return;
 if(peopleCache.has(t)){renderPeople(peopleCache.get(t),t);return;}
 if(peopleFlight)peopleFlight.abort();
 const ac=new AbortController();peopleFlight=ac;
 host.innerHTML='<p class="is4-explorer__empty">Checking publicly reported ownership disclosures…</p>';
 try{
  const r=await fetch("/v1/transactions?ticker="+encodeURIComponent(t)+"&limit=25",{credentials:"same-origin",headers:{Accept:"application/json"},signal:ac.signal});
  if(!r.ok)throw Error("Imported Form 4 activity is unavailable");
  const data=await r.json();
  if(selection!==t)return;
  const records=Array.isArray(data.items)?data.items:[];
  peopleCache.set(t,records);renderPeople(records,t);
 }catch(e){
  if(e.name==="AbortError"||selection!==t)return;
  host.innerHTML='<p class="is4-explorer__empty">Insider records unavailable. <a href="research.html?ticker='+encodeURIComponent(t)+'">Check the Research Desk →</a></p>';
 }finally{if(peopleFlight===ac)peopleFlight=null;}
}
function renderPeople(records,t){
 const host=$("ins-explorer-people");if(!host)return;
 const found=new Set(),people=[];
 for(const x of records){
  const n=String(x.owner_name||"").trim();
  if(!n||found.has(n.toUpperCase()))continue;
  found.add(n.toUpperCase());
  people.push({name:n,category:x.category});
  if(people.length===8)break;
 }
 host.innerHTML=people.length?people.map(x=>'<div class="ins-explorer-person">'+
  (window.InsidirMedia?.portrait(x.name,t,"md")||"")+
  '<div class="ins-explorer-person__copy"><strong>'+esc(x.name)+'</strong><small>'+
  (x.category==="reported_purchase"?"Reported purchase":x.category==="reported_sale"?"Reported sale":"Form 4 ownership activity")+
  '</small></div></div>').join(""):
  '<p class="is4-explorer__empty">No imported insider transactions are available for this company in the current dataset.</p>';
 window.InsidirMedia?.hydrate(host);
}
function setStatus(message,state){status.textContent=message;status.dataset.state=state;}
function render(data,ticker){
 const company=data?.company||{};
 name.textContent=company.name||ticker;
 $("is4-company-ticker").textContent=ticker+" · SEC CIK "+(company.cik||"not reported");
 const reports=Array.isArray(data?.filings)?data.filings.slice(0,5):[];
 host.innerHTML=reports.length?reports.map(f=>{
   const u=src(f.sourceUrl);
   return '<div class="is4-explorer__entry"><span class="is4-explorer__form">'+esc(f.form||"SEC")+'</span><div><strong>'+esc(f.headline||"Company disclosure")+'</strong><small>Filed '+esc(date(f.filedAt))+'</small></div>'+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer" aria-label="Verify '+esc(f.form||"filing")+' with the SEC">'+ico("external")+'</a>':'<span>—</span>')+'</div>';
 }).join(""):'<p class="is4-explorer__empty">No selected SEC filings were returned. The complete filing may still be found at SEC EDGAR.</p>';
 const periodText=(f,fmt)=>{const end=fmt(f.periodEnd),n=Number(f.durationDays);return f.periodType==="instant"?"As of "+end:f.periodType==="quarter"?"3 months ended "+end:f.periodType==="fiscal-year"?"Fiscal year ended "+end:f.periodType==="year-to-date"&&n?Math.round(n/30.4)+" months (year to date) ended "+end:(f.start?fmt(f.start)+" – ":"")+end;};
 const metrics=Array.isArray(data?.facts)?data.facts.slice(0,4):[];
 facts.innerHTML=metrics.length?metrics.map(m=>{
   const u=src(m.sourceUrl);
   return '<div class="is4-explorer__entry is4-explorer__fact"><div><span>'+esc(m.label||"Reported financial measure")+'</span><strong>'+esc(cash(m.value))+'</strong><small>'+esc(periodText(m,date))+' · '+esc(m.form||"SEC report")+'</small></div>'+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer" aria-label="Verify '+esc(m.label||"financial fact")+' with the SEC">'+ico("external")+'</a>':'<span>—</span>')+'</div>';
 }).join(""):'<p class="is4-explorer__empty">SEC XBRL facts are not available for this company right now. Company filings may still be accessible.</p>';
 const hasWarnings=Array.isArray(data?.warnings)&&data.warnings.length>0;
 setStatus(hasWarnings?"Research loaded · some data unavailable":"SEC evidence loaded","loaded");
}
async function load(t){
 if(!allowed.has(t))return;
 selection=t;
 for(const btn of document.querySelectorAll("[data-scan-ticker]"))btn.setAttribute("aria-pressed",String(btn.dataset.scanTicker===t));
 void loadPeople(t);
 const brand=window.InsidirMedia;
 const symbol=$("is4-explorer-symbol");
 symbol.innerHTML=brand?brand.logo(t,"lg"):"";
 brand?.hydrate(symbol);
 $("is4-company-ticker").textContent=t+" · Loading official SEC disclosures";
 $("is4-open-research").href="research.html?ticker="+encodeURIComponent(t);
 $("is4-company-details").href="company.html?ticker="+encodeURIComponent(t);
 if(cache.has(t)){render(cache.get(t),t);return;}
 name.textContent=t;setStatus("Loading SEC records…","loading");
 host.innerHTML='<p class="is4-explorer__empty">Checking the SEC company submission index…</p>';
 facts.innerHTML='<p class="is4-explorer__empty">Checking reported financial facts…</p>';
 if(inFlight)inFlight.abort();
 const ac=new AbortController();inFlight=ac;
 try{
  const response=await fetch("/v1/intelligence?ticker="+encodeURIComponent(t),{credentials:"same-origin",headers:{Accept:"application/json"},signal:ac.signal});
  let data;try{data=await response.json()}catch{throw Error("SEC intelligence service is not returning data");}
  if(!response.ok)throw Error(data?.error||"SEC intelligence service unavailable");
  if(selection!==t)return;
  cache.set(t,data);render(data,t);
 }catch(e){
  if(e.name==="AbortError"||selection!==t)return;
  setStatus("Live SEC data unavailable","unavailable");
  host.innerHTML='<p class="is4-explorer__empty">The filings could not be loaded right now. <a href="filings.html">Explore imported disclosures →</a></p>';
  facts.innerHTML='<p class="is4-explorer__empty">SEC reported financial facts are temporarily unavailable. <a href="company.html?ticker='+encodeURIComponent(t)+'">Open full company research →</a></p>';
 }finally{if(inFlight===ac)inFlight=null;}
}
document.querySelectorAll("[data-scan-ticker]").forEach(button=>button.addEventListener("click",()=>void load(button.dataset.scanTicker)));
const section=document.getElementById("live-research");
if(section&&"IntersectionObserver" in window){
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load("AAPL");}},{rootMargin:"200px"});
 observer.observe(section);
}else void load("AAPL");
})();
