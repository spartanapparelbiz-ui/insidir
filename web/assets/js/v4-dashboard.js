/* Insider flow and the data-source panel on the overview (dashboard.html).
   Zero extra API calls: everything is derived from the rows v3-dashboard.js announces with
   insidir:transactions-loaded (the newest 100 imported Form 4 transactions by trade date),
   insidir:filings-loaded and insidir:status-loaded, using its formatters (window.InsidirDesk).

   What is drawn, and from what:
     - totals: purchases and sales (count, shares, reported value), net value, transactions under
       other codes (grants, exercises, gifts, derivative trades: no market value counted), and the
       filing lag from trade date to the SEC filing date (Eastern calendar day), original filings only;
     - value by trade date: a diverging column chart, purchases above the zero line in green and
       sales below it in red, with a hover/focus readout per day and a table of every day;
     - by company (grouped by SEC issuer CIK): sales to the left, purchases to the right, largest
       gross value first, all on one shared zero line;
     - largest reported transactions: ranked by shares × price per share as filed.
   Only priced non-derivative purchases (code P) and sales (code S) carry value; nothing is estimated.
   An amended Form 4/A line replaces the earlier copy of the same line instead of being counted twice.
   Every figure names its scope: the transactions loaded, not the whole market. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const D=()=>window.InsidirDesk;
const set=(id,text)=>{const el=$(id);if(el)el.textContent=text;};

/* Short names for the codes counted under "Other codes" (the full SEC wording is in the tile's title
   and under the transactions table). */
const SHORT={A:"grant or award",D:"returned to issuer",F:"shares for tax or exercise",G:"gift",M:"derivative exercise",C:"conversion",
 E:"short derivative expired",H:"long derivative expired",O:"out-of-the-money exercise",X:"in-the-money exercise",I:"discretionary",
 L:"small acquisition",W:"will or inheritance",Z:"voting trust",J:"other",K:"equity swap",U:"tender offer",V:"early voluntary report",
 P:"purchase",S:"sale"};

/* ---------- derive ---------- */
function derive(rows){
 const d=D(),out={rows,buys:[],sells:[],others:[],buyValue:0,sellValue:0,buyShares:0,sellShares:0,buyUnpriced:0,sellUnpriced:0,
  lags:[],companies:new Set(),people:new Set(),first:null,last:null,days:new Map(),undated:0,byCompany:new Map(),priced:[],otherCodes:new Map(),replaced:0};
 // A 4/A restates lines of an earlier filing; keep the newest copy of each line.
 const same=x=>[x.owner_cik||x.owner_name,x.issuer_cik||x.ticker,x.transaction_date,d.code(x),String(x.acquired_disposed||""),!!x.derivative,d.sharesOf(x)].join("|");
 const amendedAt=new Map();
 for(const x of rows)if(x.is_amendment){const p=d.validDate(x.published_at),k=same(x);if(p&&(!amendedAt.has(k)||p>amendedAt.get(k)))amendedAt.set(k,p);}
 const kept=rows.filter(x=>x.is_amendment||!(amendedAt.get(same(x))>(d.validDate(x.published_at)||0)));
 out.replaced=rows.length-kept.length;
 // Filing lag is the original filing's: an amendment is filed later by design.
 for(const x of rows)if(!x.is_amendment){const l=d.lagOf(x);if(l!==null)out.lags.push(l);}
 for(const x of kept){
  const k=d.kind(x),v=d.valueOf(x),s=d.sharesOf(x),t=d.tick(x.ticker),ck=String(x.issuer_cik||"").trim()||t||String(x.issuer_name||"").trim(),when=d.validDate(x.transaction_date);
  if(ck)out.companies.add(ck);
  const who=String(x.owner_cik||x.owner_name||"").trim();if(who)out.people.add(who);
  if(when){if(!out.first||when<out.first)out.first=when;if(!out.last||when>out.last)out.last=when;}
  if(k==="other"){
   out.others.push(x);
   const c0=d.code(x)||"?",c=(c0==="P"||c0==="S")&&x.derivative?c0+" derivative":c0;
   out.otherCodes.set(c,(out.otherCodes.get(c)||0)+1);continue;
  }
  const priced=v!==null&&v>0;
  if(k==="buy"){out.buys.push(x);if(s!==null)out.buyShares+=Math.abs(s);if(priced)out.buyValue+=v;else out.buyUnpriced++;}
  else{out.sells.push(x);if(s!==null)out.sellShares+=Math.abs(s);if(priced)out.sellValue+=v;else out.sellUnpriced++;}
  if(!priced)continue;
  out.priced.push(x);
  if(when){const key=when.toISOString().slice(0,10),e=out.days.get(key)||{key,buy:0,sell:0,nb:0,ns:0};if(k==="buy"){e.buy+=v;e.nb++;}else{e.sell+=v;e.ns++;}out.days.set(key,e);}
  else out.undated++;
  if(ck){const e=out.byCompany.get(ck)||{t,name:"",buy:0,sell:0,nb:0,ns:0};if(!e.t&&t)e.t=t;if(!e.name&&x.issuer_name)e.name=String(x.issuer_name);if(k==="buy"){e.buy+=v;e.nb++;}else{e.sell+=v;e.ns++;}out.byCompany.set(ck,e);}
 }
 out.net=out.buyValue-out.sellValue;
 out.lags.sort((a,b)=>a-b);
 return out;
}
const median=a=>!a.length?null:a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;
const days=n=>n===null?"":(Number.isInteger(n)?String(n):n.toFixed(1))+(n===1?" day":" days");
const nb=(E,text)=>'<span class="rd-nb">'+E(text)+'</span>';

