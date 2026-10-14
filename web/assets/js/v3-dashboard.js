/* Insidir overview (dashboard.html), the signed-in research desk: imported SEC records and the reader's own research.
   Reads /v1/transactions?limit=100, /v1/filings?limit=12, /v1/status, /v1/me/watchlist and
   /v1/me/research-decisions, plus /v1/transactions?ticker=X&limit=1 for a watched ticker whose
   latest transaction is older than the market-wide feed. No synthetic records, prices or market metrics: every row comes from
   one of those responses and links to an Insidir page or the original SEC document.
   Figures are exact: shares and prices as filed, values to the dollar, dates to the day, and the filing lag
   (SEC publication date minus trade date). Direction is shown with a word, a sign and a green/red marker.
   401/402 responses are handled by app.js (sign-in / subscribe); this file shows a clear message
   for every other failure and never leaves a module spinning. The formatters are shared with
   v4-dashboard.js (insider flow) through window.InsidirDesk. */
(() => {"use strict";
const $=id=>document.getElementById(id);
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tick=x=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(x||"").trim().toUpperCase())?String(x).trim().toUpperCase():"";
const accession=x=>{const s=String(x||"").replace(/-/g,"");return /^\d{18}$/.test(s)?s:"";};
const validDate=x=>{if(!x)return null;const d=new Date(x);return Number.isNaN(d.getTime())?null:d;};
const DAY=86400000;
const fmtDate=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
const fmtDay=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"});
const date=x=>{const d=validDate(x);return d?fmtDate.format(d):"Not reported";};
const shortDate=x=>{const d=validDate(x);return d?fmtDay.format(d):"";};
/* Numbers: exact, never rounded to "about". */
const num=x=>{if(x===null||x===undefined||x==="")return null;const n=Number(x);return Number.isFinite(n)?n:null;};
const USD0=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
const USD2=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2});
const USD4=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:4});
const USDC=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:1});
const QTY=new Intl.NumberFormat("en-US",{maximumFractionDigits:4});
const MINUS="−";
const money=x=>{const n=num(x);return n===null?"Not reported":USD0.format(n);};
const signedMoney=n=>(n>0?"+":n<0?MINUS:"")+USD0.format(Math.abs(n));
const compactMoney=n=>USDC.format(n);
const price=x=>{const n=num(x);return n===null?"Not reported":(Math.abs(n)<1?USD4:USD2).format(n);};
const qty=x=>{const n=num(x);return n===null?"Not reported":QTY.format(n);};
const count=n=>QTY.format(n);
const plural=(n,one,many)=>count(n)+" "+(n===1?one:(many||one+"s"));
const source=v=>{try{const u=new URL(String(v));return u.protocol==="https:"&&["www.sec.gov","sec.gov"].includes(u.hostname)&&!u.username&&!u.password?u.toString():"";}catch{return ""}};
const media=window.InsidirMedia;
const shown=n=>media?.displayName?media.displayName(n):String(n||"Reporting person");
const companyHref=t=>tick(t)?"company.html?ticker="+encodeURIComponent(tick(t)):"explore.html";
const researchHref=t=>tick(t)?"research.html?ticker="+encodeURIComponent(tick(t)):"research.html";
const filingHref=a=>accession(a)?"filing.html?accession="+accession(a):"filings.html";
// #v10-directory: the people page opens on the search result, not on its hero.
const personHref=n=>String(n||"").trim()?"people.html?q="+encodeURIComponent(String(n).trim().slice(0,80))+"#v10-directory":"people.html";
const logo=t=>media?media.logo(t,"sm"):"";
const portrait=(n,t)=>media?media.portrait(n,t,"sm"):"";
const STATUS={researching:"Researching",watching:"Watching",passed:"Passed"};

