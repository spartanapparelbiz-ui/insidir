/* Insider flow and the data-source panel on the overview (dashboard.html).
   Zero extra API calls: everything is derived from the rows v3-dashboard.js announces with
   insidir:transactions-loaded (the newest 100 imported Form 4 transactions by trade date),
   insidir:filings-loaded and insidir:status-loaded, using its formatters (window.InsidirDesk).

   What is drawn, and from what:
     - totals: purchases and sales (count, shares, reported value), net value, transactions under
       other codes (grants, exercises, gifts: no market price), and the filing lag from trade date
       to SEC publication;
     - value by trade date: a diverging column chart, purchases above the zero line in green and
       sales below it in red, with a hover/focus readout per day and a table of every day;
     - by company: sales to the left, purchases to the right, largest gross value first;
     - largest reported transactions: ranked by shares × price per share as filed.
   Only priced purchases (code P) and sales (code S) carry value; nothing is estimated. Every
   figure names its scope: the transactions loaded, not the whole market. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const D=()=>window.InsidirDesk;
const set=(id,text)=>{const el=$(id);if(el)el.textContent=text;};

/* ---------- derive ---------- */
function derive(rows){
 const d=D(),out={rows,buys:[],sells:[],others:[],buyValue:0,sellValue:0,buyShares:0,sellShares:0,buyUnpriced:0,sellUnpriced:0,
  lags:[],companies:new Set(),people:new Set(),first:null,last:null,days:new Map(),byCompany:new Map(),priced:[],otherCodes:new Map()};
 for(const x of rows){
  const k=d.kind(x),v=d.valueOf(x),s=d.sharesOf(x),t=d.tick(x.ticker),when=d.validDate(x.transaction_date),lag=d.lagOf(x);
  if(t)out.companies.add(t);
  const who=String(x.owner_cik||x.owner_name||"").trim();if(who)out.people.add(who);
  if(when){if(!out.first||when<out.first)out.first=when;if(!out.last||when>out.last)out.last=when;}
  if(lag!==null)out.lags.push(lag);
  if(k==="other"){out.others.push(x);const c=d.code(x)||"?";out.otherCodes.set(c,(out.otherCodes.get(c)||0)+1);continue;}
  const priced=v!==null&&v>0;
  if(k==="buy"){out.buys.push(x);if(s!==null)out.buyShares+=Math.abs(s);if(priced)out.buyValue+=v;else out.buyUnpriced++;}
  else{out.sells.push(x);if(s!==null)out.sellShares+=Math.abs(s);if(priced)out.sellValue+=v;else out.sellUnpriced++;}
  if(!priced)continue;
  out.priced.push(x);
  if(when){const key=when.toISOString().slice(0,10),e=out.days.get(key)||{key,buy:0,sell:0,nb:0,ns:0};if(k==="buy"){e.buy+=v;e.nb++;}else{e.sell+=v;e.ns++;}out.days.set(key,e);}
  if(t){const e=out.byCompany.get(t)||{t,name:"",buy:0,sell:0,nb:0,ns:0};if(!e.name&&x.issuer_name)e.name=String(x.issuer_name);if(k==="buy"){e.buy+=v;e.nb++;}else{e.sell+=v;e.ns++;}out.byCompany.set(t,e);}
 }
 out.net=out.buyValue-out.sellValue;
 out.lags.sort((a,b)=>a-b);
 return out;
}
const median=a=>!a.length?null:a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;
const days=n=>n===null?"":(Number.isInteger(n)?String(n):n.toFixed(1))+(n===1?" day":" days");

/* ---------- scope line ---------- */
function scope(f){
 const d=D(),n=f.rows.length,el=$("rd-flow-scope");if(!el)return;
 if(!n){el.textContent="Reported Form 4 purchases and sales in the latest imported transactions.";return;}
 const range=f.first&&f.last?(d.date(f.first)===d.date(f.last)?"traded "+d.date(f.first):"traded "+(f.first.getUTCFullYear()===f.last.getUTCFullYear()?d.shortDate(f.first):d.date(f.first))+" – "+d.date(f.last)):"";
 el.textContent=[(n>=100?"The latest "+d.count(n):"All "+d.plural(n,"imported transaction"))+(n>=100?" imported transactions":""),range,d.plural(f.companies.size,"company","companies"),d.plural(f.people.size,"reporting person","reporting people")].filter(Boolean).join(" · ")+".";
}