/* ---------- scope line ---------- */
function scope(f){
 const d=D(),n=f.rows.length,el=$("rd-flow-scope");if(!el)return;
 if(!n){el.textContent="Reported Form 4 purchases and sales in the latest imported transactions.";return;}
 const range=f.first&&f.last?(d.date(f.first)===d.date(f.last)?"traded "+d.date(f.first):"traded "+(f.first.getUTCFullYear()===f.last.getUTCFullYear()?d.shortDate(f.first):d.date(f.first))+" – "+d.date(f.last)):"";
 el.textContent=[(n>=100?"The latest "+d.count(n)+" imported transactions":"All "+d.plural(n,"imported transaction")),range,d.plural(f.companies.size,"company","companies"),d.plural(f.people.size,"reporting person","reporting people"),
  f.replaced?d.plural(f.replaced,"amended line replaces its original","amended lines replace their originals"):""].filter(Boolean).join(" · ")+".";
}

/* ---------- totals ---------- */
function tile(cls,label,value,note,title){
 const d=D();
 return '<div class="rd-kpi '+cls+'"'+(title?' title="'+d.E(title)+'"':'')+'><p class="rd-kpi__label">'+label+'</p><p class="rd-kpi__value">'+value+'</p><p class="rd-kpi__note">'+note+'</p></div>';
}
function kpis(f){
 const d=D(),E=d.E,host=$("rd-kpis");if(!host)return;
 if(!f.rows.length){host.innerHTML='<p class="rd-empty">No imported Form 4 transactions yet. Purchases, sales and their values appear here after the next SEC import.</p>';return;}
 const side=(list,shares,unvalued,word)=>E(d.plural(list.length,word))+(list.length?'&nbsp;· '+nb(E,d.qty(shares)+" shares"):"")+(unvalued?'&nbsp;· '+nb(E,unvalued+" without a value"):"");
 const netCls=f.net>0?"rd-kpi__value--up":f.net<0?"rd-kpi__value--down":"";
 const netWord=!f.buyValue&&!f.sellValue?"No priced purchases or sales":f.net>0?"Purchases exceeded sales":f.net<0?"Sales exceeded purchases":"Purchases equal sales";
 const codes=[...f.otherCodes].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const codeName=c=>/derivative$/.test(c)?"derivative "+SHORT[c.slice(0,1)]:SHORT[c]||"code "+c;
 const codeTitle=c=>c.slice(0,1)+" — "+d.codeMeaning(c.slice(0,1))+(/derivative$/.test(c)?" (on a derivative security, such as options or warrants)":"");
 const lo=f.lags[0],hi=f.lags[f.lags.length-1],med=median(f.lags);
 const lagNote=med===null?"No dated filings":lo===hi?(f.lags.length===1?"Trade to SEC filing, 1 dated transaction":"Trade to SEC filing, the same for all "+f.lags.length+" dated transactions"):"Median, trade to SEC filing&nbsp;· range "+nb(E,lo+"–"+days(hi));
 host.innerHTML=
  tile("rd-kpi--buy",d.tri("buy")+"Purchases",E(d.money(f.buyValue)),side(f.buys,f.buyShares,f.buyUnpriced,"purchase"),"Code P on non-derivative securities (shares acquired): value = shares × price per share as filed")+
  tile("rd-kpi--sell",d.tri("sell")+"Sales",E(d.money(f.sellValue)),side(f.sells,f.sellShares,f.sellUnpriced,"sale"),"Code S on non-derivative securities (shares disposed): value = shares × price per share as filed")+
  tile("rd-kpi--net","Net value",'<span class="'+netCls+'">'+(f.net?d.tri(f.net>0?"buy":"sell"):"")+E(d.signedMoney(f.net))+'</span>',E(netWord),"Reported purchase value minus reported sale value")+
  tile("rd-kpi--other","Other codes",E(d.count(f.others.length)),codes.length?codes.map(([c,n])=>E(c.slice(0,1)+" "+codeName(c)+"\u00a0("+n+")")).join(", "):"None in this window",codes.map(([c])=>codeTitle(c)).join("; "))+
  tile("rd-kpi--lag","Filing lag",med===null?'<span class="rd-muted">—</span>':E(days(med)),lagNote,"Calendar days from the trade date to the SEC filing date of the original Form 4; it is generally due within two business days");
 // One size for every figure, set by the longest, so a ten-digit total still fits its tile.
 host.style.setProperty("--rd-len",String(Math.max(...[...host.querySelectorAll(".rd-kpi__value")].map(v=>v.textContent.trim().length),8)));
}