/* Form 4 transaction codes, as the SEC's Form 4 general instructions define them. */
const CODES={
 P:"Open market or private purchase",S:"Open market or private sale",V:"Transaction voluntarily reported earlier than required",
 A:"Grant, award or other acquisition from the issuer",D:"Disposition to the issuer",F:"Payment of exercise price or tax liability by delivering securities",
 I:"Discretionary transaction",M:"Exercise or conversion of an exempt derivative security",C:"Conversion of a derivative security",
 E:"Expiration of a short derivative position",H:"Expiration or cancellation of a long derivative position",
 O:"Exercise of an out-of-the-money derivative security",X:"Exercise of an in-the-money or at-the-money derivative security",
 G:"Bona fide gift",L:"Small acquisition under Rule 16a-6",W:"Acquisition or disposition by will or the laws of descent and distribution",
 Z:"Deposit into or withdrawal from a voting trust",J:"Other acquisition or disposition (described in the filing)",K:"Equity swap or similar instrument",
 U:"Disposition from a tender of shares in a change of control"};
const code=x=>String(x?.transaction_code||"").replace(/[^A-Z]/gi,"").slice(0,1).toUpperCase();
const codeMeaning=c=>CODES[c]||"";
/* buy | sell | other, from the engine's category. */
const kind=x=>x?.category==="reported_purchase"?"buy":x?.category==="reported_sale"?"sell":"other";
const KIND={buy:["Purchase","rd-type--buy"],sell:["Sale","rd-type--sell"],other:["Other","rd-type--other"]};
const tri=k=>k==="buy"?'<i class="rd-tri rd-tri--up" aria-hidden="true"></i>':k==="sell"?'<i class="rd-tri rd-tri--down" aria-hidden="true"></i>':"";
/* Shares as filed with the direction sign: A (acquired) +, D (disposed) −; purchases +, sales − when the code letter is missing. */
const sharesOf=x=>num(x?.shares);
const signOf=x=>{const ad=String(x?.acquired_disposed||"").toUpperCase();return ad==="A"?1:ad==="D"?-1:kind(x)==="buy"?1:kind(x)==="sell"?-1:0;};
const signedShares=x=>{const n=sharesOf(x);if(n===null)return "Not reported";const s=signOf(x);return (s>0?"+":s<0?MINUS:"")+QTY.format(Math.abs(n));};
const priceOf=x=>num(x?.price_per_share??x?.price);
/* Value as filed: the engine's shares × price; computed the same way when only the parts were stored. */
const valueOf=x=>{const v=num(x?.estimated_value);if(v!==null)return v;const s=sharesOf(x),p=priceOf(x);return s!==null&&p!==null&&p>0?Math.round(s*p*100)/100:null;};
/* Calendar days from the trade date to the SEC publication date (UTC). */
const lagOf=x=>{const t=validDate(x?.transaction_date),p=validDate(x?.published_at);if(!t||!p)return null;const d=Math.round((Date.UTC(p.getUTCFullYear(),p.getUTCMonth(),p.getUTCDate())-Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate()))/DAY);return d>=0?d:null;};
const lagText=n=>n===null?"":n===0?"same day":"+"+n+(n===1?" day":" days");
const ownership=x=>{const o=String(x?.direct_ownership||"").toUpperCase();return o==="D"?"Direct":o==="I"?"Indirect":"";};
const badge=x=>{const k=kind(x),[label,cls]=KIND[k],c=code(x),m=codeMeaning(c);return '<span class="rd-type '+cls+'"'+(m?' title="'+E(c+" — "+m)+'"':'')+'>'+tri(k)+E(label)+(c?' · '+E(c):'')+'</span>';};
window.InsidirDesk={E,tick,date,shortDate,validDate,num,money,signedMoney,compactMoney,price,qty,count,plural,kind,code,codeMeaning,tri,badge,
 sharesOf,signOf,signedShares,priceOf,valueOf,lagOf,lagText,ownership,shown,logo,portrait,companyHref,filingHref,personHref,MINUS,DAY};

