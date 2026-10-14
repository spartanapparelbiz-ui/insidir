/* Derived views on the research desk: the disclosure-activity chart and the data-source panel.
   Zero extra API calls: it draws from the responses v3-dashboard.js announces with
   insidir:transactions-loaded, insidir:filings-loaded and insidir:status-loaded. Real counts only. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const valid=x=>{if(!x)return null;const d=new Date(x);return Number.isNaN(d.getTime())?null:d;};
const date=x=>{const d=valid(x);return d?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported";};
const stamp=x=>{const d=valid(x);return d?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"UTC"}).format(d)+" UTC":"Not reported";};
const short=day=>new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(day+"T00:00:00Z"));
const count=n=>new Intl.NumberFormat("en-US").format(n);
const set=(id,text)=>{const el=$(id);if(el)el.textContent=text;};
const retry='<button type="button" class="rd-retry" data-retry="trades">Try again</button>';

/* The SEC publication days of the transactions the desk loaded (the 100 most recent by trade date,
   from /v1/transactions?limit=100), split purchase / sale / other: the latest ten days in that
   window (six on narrow screens, so every date label stays legible). It is a sample of the newest
   records, not a daily total of everything the SEC published, and is captioned that way. */
let lastRows=null,lastDays=0;
function activity(rows){
 const host=$("v4-activity-chart");if(!host)return;
 host.setAttribute("role","img"); // removed while an error message with a Try again button is shown
 lastRows=rows;
 const limit=lastDays=host.clientWidth&&host.clientWidth<520?6:10; // fewer, wider columns on phones
 const days=new Map();
 for(const x of rows){
  const d=valid(x.published_at);if(!d)continue;
  const key=d.toISOString().slice(0,10),v=days.get(key)||{buy:0,sell:0,other:0};
  if(x.category==="reported_purchase")v.buy++;else if(x.category==="reported_sale")v.sell++;else v.other++;
  days.set(key,v);
 }
 const entries=[...days].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,limit).reverse();
 if(!entries.length){
  host.innerHTML='<p class="rd-empty">No dated transactions to chart yet. The chart fills in as SEC filings are imported.</p>';
  host.setAttribute("aria-label","No dated imported transactions to chart");return;
 }
 const total=entries.reduce((n,[,v])=>n+v.buy+v.sell+v.other,0);
 const max=Math.max(...entries.map(([,v])=>v.buy+v.sell+v.other));
 const top=Math.max(1,max);
 host.setAttribute("aria-label","Publication days of the "+rows.length+" most recent imported transactions: "+entries.map(([day,v])=>short(day)+": "+(v.buy+v.sell+v.other)+" ("+v.buy+" purchases, "+v.sell+" sales, "+v.other+" other)").join("; "));
 const seg=(n,cls)=>n?'<span class="rd-bar__seg '+cls+'" style="height:'+(n/top*100).toFixed(2)+'%"></span>':"";
 host.innerHTML='<div class="rd-chart__plot" aria-hidden="true"><div class="rd-chart__scale"><span>'+esc(top)+'</span><span>0</span></div>'+
  entries.map(([day,v])=>{const n=v.buy+v.sell+v.other;return '<div class="rd-bar" title="'+esc(short(day))+': '+n+' transaction'+(n===1?"":"s")+'"><span class="rd-bar__n">'+esc(n)+'</span><span class="rd-bar__track">'+seg(v.other,"rd-bar__seg--other")+seg(v.buy,"rd-bar__seg--buy")+seg(v.sell,"rd-bar__seg--sell")+'</span><span class="rd-bar__day">'+short(day).split(" ").map(x=>'<span>'+esc(x)+'</span>').join(" ")+'</span></div>';}).join("")+
  '</div><div class="rd-chart__legend"><span class="rd-key rd-key--sell">Sales</span><span class="rd-key rd-key--buy">Purchases</span><span class="rd-key rd-key--other">Other</span><span class="rd-chart__total">'+esc(count(total))+' transaction'+(total===1?"":"s")+' · '+entries.length+' publication day'+(entries.length===1?"":"s")+' · from the latest '+esc(count(rows.length))+' loaded</span></div>';
}

document.addEventListener("insidir:transactions-loaded",e=>activity(Array.isArray(e.detail)?e.detail:[]));
let resizeTimer=0;
addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const host=$("v4-activity-chart");if(lastRows&&host&&(host.clientWidth<520?6:10)!==lastDays)activity(lastRows);},150);});
document.addEventListener("insidir:transactions-error",e=>{const host=$("v4-activity-chart");if(host){host.removeAttribute("role");host.innerHTML='<p class="rd-empty rd-empty--error" role="alert">Activity is unavailable: '+esc(e.detail||"the transaction feed did not load")+' '+retry+'</p>';host.removeAttribute("aria-label");}});
document.addEventListener("insidir:filings-loaded",e=>{const first=Array.isArray(e.detail)?e.detail[0]:null;set("v4-latest-filing-date",first?date(first.published_at):"No filings imported yet");});
document.addEventListener("insidir:filings-error",()=>set("v4-latest-filing-date","Unavailable"));
/* ingest_runs.status as src/ingest.mjs writes it: running → success | partial | error. */
const RUN={success:"",completed:"",ok:"",partial:" · partial import",running:" · in progress",error:" · import failed"};
const runNote=x=>{const k=String(x||"").toLowerCase();return k in RUN?RUN[k]:k?" · "+k.slice(0,24):"";};
document.addEventListener("insidir:status-loaded",e=>{
 const s=e.detail||{},run=s.lastIngest||null;
 const online=s.engine?s.engine==="online":s.ok!==false;
 set("v4-data-state",online?(s.sec==="requires_user_agent"?"Online · SEC import not configured":"Online"):"Degraded");
 set("v4-filing-count",Number.isFinite(Number(s.filings))?count(Number(s.filings))+" parsed":"Not reported");
 const when=run?(run.status==="running"?run.started_at:(run.finished_at||run.started_at)):s.lastIngestAt||null;
 set("v4-last-import",when?(run?.status==="running"?"Started ":"")+stamp(when)+runNote(run?.status):"No import recorded yet");
 if(s.latest_published_at&&/^Checking/.test($("v4-latest-filing-date")?.textContent||""))set("v4-latest-filing-date",date(s.latest_published_at));
});
document.addEventListener("insidir:status-error",e=>{
 // Keep the right-aligned value short: the HTTP status when there is one, else the message.
 const msg=String(e.detail||"").replace(/\s*Taking you.*$/,""),code=/HTTP \d{3}/.exec(msg),why=code?code[0]:msg.slice(0,80);
 const state=$("v4-data-state");
 if(state)state.innerHTML="Unavailable"+(why?" · "+esc(why):"")+' <button type="button" class="rd-retry" data-retry="status">Try again</button>';
 set("v4-filing-count","Unavailable");set("v4-last-import","Unavailable");
});
})();