/* ---------- value by trade date ---------- */
const STEPS=[1,2,2.5,5,10];
function niceStep(max,parts){const raw=max/parts,mag=Math.pow(10,Math.floor(Math.log10(raw)));const n=raw/mag;return STEPS.find(s=>s>=n-1e-9)*mag;}
let last=null,lastLimit=0,lastTight=null;
const limitFor=w=>w>=700?14:w>=560?12:w>=480?8:6;
const tightFor=(w,n)=>(w-64)/n<58;
function daily(f){
 const d=D(),E=d.E,host=$("rd-daily-chart"),toggle=$("rd-daily-toggle"),table=$("rd-daily-table");if(!host)return;
 const all=[...f.days.values()].sort((a,b)=>a.key.localeCompare(b.key));
 if(!all.length){
  host.innerHTML='<p class="rd-empty">'+(f.rows.length?"No priced purchases or sales in the "+d.plural(f.rows.length,"loaded transaction")+" to chart.":"No dated transactions to chart yet. The chart fills in as SEC filings are imported.")+'</p>';
  if(toggle)toggle.hidden=true;if(table){table.hidden=true;table.innerHTML="";}
  return;
 }
 const w=host.clientWidth||960,limit=lastLimit=limitFor(w),shown=all.slice(-limit);
 const top=Math.max(0,...shown.map(x=>x.buy)),bot=Math.max(0,...shown.map(x=>x.sell)),mx=Math.max(top,bot);
 // The nice step (1, 2, 2.5 or 5 × 10ⁿ) that wastes the least height over both sides, at most eight intervals;
 // a side that is tiny next to the other keeps a sliver, not a whole step.
 const fit=(v,st)=>v>st*.15?Math.ceil(v/st-1e-9)*st:0,extent=st=>fit(top,st)+fit(bot,st);
 const step=[2,3,4,5].map(p=>niceStep(mx,p)).filter((st,i,a)=>a.indexOf(st)===i&&extent(st)/st<=8).reduce((a,b)=>extent(b)<extent(a)?b:a);
 const sideMax=v=>fit(v,step),topMax=sideMax(top),botMax=sideMax(bot);
 // Desktop: as tall as the By company panel beside it, never shorter than 280px.
 const co=$("rd-companies"),beside=co&&matchMedia("(min-width:1180px)").matches?co.getBoundingClientRect().bottom-host.getBoundingClientRect().top-56:0;
 const H=w<560?200:Math.max(280,Math.min(520,Math.floor(beside))),pad=26,inner=H-pad*2;
 const span=(topMax||step*.15)+(botMax||step*.15),px=inner/span,zero=pad+(topMax||step*.15)*px;
 const ticks=[];for(let v=topMax;v>-botMax-1e-9;v-=step)ticks.push(Math.abs(v)<1e-9?0:v);if(!ticks.includes(0))ticks.push(0);
 if(botMax)ticks.push(-botMax);
 const tickSet=[...new Set(ticks.map(v=>+v.toFixed(2)))].sort((a,b)=>b-a);
 const y=v=>zero-v*px;
 const maxBuy=shown.reduce((m,x)=>x.buy>(m?.buy||0)?x:m,null),maxSell=shown.reduce((m,x)=>x.sell>(m?.sell||0)?x:m,null);
 const label=x=>d.date(x.key+"T00:00:00Z")+": purchases "+d.money(x.buy)+" ("+d.plural(x.nb,"transaction")+"), sales "+d.money(x.sell)+" ("+d.plural(x.ns,"transaction")+"), net "+d.signedMoney(x.buy-x.sell);
 const scopeText=(shown.length<all.length?"Latest "+shown.length+" of "+all.length+" trade days":d.plural(all.length,"trade day"))+(f.undated?" · "+f.undated+" undated not charted":"");
 host.innerHTML=
  '<div class="rd-legend" aria-hidden="true"><span><i class="rd-swatch rd-swatch--up"></i>Purchases</span><span><i class="rd-swatch rd-swatch--down"></i>Sales</span><span class="rd-legend__scope">'+E(scopeText)+'</span></div>'+
  '<div class="rd-dchart__frame" style="height:'+H+'px">'+
   '<div class="rd-dchart__axis" aria-hidden="true">'+tickSet.map(v=>'<span style="top:'+y(v).toFixed(1)+'px">'+E(v===0?"$0":(v>0?"+":d.MINUS)+d.compactMoney(Math.abs(v)))+'</span>').join("")+'</div>'+
   '<div class="rd-dchart__plot">'+
    tickSet.map(v=>'<i class="rd-dchart__grid'+(v===0?" rd-dchart__grid--zero":"")+'" style="top:'+y(v).toFixed(1)+'px" aria-hidden="true"></i>').join("")+
    '<ul class="rd-dchart__cols" aria-label="'+E("Reported value by trade date, "+scopeText.toLowerCase())+'">'+shown.map((x,i)=>{
     const hb=x.buy?Math.max(2,x.buy*px):0,hs=x.sell?Math.max(2,x.sell*px):0;
     return '<li class="rd-day" tabindex="0" data-day="'+i+'" aria-label="'+E(label(x))+'">'+
      (hb?'<span class="rd-day__bar rd-day__bar--up" style="top:'+(zero-hb).toFixed(1)+'px;height:'+hb.toFixed(1)+'px"></span>':'')+
      (hs?'<span class="rd-day__bar rd-day__bar--down" style="top:'+zero.toFixed(1)+'px;height:'+hs.toFixed(1)+'px"></span>':'')+
      (x===maxBuy&&x.buy?'<span class="rd-day__val rd-day__val--up" style="top:'+(zero-hb-18).toFixed(1)+'px">'+E(d.money(x.buy))+'</span>':'')+
      (x===maxSell&&x.sell?'<span class="rd-day__val rd-day__val--down" style="top:'+(zero+hs+4).toFixed(1)+'px">'+E(d.money(x.sell))+'</span>':'')+
     '</li>';}).join("")+'</ul>'+
   '</div>'+
  '</div>'+
  '<div class="rd-dchart__x" aria-hidden="true">'+shown.map(x=>{const [m,dd]=d.shortDate(x.key+"T00:00:00Z").split(" ");return '<span><b>'+E(m)+'</b> '+E(dd)+'</span>';}).join("")+'</div>';
 host._days=shown;
 lastTight=tightFor(w,shown.length);
 host.classList.toggle("rd-dchart--tight",lastTight);
 if(toggle)toggle.hidden=false;
 if(table){
  table.innerHTML='<table class="rd-table rd-table--days"><caption class="sr-only">Reported value by trade date</caption><thead><tr><th scope="col">Trade date</th><th scope="col" class="rd-num">Purchases</th><th scope="col" class="rd-num">Sales</th><th scope="col" class="rd-num">Net</th></tr></thead><tbody>'+
   all.slice().reverse().map(x=>'<tr><td data-label="Trade date" class="rd-nb">'+E(d.date(x.key+"T00:00:00Z"))+'</td><td data-label="Purchases" class="rd-num">'+E(d.money(x.buy))+' <span class="rd-muted">('+x.nb+')</span></td><td data-label="Sales" class="rd-num">'+E(d.money(x.sell))+' <span class="rd-muted">('+x.ns+')</span></td><td data-label="Net" class="rd-num"><span class="rd-qty rd-qty--'+(x.buy-x.sell>0?"buy":x.buy-x.sell<0?"sell":"other")+'">'+E(d.signedMoney(x.buy-x.sell))+'</span></td></tr>').join("")+
   '</tbody></table>';
 }
}