/* ---------- totals ---------- */
function tile(cls,label,value,note,title){
 const d=D();
 return '<div class="rd-kpi '+cls+'"'+(title?' title="'+d.E(title)+'"':'')+'><p class="rd-kpi__label">'+label+'</p><p class="rd-kpi__value">'+value+'</p><p class="rd-kpi__note">'+note+'</p></div>';
}
function kpis(f){
 const d=D(),E=d.E,host=$("rd-kpis");if(!host)return;
 if(!f.rows.length){host.innerHTML='<p class="rd-empty">No imported Form 4 transactions yet. Purchases, sales and their values appear here after the next SEC import.</p>';return;}
 const side=(list,value,shares,unpriced,word)=>E(d.plural(list.length,word))+(list.length?" · "+E(d.qty(shares))+" shares":"")+(unpriced?' · <span class="rd-nb">'+E(unpriced+" without a price")+'</span>':"");
 const netCls=f.net>0?"rd-kpi__value--up":f.net<0?"rd-kpi__value--down":"";
 const netWord=!f.buyValue&&!f.sellValue?"No priced purchases or sales":f.net>0?"Purchases exceeded sales":f.net<0?"Sales exceeded purchases":"Purchases equal sales";
 const codes=[...f.otherCodes].sort((a,b)=>b[1]-a[1]).map(([c,n])=>c+" ("+n+")");
 const med=median(f.lags);
 host.innerHTML=
  tile("rd-kpi--buy",d.tri("buy")+"Purchases",E(d.money(f.buyValue)),side(f.buys,f.buyValue,f.buyShares,f.buyUnpriced,"purchase"),"Code P: open market or private purchases, value = shares × price per share as filed")+
  tile("rd-kpi--sell",d.tri("sell")+"Sales",E(d.money(f.sellValue)),side(f.sells,f.sellValue,f.sellShares,f.sellUnpriced,"sale"),"Code S: open market or private sales, value = shares × price per share as filed")+
  tile("rd-kpi--net","Net value",'<span class="'+netCls+'">'+(f.net?d.tri(f.net>0?"buy":"sell"):"")+E(d.signedMoney(f.net))+'</span>',E(netWord),"Reported purchase value minus reported sale value")+
  tile("rd-kpi--other","Other codes",E(d.count(f.others.length)),f.others.length?E("Codes "+codes.join(", ")):"None in this window",f.others.length?codes.map(c=>c.slice(0,1)+" — "+d.codeMeaning(c.slice(0,1))).join("; "):"")+
  tile("rd-kpi--lag","Filing lag",med===null?'<span class="rd-muted">—</span>':E(days(med)),med===null?"No dated filings":E("Median, trade to SEC publication · range "+f.lags[0]+"–"+f.lags[f.lags.length-1]+(f.lags[f.lags.length-1]===1?" day":" days")),"Form 4 is generally due within two business days of the transaction");
}