/* ---------- network ---------- */
function explain(status){
 if(status===401)return "Your session has ended. Taking you to sign in…";
 if(status===402)return "An active subscription is needed. Taking you to the subscription page…";
 if(status===429)return "Too many requests right now. Wait a moment and try again.";
 if(status>=500)return "The research service is unavailable right now (HTTP "+status+").";
 return "The request could not be completed (HTTP "+status+").";
}
async function api(path){
 let r;
 try{r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json"}});}
 catch{throw Object.assign(Error("Could not reach the research service. Check your connection."),{status:0});}
 let j=null;try{j=await r.json();}catch{/* not JSON */}
 if(!r.ok)throw Object.assign(Error(explain(r.status)),{status:r.status});
 if(!j||typeof j!=="object")throw Object.assign(Error("The research service sent an unreadable response."),{status:r.status});
 return j;
}
const items=j=>Array.isArray(j?.items)?j.items:[];
const retry=key=>' <button type="button" class="rd-retry" data-retry="'+key+'">Try again</button>';
const failRow=(cols,key,e)=>'<tr><td colspan="'+cols+'" class="rd-empty rd-empty--error" role="alert">'+E(e.message)+(e.status===401||e.status===402?"":retry(key))+'</td></tr>';
const failBlock=(key,e)=>'<p class="rd-empty rd-empty--error" role="alert">'+E(e.message)+(e.status===401||e.status===402?"":retry(key))+'</p>';
const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));

/* ---------- state ---------- */
// latest: per-ticker lookups for watched tickers, ticker → {pending} | {row} | {error}.
const state={trades:null,tradesError:null,filings:null,watchlist:null,watchError:null,filter:"all",latest:new Map()};
// A reload retries per-ticker lookups that failed.
const clearFailedLookups=()=>{for(const [t,v] of state.latest)if(v.error)state.latest.delete(t);};

/* ---------- insider transactions ---------- */
const FILTER={all:()=>true,reported_purchase:x=>kind(x)==="buy",reported_sale:x=>kind(x)==="sell",other:x=>kind(x)==="other"};
const FILTER_NAME={reported_purchase:"purchases",reported_sale:"sales",other:"transactions under other codes"};
const TRADE_ROWS=12,TRADE_COLS=9;
function renderTrades(){
 const host=$("v3-trades");if(!host)return;
 if(state.tradesError){host.innerHTML=failRow(TRADE_COLS,"trades",state.tradesError);return;}
 if(!state.trades)return;
 const counts={};for(const k in FILTER)counts[k]=state.trades.filter(FILTER[k]).length;
 document.querySelectorAll("[data-count]").forEach(el=>{el.textContent=String(counts[el.dataset.count]??"");});
 const matching=state.trades.filter(FILTER[state.filter]||FILTER.all),list=matching.slice(0,TRADE_ROWS);
 if(!list.length){
  host.innerHTML='<tr><td colspan="'+TRADE_COLS+'" class="rd-empty">'+(state.trades.length?"No "+FILTER_NAME[state.filter]+" among the "+state.trades.length+" latest imported transactions.":"No imported Form 4 transactions yet. New filings appear here after the next SEC import.")+'</td></tr>';
  return;
 }
 host.innerHTML=list.map(x=>{
  const t=tick(x.ticker),k=kind(x),v=valueOf(x),p=priceOf(x),lag=lagOf(x),own=ownership(x);
  const notes=[own,x.derivative?"derivative":"",x.is_amendment?"amended":""].filter(Boolean).join(" · ");
  return '<tr class="rd-trade rd-trade--'+k+'">'+
   '<td data-label="Reporting person"><span class="rd-entity">'+portrait(x.owner_name,t)+'<a href="'+E(personHref(x.owner_name))+'">'+E(shown(x.owner_name))+'</a></span></td>'+
   '<td data-label="Company">'+(t?'<span class="rd-entity">'+logo(t)+'<a href="'+E(companyHref(t))+'">'+E(t)+'</a></span>'+(x.issuer_name?'<span class="rd-sub">'+E(x.issuer_name)+'</span>':''):'<span class="rd-muted">No ticker</span>')+'</td>'+
   '<td data-label="Transaction">'+badge(x)+(x.security_title?'<span class="rd-sub">'+E(String(x.security_title).slice(0,48))+'</span>':'')+'</td>'+
   '<td data-label="Shares" class="rd-num"><span class="rd-qty rd-qty--'+k+'">'+E(signedShares(x))+'</span>'+(notes?'<span class="rd-sub">'+E(notes)+'</span>':'')+'</td>'+
   '<td data-label="Price" class="rd-num">'+(p!==null&&p>0?E(price(p)):'<span class="rd-muted">No price</span>')+'</td>'+
   '<td data-label="Value" class="rd-num rd-value">'+(v!==null?E(money(v)):'<span class="rd-muted">Not reported</span>')+'</td>'+
   '<td data-label="Traded" class="rd-nb">'+E(date(x.transaction_date))+'</td>'+
   '<td data-label="Filed" class="rd-nb">'+(validDate(x.published_at)?E(date(x.published_at))+(lag!==null?'<span class="rd-sub">'+E(lagText(lag))+'</span>':''):'<span class="rd-muted">Not reported</span>')+'</td>'+
   '<td class="rd-links"><a class="rd-arrow" href="'+E(filingHref(x.accession))+'" aria-label="Open the filing for this transaction">Filing ↗</a></td>'+
  '</tr>';
 }).join("")+(matching.length>list.length?'<tr class="rd-more-row"><td colspan="'+TRADE_COLS+'" class="rd-more">Showing the latest '+list.length+' of '+matching.length+' imported transactions. <a href="filings.html">Browse every filing ↗</a></td></tr>':"");
 media?.hydrate(host);
}
async function loadTrades(){
 state.tradesError=null;clearFailedLookups();
 try{state.trades=items(await api("/v1/transactions?limit=100"));renderTrades();emit("insidir:transactions-loaded",state.trades);}
 catch(e){state.trades=null;state.tradesError=e;renderTrades();emit("insidir:transactions-error",e);}
 renderWatchlist();
}