/* One readout for the hovered or focused day: values lead, labels follow. It stays clear of the sticky
   header, follows the focused day when the page scrolls, and can itself be hovered (WCAG 1.4.13). */
function showTip(li){
 const d=D(),tip=$("rd-tip"),host=$("rd-daily-chart"),x=host?._days?.[Number(li.dataset.day)];if(!tip||!x)return;
 document.querySelectorAll(".rd-day.is-active").forEach(o=>{if(o!==li)o.classList.remove("is-active");});
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
 const minTop=(document.querySelector("header[data-app-header]")?.getBoundingClientRect().bottom||0)+8;
 const left=Math.min(Math.max(8,r.left+r.width/2-w/2),innerWidth-w-8),top=r.top-h-8<minTop?Math.min(r.bottom+8,innerHeight-h-8):r.top-h-8;
 tip.style.left=left+"px";tip.style.top=Math.max(minTop,top)+"px";
 li.classList.add("is-active");
}
function hideTip(li){const tip=$("rd-tip");if(tip)tip.hidden=true;(li||document.querySelector(".rd-day.is-active"))?.classList.remove("is-active");}
/* After the pointer leaves, fall back to the keyboard-focused day, if any. */
function restore(){const f=document.activeElement;if(f?.classList?.contains("rd-day"))showTip(f);else hideTip();}