/* ---------- value by trade date ---------- */
const STEPS=[1,2,2.5,5,10];
function niceStep(max,parts){const raw=max/parts,mag=Math.pow(10,Math.floor(Math.log10(raw)));const n=raw/mag;return STEPS.find(s=>s>=n-1e-9)*mag;}
let last=null,lastLimit=0;
const limitFor=w=>w>=900?14:w>=640?10:w>=480?8:6;
function daily(f){
 const d=D(),E=d.E,host=$("rd-daily-chart"),toggle=$("rd-daily-toggle"),table=$("rd-daily-table");if(!host)return;
 const all=[...f.days.values()].sort((a,b)=>a.key.localeCompare(b.key));
 if(!all.length){
  host.innerHTML='<p class="rd-empty">'+(f.rows.length?"No priced purchases or sales in the "+d.plural(f.rows.length,"loaded transaction")+" to chart.":"No dated transactions to chart yet. The chart fills in as SEC filings are imported.")+'</p>';
  if(toggle)toggle.hidden=true;if(table){table.hidden=true;table.innerHTML="";}
  return;
 }
 const limit=lastLimit=limitFor(host.clientWidth||960),shown=all.slice(-limit);
 const top=Math.max(0,...shown.map(x=>x.buy)),bot=Math.max(0,...shown.map(x=>x.sell));
 const step=niceStep(Math.max(top,bot),2),topMax=top>0?Math.ceil(top/step-1e-9)*step:0,botMax=bot>0?Math.ceil(bot/step-1e-9)*step:0;
 const H=host.clientWidth&&host.clientWidth<560?200:280,pad=24,inner=H-pad*2;
 // An empty side keeps a sliver of room so its zero line and label never touch the edge.
 const span=(topMax||step*.15)+(botMax||step*.15),px=inner/span,zero=pad+(topMax||step*.15)*px;
 const ticks=[];for(let v=topMax;v>-botMax-1e-9;v-=step)ticks.push(Math.abs(v)<1e-9?0:v);if(!ticks.includes(0))ticks.push(0);
 if(botMax)ticks.push(-botMax);
 const tickSet=[...new Set(ticks.map(v=>+v.toFixed(2)))].sort((a,b)=>b-a);
 const y=v=>zero-v*px;
 const maxBuy=shown.reduce((m,x)=>x.buy>(m?.buy||0)?x:m,null),maxSell=shown.reduce((m,x)=>x.sell>(m?.sell||0)?x:m,null);
 const label=x=>d.date(x.key+"T00:00:00Z")+": purchases "+d.money(x.buy)+" ("+d.plural(x.nb,"transaction")+"), sales "+d.money(x.sell)+" ("+d.plural(x.ns,"transaction")+"), net "+d.signedMoney(x.buy-x.sell);
 host.innerHTML=
  '<div class="rd-legend" aria-hidden="true"><span><i class="rd-swatch rd-swatch--up"></i>Purchases</span><span><i class="rd-swatch rd-swatch--down"></i>Sales</span><span class="rd-legend__scope">'+E(shown.length<all.length?"Latest "+shown.length+" of "+all.length+" trade days":d.plural(all.length,"trade day"))+'</span></div>'+
  '<div class="rd-dchart__frame" style="height:'+H+'px">'+
   '<div class="rd-dchart__axis" aria-hidden="true">'+tickSet.map(v=>'<span style="top:'+y(v).toFixed(1)+'px">'+E(v===0?"$0":(v>0?"+":d.MINUS)+d.compactMoney(Math.abs(v)))+'</span>').join("")+'</div>'+
   '<div class="rd-dchart__plot">'+
    tickSet.map(v=>'<i class="rd-dchart__grid'+(v===0?" rd-dchart__grid--zero":"")+'" style="top:'+y(v).toFixed(1)+'px" aria-hidden="true"></i>').join("")+
    '<ul class="rd-dchart__cols" aria-label="'+E("Reported value by trade date, "+shown.length+" days")+'">'+shown.map((x,i)=>{
     const hb=x.buy?Math.max(2,x.buy*px):0,hs=x.sell?Math.max(2,x.sell*px):0;
     return '<li class="rd-day" tabindex="0" data-day="'+i+'" aria-label="'+E(label(x))+'">'+
      (hb?'<span class="rd-day__bar rd-day__bar--up" style="top:'+(zero-hb).toFixed(1)+'px;height:'+hb.toFixed(1)+'px"></span>':'')+
      (hs?'<span class="rd-day__bar rd-day__bar--down" style="top:'+zero.toFixed(1)+'px;height:'+hs.toFixed(1)+'px"></span>':'')+
      (x===maxBuy&&x.buy?'<span class="rd-day__val rd-day__val--up" style="top:'+(zero-hb-17).toFixed(1)+'px">'+E(d.compactMoney(x.buy))+'</span>':'')+
      (x===maxSell&&x.sell?'<span class="rd-day__val rd-day__val--down" style="top:'+(zero+hs+3).toFixed(1)+'px">'+E(d.compactMoney(x.sell))+'</span>':'')+
     '</li>';}).join("")+'</ul>'+
   '</div>'+
  '</div>'+
  '<div class="rd-dchart__x" aria-hidden="true">'+shown.map(x=>{const [m,dd]=d.shortDate(x.key+"T00:00:00Z").split(" ");return '<span><b>'+E(m)+'</b> '+E(dd)+'</span>';}).join("")+'</div>';
 host._days=shown;
 if(toggle)toggle.hidden=false;
 if(table){
  table.innerHTML='<table class="rd-table rd-table--days"><caption class="sr-only">Reported value by trade date</caption><thead><tr><th scope="col">Trade date</th><th scope="col" class="rd-num">Purchases</th><th scope="col" class="rd-num">Sales</th><th scope="col" class="rd-num">Net</th></tr></thead><tbody>'+
   all.slice().reverse().map(x=>'<tr><td data-label="Trade date" class="rd-nb">'+E(d.date(x.key+"T00:00:00Z"))+'</td><td data-label="Purchases" class="rd-num">'+E(d.money(x.buy))+' <span class="rd-muted">('+x.nb+')</span></td><td data-label="Sales" class="rd-num">'+E(d.money(x.sell))+' <span class="rd-muted">('+x.ns+')</span></td><td data-label="Net" class="rd-num"><span class="rd-qty rd-qty--'+(x.buy-x.sell>0?"buy":x.buy-x.sell<0?"sell":"other")+'">'+E(d.signedMoney(x.buy-x.sell))+'</span></td></tr>').join("")+
   '</tbody></table>';
 }
}