/* ---------- latest filings ---------- */
const owners=x=>{const o=Array.isArray(x.owner_names)?x.owner_names:x.owner_names?[x.owner_names]:x.reporting_owner?[x.reporting_owner]:[];return o.filter(Boolean).map(String);};
async function loadFilings(){
 const host=$("v3-filings");if(!host)return;
 try{
  const arr=items(await api("/v1/filings?limit=12"));state.filings=arr;emit("insidir:filings-loaded",arr);
  host.innerHTML=arr.length?arr.slice(0,8).map(x=>{
   const t=tick(x.ticker),who=owners(x),url=source(x.source_url);
   return '<tr>'+
    '<td data-label="Company"><div class="rd-filing">'+logo(t)+'<div><a href="'+E(companyHref(t))+'">'+E(x.issuer_name||t||"Issuer not reported")+'</a><span class="rd-sub">'+E([t,who.length?shown(who[0])+(who.length>1?" +"+(who.length-1):""):""].filter(Boolean).join(" · "))+'</span></div></div></td>'+
    '<td data-label="Form">'+E(x.form_type||"4")+(x.is_amendment?' <span class="rd-muted">amended</span>':'')+'</td>'+
    '<td data-label="Published" class="rd-nb">'+E(date(x.published_at))+'</td>'+
    '<td class="rd-links"><a class="rd-arrow" href="'+E(filingHref(x.accession))+'">Details ↗</a>'+(url?'<a class="rd-arrow rd-arrow--ext" href="'+E(url)+'" target="_blank" rel="noopener noreferrer">SEC ↗</a>':'')+'</td>'+
   '</tr>';
  }).join(""):'<tr><td colspan="4" class="rd-empty">No imported SEC filings yet. They appear here after the next import. <a href="filings.html">Open the filing library</a></td></tr>';
  media?.hydrate(host);
  const foot=$("v3-coverage");if(foot&&arr.length)foot.textContent="Showing the "+Math.min(arr.length,8)+" most recently published of the filings imported so far. Publication date is when the SEC posted the filing, not when the trade happened.";
 }catch(e){state.filings=null;emit("insidir:filings-error",e.message);host.innerHTML=failRow(4,"filings",e);}
}