/* ---------- by company ---------- */
function companies(f){
 const d=D(),E=d.E,host=$("rd-companies");if(!host)return;
 const list=[...f.byCompany.values()].sort((a,b)=>(b.buy+b.sell)-(a.buy+a.sell)||(a.t||a.name).localeCompare(b.t||b.name)).slice(0,6);
 if(!list.length){host.innerHTML='<p class="rd-empty">'+(f.rows.length?"No priced purchases or sales to compare by company.":"No companies yet. They appear after the next SEC import.")+'</p>';return;}
 const max=Math.max(...list.map(x=>Math.max(x.buy,x.sell)));
 const pct=v=>v?Math.max(1.5,v/max*100).toFixed(2):"0";
 host.innerHTML='<div class="rd-co__head" aria-hidden="true"><span></span><span class="rd-co__side rd-co__side--sell"><i class="rd-tri rd-tri--down"></i>Sales</span><span class="rd-co__side"><i class="rd-tri rd-tri--up"></i>Purchases</span><span class="rd-num">Net</span></div>'+
  '<ul class="rd-co__list">'+list.map(x=>{
   const net=x.buy-x.sell;
   return '<li class="rd-co__row">'+
    '<a class="rd-co__id" href="'+E(d.companyHref(x.t))+'">'+(x.t?d.logo(x.t):"")+'<span><strong>'+E(x.t||x.name||"No ticker")+'</strong>'+(x.t?(x.name?'<small>'+E(x.name)+'</small>':''):'<small>No ticker</small>')+'</span></a>'+
    '<span class="rd-co__track rd-co__track--sell" aria-hidden="true"><span class="rd-co__bar rd-co__bar--down" style="width:'+pct(x.sell)+'%"></span></span>'+
    '<span class="rd-co__track rd-co__track--buy" aria-hidden="true"><span class="rd-co__bar rd-co__bar--up" style="width:'+pct(x.buy)+'%"></span></span>'+
    '<span class="rd-co__net rd-num"><span class="sr-only">Net </span><span class="rd-qty rd-qty--'+(net>0?"buy":net<0?"sell":"other")+'">'+E(d.signedMoney(net))+'</span></span>'+
    '<span class="rd-co__detail">'+[x.ns?'Sold '+nb(E,d.money(x.sell))+' in '+E(d.plural(x.ns,"sale")):"",x.nb?'Bought '+nb(E,d.money(x.buy))+' in '+E(d.plural(x.nb,"purchase")):""].filter(Boolean).join(" · ")+'</span>'+
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
  const traded=d.validDate(x.transaction_date)?"traded "+d.date(x.transaction_date):"trade date not reported";
  return '<li class="rd-big rd-big--'+k+'">'+
   '<span class="rd-big__rank">'+String(i+1).padStart(2,"0")+'</span>'+
   '<span class="rd-big__value">'+E(d.money(v))+'</span>'+
   '<span class="rd-big__bar" aria-hidden="true"><span style="width:'+Math.max(1.5,v/max*100).toFixed(2)+'%"></span></span>'+
   '<span class="rd-big__what">'+d.badge(x)+(t?' <a href="'+E(d.companyHref(t))+'">'+E(t)+'</a>':(x.issuer_name?' <span>'+E(x.issuer_name)+'</span>':''))+' <a href="'+E(d.personHref(x.owner_name))+'">'+E(d.shown(x.owner_name))+'</a></span>'+
   '<span class="rd-big__terms">'+nb(E,(s!==null?d.qty(Math.abs(s))+" sh":"")+(p!==null?" × "+d.price(p):""))+' · '+nb(E,traded)+(d.validDate(x.published_at)?' · '+nb(E,"filed "+d.filedDate(x.published_at)+(lag!==null&&!x.is_amendment?" ("+d.lagText(lag)+")":"")):'')+(x.is_amendment?' · '+nb(E,"amended (4/A)"):'')+'</span>'+
   '<a class="rd-arrow" href="'+E(d.filingHref(x.accession))+'" aria-label="'+E("Open the filing: "+(t||x.issuer_name||"")+" "+d.shown(x.owner_name)+" "+d.money(v))+'">Filing ↗</a>'+
  '</li>';
 }).join("");
}