/* One readout for the hovered or focused day: values lead, labels follow. */
function showTip(li){
 const d=D(),tip=$("rd-tip"),host=$("rd-daily-chart"),x=host?._days?.[Number(li.dataset.day)];if(!tip||!x)return;
 tip.replaceChildren();
 const head=document.createElement("p");head.className="rd-tip__date";head.textContent=d.date(x.key+"T00:00:00Z");tip.append(head);
 for(const [cls,word,v,n] of [["up","Purchases",x.buy,x.nb],["down","Sales",x.sell,x.ns]]){
  const row=document.createElement("p");row.className="rd-tip__row";
  const key=document.createElement("i");key.className="rd-tip__key rd-tip__key--"+cls;key.setAttribute("aria-hidden","true");
  const val=document.createElement("strong");val.textContent=d.money(v);
  const lab=document.createElement("span");lab.textContent=word+" · "+n;
  row.append(key,val,lab);tip.append(row);
 }
 const net=document.createElement("p");net.className="rd-tip__net";net.textContent="Net "+d.signedMoney(x.buy-x.sell);tip.append(net);
 tip.hidden=false;
 const r=li.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
 const left=Math.min(Math.max(8,r.left+r.width/2-w/2),innerWidth-w-8),top=r.top-h-8<8?r.bottom+8:r.top-h-8;
 tip.style.left=left+"px";tip.style.top=top+"px";
 li.classList.add("is-active");
}
function hideTip(li){const tip=$("rd-tip");if(tip)tip.hidden=true;li?.classList.remove("is-active");}