/* ---------- data source status ---------- */
async function loadStatus(){
 try{emit("insidir:status-loaded",await api("/v1/status"));}
 catch(e){emit("insidir:status-error",e.message);}
}

/* ---------- watchlist: each saved ticker with its latest imported transaction ----------
   The market-wide feed is the 100 most recent transactions by trade date, so a watched ticker's
   newest row is in it whenever the ticker traded recently. For the (at most 8) displayed tickers
   that are not in it, ask /v1/transactions?ticker=X&limit=1 for that ticker's own latest row. */
const WATCH_ROWS=8;
const dated=x=>validDate(x?.transaction_date)||validDate(x?.published_at);
function latestFor(t){
 if(!Array.isArray(state.trades))return null;
 let best=null;
 for(const x of state.trades){
  if(tick(x.ticker)!==t)continue;
  const d=dated(x),b=best&&dated(best);
  if(!best||(d&&(!b||d>b)))best=x;
 }
 return best;
}
const latestRow=t=>latestFor(t)||state.latest.get(t)?.row||null;
const issuerFor=t=>{for(const x of [...(state.trades||[]),...(state.filings||[]),...[...state.latest.values()].map(v=>v.row).filter(Boolean)])if(tick(x.ticker)===t&&x.issuer_name)return x.issuer_name;return "";};
const watched=()=>(state.watchlist||[]).map(x=>tick(x.ticker)).filter(Boolean);
function lookupMissing(){
 if(!state.watchlist||(!Array.isArray(state.trades)&&!state.tradesError))return; // wait for the shared feed first
 for(const t of watched().slice(0,WATCH_ROWS)){
  if(latestFor(t)||state.latest.has(t))continue;
  state.latest.set(t,{pending:true});
  api("/v1/transactions?ticker="+encodeURIComponent(t)+"&limit=1")
   .then(j=>state.latest.set(t,{row:items(j).find(x=>tick(x.ticker)===t)||null}),e=>state.latest.set(t,{error:e}))
   .finally(renderWatchlist);
 }
}
/* "12,500 sh × $26.00 = $325,000", with whatever parts the filing reported. */
const terms=x=>{const s=sharesOf(x),p=priceOf(x),v=valueOf(x),bits=[];
 if(s!==null)bits.push('<span class="rd-nb">'+E(QTY.format(Math.abs(s)))+' sh'+(p!==null&&p>0?' × '+E(price(p)):'')+'</span>');
 if(v!==null)bits.push('<span class="rd-nb">'+(s!==null&&p!==null&&p>0?'= ':'')+E(money(v))+'</span>');
 return bits.join(" ");};