function render(rows){
 if(!D())return;
 const f=last=derive(rows);
 // By company first: on desktop the chart beside it takes its height.
 scope(f);kpis(f);companies(f);daily(f);largest(f);
 const st=$("rd-flow-status");if(st)st.textContent=rows.length?"Insider flow updated: "+D().plural(rows.length,"transaction")+".":"No imported transactions yet.";
}
function fail(e){
 const msg=e&&e.message?e.message:String(e||"The transaction feed did not load");
 const status=e&&e.status,canRetry=status!==401&&status!==402;
 const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 // The transactions table announces the failure (role=alert); this panel only says it, once.
 const k=$("rd-kpis");if(k)k.innerHTML='<p class="rd-empty rd-empty--error">Insider flow is unavailable: '+E(msg)+(canRetry?' <button type="button" class="rd-retry" data-retry="trades" aria-label="Try loading insider flow again">Try again</button>':'')+'</p>';
 const c=$("rd-daily-chart");if(c)c.innerHTML='<p class="rd-empty rd-empty--error">The chart is unavailable until the transactions load.</p>';
 const t=$("rd-daily-toggle");if(t)t.hidden=true;
 const tb=$("rd-daily-table");if(tb){tb.hidden=true;tb.innerHTML="";}
 const co=$("rd-companies");if(co)co.innerHTML='<p class="rd-empty rd-empty--error">Companies are unavailable until the transactions load.</p>';
 const l=$("rd-largest");if(l)l.innerHTML='<li class="rd-empty rd-empty--error">Transactions are unavailable right now.</li>';
}