/* ---------- by company ---------- */
function companies(f){
 const d=D(),E=d.E,host=$("rd-companies");if(!host)return;
 const list=[...f.byCompany.values()].sort((a,b)=>(b.buy+b.sell)-(a.buy+a.sell)||a.t.localeCompare(b.t)).slice(0,6);
 if(!list.length){host.innerHTML='<p class="rd-empty">'+(f.rows.length?"No priced purchases or sales to compare by company.":"No companies yet. They appear after the next SEC import.")+'</p>';return;}
 const max=Math.max(...list.map(x=>Math.max(x.buy,x.sell)));
 const pct=v=>v?Math.max(1.5,v/max*100).toFixed(2):"0";
 host.innerHTML='<div class="rd-co__head" aria-hidden="true"><span></span><span class="rd-co__side rd-co__side--sell"><i class="rd-tri rd-tri--down"></i>Sales</span><span class="rd-co__side"><i class="rd-tri rd-tri--up"></i>Purchases</span><span class="rd-num">Net</span></div>'+
  '<ul class="rd-co__list">'+list.map(x=>{
   const net=x.buy-x.sell;
   return '<li class="rd-co__row">'+
    '<a class="rd-co__id" href="'+E(d.companyHref(x.t))+'">'+d.logo(x.t)+'<span><strong>'+E(x.t)+'</strong>'+(x.name?'<small>'+E(x.name)+'</small>':'')+'</span></a>'+
    '<span class="rd-co__track rd-co__track--sell" aria-hidden="true"><span class="rd-co__bar rd-co__bar--down" style="width:'+pct(x.sell)+'%"></span></span>'+
    '<span class="rd-co__track rd-co__track--buy" aria-hidden="true"><span class="rd-co__bar rd-co__bar--up" style="width:'+pct(x.buy)+'%"></span></span>'+
    '<span class="rd-co__net rd-num"><span class="rd-qty rd-qty--'+(net>0?"buy":net<0?"sell":"other")+'">'+E(d.signedMoney(net))+'</span></span>'+
    '<span class="rd-co__detail">'+[x.ns?'Sold <span class="rd-nb">'+E(d.money(x.sell))+'</span> in '+E(d.plural(x.ns,"sale")):"",x.nb?'Bought <span class="rd-nb">'+E(d.money(x.buy))+'</span> in '+E(d.plural(x.nb,"purchase")):""].filter(Boolean).join(" · ")+'</span>'+
   '</li>';}).join("")+'</ul>'+
  (f.byCompany.size>list.length?'<p class="rd-more">'+E(f.byCompany.size-list.length)+' more '+(f.byCompany.size-list.length===1?"company":"companies")+' with priced transactions in this window.</p>':'');
 window.InsidirMedia?.hydrate(host);
}

/* ---------- largest reported transactions ---------- */
function largest(f){
 const d=D(),E=d.E,host=$("rd-largest");if(!host)return;
 const list=f.priced.slice().sort((a,b)=>d.valueOf(b)-d.valueOf(a)).slice(0,6);
 if(!list.length){host.innerHTML='<li class="rd-empty">'+(f.rows.length?"No priced purchases or sales among the loaded transactions.":"No imported transactions yet.")+'</li>';return;}
 const max=d.valueOf(list[0]);
 host.innerHTML=list.map((x,i)=>{
  const k=d.kind(x),v=d.valueOf(x),p=d.priceOf(x),s=d.sharesOf(x),lag=d.lagOf(x),t=d.tick(x.ticker);
  return '<li class="rd-big rd-big--'+k+'">'+
   '<span class="rd-big__rank">'+String(i+1).padStart(2,"0")+'</span>'+
   '<span class="rd-big__value">'+E(d.money(v))+'</span>'+
   '<span class="rd-big__bar" aria-hidden="true"><span style="width:'+Math.max(1.5,v/max*100).toFixed(2)+'%"></span></span>'+
   '<span class="rd-big__what">'+d.badge(x)+(t?' <a href="'+E(d.companyHref(t))+'">'+E(t)+'</a>':'')+' <a href="'+E(d.personHref(x.owner_name))+'">'+E(d.shown(x.owner_name))+'</a></span>'+
   '<span class="rd-big__terms"><span class="rd-nb">'+E(s!==null?d.qty(Math.abs(s))+" sh":"")+(p!==null?" × "+d.price(p):"")+'</span> · <span class="rd-nb">traded '+E(d.date(x.transaction_date))+'</span>'+(d.validDate(x.published_at)?' · <span class="rd-nb">filed '+E(d.date(x.published_at))+(lag!==null?" ("+d.lagText(lag)+")":"")+'</span>':'')+'</span>'+
   '<a class="rd-arrow" href="'+E(d.filingHref(x.accession))+'" aria-label="'+E("Open the filing: "+(t||"")+" "+d.shown(x.owner_name)+" "+d.money(v))+'">Filing ↗</a>'+
  '</li>';
 }).join("");
}