function renderWatchlist(){
 const host=$("v3-watchlist");if(!host)return;
 if(state.watchError){host.innerHTML=failBlock("watchlist",state.watchError);return;}
 if(!state.watchlist)return;
 const arr=watched();
 if(!arr.length){host.innerHTML='<p class="rd-empty">Your watchlist is empty. <a href="watchlist.html">Add the companies you follow</a> and their latest insider transactions will show here.</p>';return;}
 host.innerHTML=arr.slice(0,WATCH_ROWS).map(t=>{
  const x=latestRow(t),name=issuerFor(t),look=state.latest.get(t);
  let detail;
  // Dates and amounts never break inside; a line can only end after a "·" separator.
  if(x){const lag=lagOf(x),deal=terms(x);
   detail=badge(x)+' '+E(shown(x.owner_name))+(deal?'&nbsp;· '+deal:'')+
    '<small>Traded <span class="rd-nb">'+E(date(x.transaction_date))+'</span>'+(validDate(x.published_at)?'&nbsp;· filed <span class="rd-nb">'+E(date(x.published_at))+'</span>'+(lag!==null?' <span class="rd-nb">('+E(lagText(lag))+')</span>':''):'')+'</small>';}
  else if(!look||look.pending)detail='<span class="rd-muted">Checking the latest transaction…</span>';
  else if(look.error)detail='<span class="rd-muted">Latest transaction unavailable right now</span>';
  else detail='<span class="rd-muted">No imported insider transactions yet</span>';
  return '<a class="rd-row rd-row--watch" href="'+E(companyHref(t))+'">'+logo(t)+'<span class="rd-row__id"><strong>'+E(t)+'</strong>'+(name?'<small>'+E(name)+'</small>':'')+'</span><span class="rd-row__detail">'+detail+'</span><b aria-hidden="true">↗</b></a>';
 }).join("")+(arr.length>WATCH_ROWS?'<p class="rd-more"><a href="watchlist.html">'+(arr.length-WATCH_ROWS)+' more on your watchlist</a></p>':'');
 media?.hydrate(host);
 lookupMissing();
}
async function loadWatchlist(){
 state.watchError=null;clearFailedLookups();
 try{state.watchlist=items(await api("/v1/me/watchlist"));}
 catch(e){state.watchlist=null;state.watchError=e;}
 renderWatchlist();
}

/* ---------- research notes ---------- */
async function loadNotes(){
 const host=$("v3-notes");if(!host)return;
 try{
  const arr=items(await api("/v1/me/research-decisions")).filter(x=>tick(x.ticker));
  host.innerHTML=arr.length?arr.slice(0,6).map(x=>{
   const note=String(x.notes||"").replace(/\s+/g," ").trim();
   return '<a class="rd-row rd-row--note" href="'+E(researchHref(x.ticker))+'"><span class="rd-row__id"><strong>'+E(tick(x.ticker))+'</strong><small>'+E(STATUS[x.review_status||x.reviewStatus]||"Note")+'</small></span><span class="rd-row__detail">'+(note?E(note.length>96?note.slice(0,95)+"…":note):'<span class="rd-muted">No written note</span>')+'<small>Updated '+E(date(x.updated_at||x.created_at))+'</small></span><b aria-hidden="true">↗</b></a>';
  }).join("")+(arr.length>6?'<p class="rd-more"><a href="research.html">All '+arr.length+' notes on the research desk</a></p>':''):'<p class="rd-empty">No research notes yet. <a href="research.html">Open the research desk</a> to record what you are reviewing and why.</p>';
 }catch(e){host.innerHTML=failBlock("notes",e);}
}

const loaders={trades:loadTrades,filings:loadFilings,watchlist:loadWatchlist,notes:loadNotes,status:loadStatus};
function greet(){
 const h=new Date().getHours(),g=document.querySelector("[data-greeting]");
 if(g)g.textContent=h>=5&&h<12?"Good morning.":h>=12&&h<18?"Good afternoon.":"Good evening.";
 const d=$("v3-current-date");if(d)d.innerHTML=E(new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date()))+'<span class="rd-topline__note"> · SEC records · original sources</span>';
}
document.addEventListener("DOMContentLoaded",()=>{
 greet();
 const form=$("v3-search"),input=$("v3-ticker");
 form?.addEventListener("submit",e=>{const t=tick(input.value);if(!t){e.preventDefault();input.setCustomValidity("Enter a ticker symbol such as AAPL");input.reportValidity();return;}input.value=t;});
 input?.addEventListener("input",()=>input.setCustomValidity(""));
 document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{state.filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderTrades();}));
 document.addEventListener("click",e=>{const b=e.target.closest?.("button[data-retry]");if(!b)return;const key=b.dataset.retry;b.disabled=true;b.textContent="Loading…";if(key==="filings")loadStatus();void loaders[key]?.();});
 void Promise.allSettled([loadTrades(),loadFilings(),loadWatchlist(),loadNotes(),loadStatus()]);
});
})();
