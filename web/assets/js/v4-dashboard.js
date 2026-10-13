/* Derived views of the verified Insidir dashboard feed; zero additional API calls. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tick=x=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(x||"").toUpperCase())?String(x).toUpperCase():"";
const date=x=>{const d=new Date(x);return x&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported"};
const source=x=>{try{const u=new URL(String(x));return u.protocol==="https:"&&["sec.gov","www.sec.gov"].includes(u.hostname)&&!u.username&&!u.password?u.toString():"";}catch{return ""}};
const icon=n=>'<svg class="v4-ui-icon" aria-hidden="true"><use href="assets/icons/interface.svg#'+n+'"></use></svg>';
const research=t=>tick(t)?"research.html?ticker="+encodeURIComponent(tick(t)):"research.html";
function inspector(x){
 const body=$("v4-inspector-body"),latest=$("v4-latest-filing-date"),state=$("v4-data-state");
 if(!body||!latest||!state)return;
 state.textContent="Connected · imported SEC filings";
 if(!x){body.innerHTML='<p class="v3-empty">No imported filings in the current window. Browse company records for other SEC disclosures.</p>';latest.textContent="No imported records";return;}
 latest.textContent=date(x.published_at);
 const t=tick(x.ticker),url=source(x.source_url);
 body.innerHTML='<div class="v4-inspector__form">'+icon("file-text")+' <span>'+esc(x.form_type||"Form 4")+'</span><small>IMPORTED DISCLOSURE</small></div>'+
 '<h3>'+esc(x.issuer_name||t||"Public company")+'</h3>'+
 (t?'<a class="v4-inspector__ticker" href="'+esc(research(t))+'">'+esc(t)+' · Research company '+icon("arrow-up-right")+'</a>':'')+
 '<dl><div><dt>Published</dt><dd>'+esc(date(x.published_at))+'</dd></div><div><dt>Form</dt><dd>'+esc(x.form_type||"SEC filing")+'</dd></div><div><dt>Original record</dt><dd>'+(url?"SEC EDGAR link":"Not available")+'</dd></div></dl>'+
 (url?'<a class="v4-inspector__cta" target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+icon("external")+' Read original SEC filing</a>':'<a class="v4-inspector__cta" href="filings.html">'+icon("file-search")+' Browse imported filings</a>');
}
function activity(rows){
 const host=$("v4-activity-chart");if(!host)return;
 const counts=new Map();
 for(const x of rows){
  const d=new Date(x.published_at);if(!x.published_at||Number.isNaN(d.getTime()))continue;
  const day=d.toISOString().slice(0,10);
  counts.set(day,(counts.get(day)||0)+1);
 }
 const entries=[...counts].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7).reverse();
 if(!entries.length){host.innerHTML='<p class="v3-empty">No dated imported transactions to visualize in this window.</p>';host.setAttribute("aria-label","No dated imported transactions to visualize");return;}
 const max=Math.max(...entries.map(x=>x[1]));
 host.setAttribute("aria-label","Imported transactions by SEC publication date: "+entries.map(([day,n])=>day+": "+n).join(", "));
 host.innerHTML='<div class="v4-trend__plot">'+entries.map(([day,n])=>{
   const height=Math.max(8,Math.round(n/max*100));
   const label=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(day+"T00:00:00Z"));
   return '<div class="v4-trend__column" title="'+esc(label)+': '+esc(n)+' imported transaction'+(n===1?'':'s')+'"><span class="v4-trend__number">'+esc(n)+'</span><div class="v4-trend__track"><span style="height:'+height+'%"></span></div><span class="v4-trend__date">'+esc(label)+'</span></div>';
 }).join("")+'</div>';
}
document.addEventListener("insidir:filings-loaded",event=>inspector(event.detail?.[0]));
document.addEventListener("insidir:filings-error",()=>{const body=$("v4-inspector-body");if(body)body.innerHTML='<p class="v3-empty">The filing feed is unavailable right now. <a href="filings.html">Open filing library →</a></p>';if($("v4-data-state"))$("v4-data-state").textContent="Temporarily unavailable";if($("v4-latest-filing-date"))$("v4-latest-filing-date").textContent="Unknown";});
document.addEventListener("insidir:transactions-loaded",event=>activity(Array.isArray(event.detail)?event.detail:[]));
document.addEventListener("insidir:transactions-error",()=>{if($("v4-activity-chart"))$("v4-activity-chart").innerHTML='<p class="v3-empty">Activity distribution temporarily unavailable.</p>';});
})();