function render(rows){
 if(!D())return;
 const f=last=derive(rows);
 scope(f);kpis(f);daily(f);companies(f);largest(f);
}
function fail(e){
 const msg=e&&e.message?e.message:String(e||"The transaction feed did not load");
 const status=e&&e.status,canRetry=status!==401&&status!==402;
 const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const k=$("rd-kpis");if(k)k.innerHTML='<p class="rd-empty rd-empty--error" role="alert">Insider flow is unavailable: '+E(msg)+(canRetry?' <button type="button" class="rd-retry" data-retry="trades">Try again</button>':'')+'</p>';
 const c=$("rd-daily-chart");if(c)c.innerHTML='<p class="rd-empty rd-empty--error">The chart is unavailable until the transactions load.</p>';
 const t=$("rd-daily-toggle");if(t)t.hidden=true;
 const tb=$("rd-daily-table");if(tb){tb.hidden=true;tb.innerHTML="";}
 const co=$("rd-companies");if(co)co.innerHTML='<p class="rd-empty rd-empty--error">Companies are unavailable until the transactions load.</p>';
 const l=$("rd-largest");if(l)l.innerHTML='<li class="rd-empty rd-empty--error">Transactions are unavailable right now.</li>';
}

document.addEventListener("insidir:transactions-loaded",e=>render(Array.isArray(e.detail)?e.detail:[]));
document.addEventListener("insidir:transactions-error",e=>{last=null;fail(e.detail);});
let resizeTimer=0;
addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const host=$("rd-daily-chart");if(last&&host&&limitFor(host.clientWidth||960)!==lastLimit)daily(last);},150);});
document.addEventListener("DOMContentLoaded",()=>{
 const host=$("rd-daily-chart"),toggle=$("rd-daily-toggle"),table=$("rd-daily-table");
 host?.addEventListener("pointerover",e=>{const li=e.target.closest?.(".rd-day");if(li)showTip(li);});
 host?.addEventListener("pointerout",e=>{const li=e.target.closest?.(".rd-day");if(li&&!li.contains(e.relatedTarget))hideTip(li);});
 host?.addEventListener("focusin",e=>{const li=e.target.closest?.(".rd-day");if(li)showTip(li);});
 host?.addEventListener("focusout",e=>{const li=e.target.closest?.(".rd-day");if(li)hideTip(li);});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){const li=document.querySelector(".rd-day.is-active");if(li)hideTip(li);}});
 addEventListener("scroll",()=>{const li=document.querySelector(".rd-day.is-active");if(li)hideTip(li);},{passive:true});
 toggle?.addEventListener("click",()=>{const open=toggle.getAttribute("aria-expanded")!=="true";toggle.setAttribute("aria-expanded",String(open));toggle.textContent=open?"Hide the numbers":"Show the numbers";if(table)table.hidden=!open;});
});

/* ---------- data source ---------- */
const valid=x=>{if(!x)return null;const d=new Date(x);return Number.isNaN(d.getTime())?null:d;};
const date=x=>{const d=valid(x);return d?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported";};
const stamp=x=>{const d=valid(x);return d?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"UTC"}).format(d)+" UTC":"Not reported";};
const count=n=>new Intl.NumberFormat("en-US").format(n);
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
 if(state)state.innerHTML="Unavailable"+(why?" · "+String(why).replace(/[&<>"']/g,""):"")+' <button type="button" class="rd-retry" data-retry="status">Try again</button>';
 set("v4-filing-count","Unavailable");set("v4-last-import","Unavailable");
});
})();