document.addEventListener("insidir:transactions-loaded",e=>render(Array.isArray(e.detail)?e.detail:[]));
document.addEventListener("insidir:transactions-error",e=>{last=null;fail(e.detail);});
let resizeTimer=0;
addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const host=$("rd-daily-chart");if(!last||!host)return;const w=host.clientWidth||960,n=Math.min(limitFor(w),last.days.size);if(limitFor(w)!==lastLimit||tightFor(w,n)!==lastTight||matchMedia("(min-width:1180px)").matches)daily(last);},150);});
document.addEventListener("DOMContentLoaded",()=>{
 const host=$("rd-daily-chart"),toggle=$("rd-daily-toggle"),table=$("rd-daily-table"),tip=$("rd-tip");
 let hideTimer=0;
 const later=()=>{clearTimeout(hideTimer);hideTimer=setTimeout(restore,250);};
 host?.addEventListener("pointerover",e=>{const li=e.target.closest?.(".rd-day");if(!li)return;clearTimeout(hideTimer);showTip(li);});
 host?.addEventListener("pointerout",e=>{const li=e.target.closest?.(".rd-day");if(li&&!li.contains(e.relatedTarget)&&!tip?.contains(e.relatedTarget))later();});
 tip?.addEventListener("pointerenter",()=>clearTimeout(hideTimer));
 tip?.addEventListener("pointerleave",later);
 host?.addEventListener("focusin",e=>{const li=e.target.closest?.(".rd-day");if(li){clearTimeout(hideTimer);showTip(li);}});
 host?.addEventListener("focusout",e=>{const li=e.target.closest?.(".rd-day");if(li&&!e.relatedTarget?.closest?.(".rd-day"))hideTip(li);});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&tip&&!tip.hidden)hideTip();});
 // Scrolling moves the readout with a focused day; a day that is only hovered lets it go.
 addEventListener("scroll",()=>{if(!tip||tip.hidden)return;const a=document.activeElement;if(a?.classList?.contains("rd-day"))showTip(a);else hideTip();},{passive:true});
 toggle?.addEventListener("click",()=>{const open=toggle.getAttribute("aria-expanded")!=="true";toggle.setAttribute("aria-expanded",String(open));toggle.textContent=open?"Hide the numbers":"Show the numbers";if(table)table.hidden=!open;});
});

/* ---------- data source ---------- */
const valid=x=>{if(!x)return null;const d=new Date(x);return Number.isNaN(d.getTime())?null:d;};
// Publication dates are SEC (Eastern) calendar days; import times are shown in UTC with the zone named.
const date=x=>{const d=valid(x);return d?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"}).format(d):"Not reported";};
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
