/* 03 Across the market and 05 About this data, on the overview (dashboard.html).
   No requests of its own: everything is drawn from the responses v3-dashboard.js loads (the newest 100
   imported Form 4 lines by trade date, /v1/status and /v1/filings?limit=1), through window.InsidirDesk,
   whose derive() result is the same one the Today sentence uses, so the figures always match.

   What is drawn, and from what:
     - five totals: bought and sold (value, count, shares), bought minus sold, the lines that are not a
       purchase or sale (grants, exercises, gifts: counted, never valued) and the days from trade to SEC filing;
     - bought and sold by trade date: a diverging column chart (bought above the line in green, sold below in
       red) with a readout per day, and the same days as a table, one switch apart inside a fixed-height frame;
     - by company (grouped by SEC issuer CIK): sold to the left, bought to the right, largest total first;
     - the biggest trades, ranked by shares × price per share as filed, each with a headshot and a logo.
   Only priced non-derivative purchases (code P) and sales (code S) carry value; nothing is estimated.
   Each block renders once, in its own idle slice, after the first screen (v3-dashboard.js later()). */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const D=window.InsidirDesk;if(!D)return;
const E=D.E,set=(id,text)=>{const el=$(id);if(el)el.textContent=text;};
const nb=text=>'<span class="rd-nb">'+E(text)+'</span>';
const median=a=>!a.length?null:a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;
const days=n=>n===null?"":(Number.isInteger(n)?String(n):n.toFixed(1))+(n===1?" day":" days");
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

/* ---------- scope ---------- */
function scope(f){
 const el=$("rd-flow-scope");if(!el)return;
 D.ready(el);
 const n=f.rows.length;
 if(!n){el.textContent="Purchases and sales reported on SEC Form 4, from the latest imported trades.";return;}
 el.textContent=(n>=100?"The latest "+D.count(n):"All "+D.count(n))+" trades imported from SEC Form 4 filings: "+
  [D.rangeText(f),D.plural(f.companies.size,"company","companies"),D.plural(f.people.size,"person","people"),
   f.replaced?D.plural(f.replaced,"amended line replaces its original","amended lines replace their originals"):""].filter(Boolean).join(" · ")+".";
}

/* ---------- five totals ---------- */
const tile=(cls,label,value,note,title,i)=>'<div class="rd-kpi '+cls+'" style="--i:'+i+'"'+(title?' title="'+E(title)+'"':'')+'><p class="rd-kpi__label">'+label+'</p><p class="rd-kpi__value">'+value+'</p><p class="rd-kpi__note">'+note+'</p></div>';
function kpis(f){
 const host=$("rd-kpis");if(!host)return;
 D.ready(host);
 if(!f.rows.length){host.innerHTML='<p class="rd-empty">No trades have been imported yet. The first SEC import fills this page.</p>';return;}
 const side=(list,shares,unpriced,word)=>E(D.plural(list.length,word))+(list.length?'&nbsp;· '+nb(D.qty(shares)+" shares"):"")+(unpriced?'&nbsp;· '+nb(unpriced+" without a price"):"");
 const netCls=f.net>0?"rd-kpi__value--up":f.net<0?"rd-kpi__value--down":"";
 const netWord=!f.buyValue&&!f.sellValue?"No priced purchases or sales":f.net>0?"More bought than sold":f.net<0?"More sold than bought":"Bought equals sold";
 const others=[...f.otherCodes].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 const otherNote=others.length?cap(others.map(([k,n])=>D.noun(k,n)+" ("+n+")").join(", "))+". No dollar value counted.":"None in these trades.";
 const lo=f.lags[0],hi=f.lags[f.lags.length-1],med=median(f.lags);
 const lagNote=med===null?"No dated filings":lo===hi?(f.lags.length===1?"From trade to SEC filing, 1 dated trade":"From trade to SEC filing, the same for all "+f.lags.length):"Median from trade to SEC filing&nbsp;· range "+nb(lo+"–"+days(hi));
 host.innerHTML=
  tile("rd-kpi--buy",D.tri("buy")+"Bought",E(D.money(f.buyValue)),side(f.buys,f.buyShares,f.buyUnpriced,"purchase"),"Code P on non-derivative securities: value = shares × price per share as filed",0)+
  tile("rd-kpi--sell",D.tri("sell")+"Sold",E(D.money(f.sellValue)),side(f.sells,f.sellShares,f.sellUnpriced,"sale"),"Code S on non-derivative securities: value = shares × price per share as filed",1)+
  tile("rd-kpi--net","Bought minus sold",'<span class="'+netCls+'">'+(f.net?D.tri(f.net>0?"buy":"sell"):"")+E(D.signedMoney(f.net))+'</span>',E(netWord),"Reported purchase value minus reported sale value",2)+
  tile("rd-kpi--other","Not a purchase or sale",E(D.count(f.others.length)),E(otherNote),others.map(([k])=>k.slice(0,1)+" — "+D.codeMeaning(k.slice(0,1))).join("; "),3)+
  tile("rd-kpi--lag","Days to report",med===null?'<span class="rd-muted">—</span>':E(days(med)),lagNote,"Calendar days from the trade date to the SEC filing date of the original Form 4; it is due within two business days",4);
 // One size for every figure, set by the longest, so a ten-digit total still fits its tile.
 host.style.setProperty("--rd-len",String(Math.max(...[...host.querySelectorAll(".rd-kpi__value")].map(v=>v.textContent.trim().length),8)));
 D.arrive(host);
}

/* ---------- bought and sold, by trade date ---------- */
const STEPS=[1,2,2.5,5,10];
function niceStep(max,parts){const raw=max/parts,mag=Math.pow(10,Math.floor(Math.log10(raw)));const n=raw/mag;return STEPS.find(s=>s>=n-1e-9)*mag;}
let last=null,lastLimit=0,lastTight=null,chartW=0;
/* The chart's width comes from a ResizeObserver, so drawing never forces a layout of everything rendered before it. */
const chartWidth=host=>chartW||host.clientWidth||960;
const limitFor=w=>w>=700?14:w>=560?12:w>=480?8:6;
const tightFor=(w,n)=>(w-64)/n<58;
const PLOT=w=>w<560?200:w<1180-120?300:340; // the plot's height: fixed per width, so the frame never resizes with the data
const dayLabel=x=>D.date(x.key+"T00:00:00Z")+": bought "+D.money(x.buy)+" ("+D.plural(x.nb,"trade")+"), sold "+D.money(x.sell)+" ("+D.plural(x.ns,"trade")+"), net "+D.signedMoney(x.buy-x.sell);
function daily(f){
 const host=$("rd-daily-chart"),table=$("rd-daily-table"),seg=$("rd-daily-switch"),frame=$("rd-daily-frame");if(!host)return;
 frame?.removeAttribute("aria-busy");
 const all=[...f.days.values()].sort((a,b)=>a.key.localeCompare(b.key));
 if(!all.length){
  host.innerHTML='<p class="rd-empty">'+(f.rows.length?"No priced purchases or sales among the "+D.plural(f.rows.length,"loaded trade")+" to chart.":"No dated trades to chart yet. The chart fills in as SEC filings are imported.")+'</p>';
  if(seg)seg.hidden=true;if(table)table.innerHTML="";setView("chart",false);
  return;
 }
 const w=chartWidth(host),limit=lastLimit=limitFor(w),shown=all.slice(-limit);
 const top=Math.max(0,...shown.map(x=>x.buy)),bot=Math.max(0,...shown.map(x=>x.sell)),mx=Math.max(top,bot);
 // The nice step (1, 2, 2.5 or 5 × 10ⁿ) that wastes the least height over both sides, at most eight intervals;
 // a side that is tiny next to the other keeps a sliver, not a whole step.
 const fit=(v,st)=>v>st*.15?Math.ceil(v/st-1e-9)*st:0,extent=st=>fit(top,st)+fit(bot,st);
 const step=[2,3,4,5].map(p=>niceStep(mx,p)).filter((st,i,a)=>a.indexOf(st)===i&&extent(st)/st<=8).reduce((a,b)=>extent(b)<extent(a)?b:a);
 const topMax=fit(top,step),botMax=fit(bot,step);
 const H=PLOT(innerWidth),pad=26,inner=H-pad*2;
 const span=(topMax||step*.15)+(botMax||step*.15),px=inner/span,zero=pad+(topMax||step*.15)*px;
 const ticks=[];for(let v=topMax;v>-botMax-1e-9;v-=step)ticks.push(Math.abs(v)<1e-9?0:v);if(!ticks.includes(0))ticks.push(0);
 if(botMax)ticks.push(-botMax);
 const tickSet=[...new Set(ticks.map(v=>+v.toFixed(2)))].sort((a,b)=>b-a);
 const y=v=>zero-v*px;
 const maxBuy=shown.reduce((m,x)=>x.buy>(m?.buy||0)?x:m,null),maxSell=shown.reduce((m,x)=>x.sell>(m?.sell||0)?x:m,null);
 const scopeText=(shown.length<all.length?"Latest "+shown.length+" of "+all.length+" trade days":D.plural(all.length,"trade day"))+(f.undated?" · "+f.undated+" undated not charted":"");
 // One tab stop for the whole chart: the arrow keys move between days (roving tabindex).
 const focusAt=Math.max(0,Math.min(shown.length-1,Number(host.dataset.focus??shown.length-1)));
 host.innerHTML=
  '<div class="rd-legend" aria-hidden="true"><span><i class="rd-swatch rd-swatch--up"></i>Bought</span><span><i class="rd-swatch rd-swatch--down"></i>Sold</span><span class="rd-legend__scope">'+E(scopeText)+'</span></div>'+
  '<div class="rd-dchart__frame" style="height:'+H+'px">'+
   '<div class="rd-dchart__axis" aria-hidden="true">'+tickSet.map(v=>'<span style="top:'+y(v).toFixed(1)+'px">'+E(v===0?"$0":(v>0?"+":D.MINUS)+D.compactMoney(Math.abs(v)))+'</span>').join("")+'</div>'+
   '<div class="rd-dchart__plot">'+
    tickSet.map(v=>'<i class="rd-dchart__grid'+(v===0?" rd-dchart__grid--zero":"")+'" style="top:'+y(v).toFixed(1)+'px" aria-hidden="true"></i>').join("")+
    '<ul class="rd-dchart__cols" aria-label="'+E("Bought and sold by trade date, "+scopeText.toLowerCase()+". Use the arrow keys to move between days.")+'">'+shown.map((x,i)=>{
     const hb=x.buy?Math.max(2,x.buy*px):0,hs=x.sell?Math.max(2,x.sell*px):0;
     return '<li class="rd-day" tabindex="'+(i===focusAt?0:-1)+'" data-day="'+i+'" aria-label="'+E(dayLabel(x))+'">'+
      (hb?'<span class="rd-day__bar rd-day__bar--up" style="top:'+(zero-hb).toFixed(1)+'px;height:'+hb.toFixed(1)+'px"></span>':'')+
      (hs?'<span class="rd-day__bar rd-day__bar--down" style="top:'+zero.toFixed(1)+'px;height:'+hs.toFixed(1)+'px"></span>':'')+
      (x===maxBuy&&x.buy?'<span class="rd-day__val rd-day__val--up" style="top:'+(zero-hb-18).toFixed(1)+'px">'+E(D.money(x.buy))+'</span>':'')+
      (x===maxSell&&x.sell?'<span class="rd-day__val rd-day__val--down" style="top:'+(zero+hs+4).toFixed(1)+'px">'+E(D.money(x.sell))+'</span>':'')+
     '</li>';}).join("")+'</ul>'+
   '</div>'+
  '</div>'+
  '<div class="rd-dchart__x" aria-hidden="true">'+shown.map(x=>{const [m,dd]=D.shortDate(x.key+"T00:00:00Z").split(" ");return '<span><b>'+E(m)+'</b> '+E(dd)+'</span>';}).join("")+'</div>';
 host._days=shown;
 lastTight=tightFor(w,shown.length);
 host.classList.toggle("rd-dchart--tight",lastTight);
 if(seg)seg.hidden=false;
 if(table){
  table.innerHTML='<table class="rd-table rd-table--days"><caption class="sr-only">Bought and sold by trade date</caption><thead><tr><th scope="col">Trade date</th><th scope="col" class="rd-num">Bought</th><th scope="col" class="rd-num">Sold</th><th scope="col" class="rd-num">Net</th></tr></thead><tbody>'+
   all.slice().reverse().map(x=>'<tr><td data-label="Trade date" class="rd-nb">'+E(D.date(x.key+"T00:00:00Z"))+'</td><td data-label="Bought" class="rd-num">'+E(D.money(x.buy))+' <span class="rd-muted">('+x.nb+')</span></td><td data-label="Sold" class="rd-num">'+E(D.money(x.sell))+' <span class="rd-muted">('+x.ns+')</span></td><td data-label="Net" class="rd-num"><span class="rd-qty rd-qty--'+(x.buy-x.sell>0?"buy":x.buy-x.sell<0?"sell":"other")+'">'+E(D.signedMoney(x.buy-x.sell))+'</span></td></tr>').join("")+
   '</tbody></table>';
 }
 D.arrive(host);
}

/* Chart | Table: one frame, two views crossfading in place; the frame keeps the chart's height and the table
   scrolls inside it under a sticky header, so switching never moves the page. */
function setView(view,focus){
 const chart=$("rd-daily-chart"),table=$("rd-daily-table");if(!chart||!table)return;
 const toTable=view==="table";
 for(const b of document.querySelectorAll("#rd-daily-switch button"))b.setAttribute("aria-pressed",String(b.dataset.view===view));
 chart.classList.toggle("is-active",!toTable);table.classList.toggle("is-active",toTable);
 chart.inert=toTable;table.inert=!toTable;
 chart.setAttribute("aria-hidden",String(toTable));table.setAttribute("aria-hidden",String(!toTable));
 if(toTable)hideTip();
 if(focus&&toTable)table.focus({preventScroll:true});
}

/* One readout for the hovered or focused day: values lead, labels follow. Placed at most once per frame, from
   positions read before anything is written; it stays clear of the sticky header and can itself be hovered (WCAG 1.4.13). */
let tipFrame=0,tipFor=null,tipW=210,tipH=104,headerBottom=78;
function requestTip(li){tipFor=li;if(!tipFrame)tipFrame=requestAnimationFrame(placeTip);}
function placeTip(){
 tipFrame=0;
 const li=tipFor,tip=$("rd-tip"),host=$("rd-daily-chart"),x=li&&host?._days?.[Number(li.dataset.day)];
 if(!tip||!x||!li.isConnected){hideTip();return;}
 // Reads first…
 const r=li.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
 // …then writes.
 for(const o of host.querySelectorAll(".rd-day.is-active"))if(o!==li)o.classList.remove("is-active");
 if(tip._day!==x){
  tip._day=x;tip.replaceChildren();
  const head=document.createElement("p");head.className="rd-tip__date";head.textContent=D.date(x.key+"T00:00:00Z");tip.append(head);
  for(const [cls,word,v,n] of [["up","Bought",x.buy,x.nb],["down","Sold",x.sell,x.ns]]){
   const row=document.createElement("p");row.className="rd-tip__row";
   const key=document.createElement("i");key.className="rd-tip__key rd-tip__key--"+cls;key.setAttribute("aria-hidden","true");
   const val=document.createElement("strong");val.textContent=D.money(v);
   const lab=document.createElement("span");lab.textContent=word+" · "+n;
   row.append(key,val,lab);tip.append(row);
  }
  const net=document.createElement("p");net.className="rd-tip__net";net.textContent="Net "+D.signedMoney(x.buy-x.sell);tip.append(net);
 }
 const minTop=headerBottom+8,left=Math.min(Math.max(8,r.left+r.width/2-tipW/2),vw-tipW-8),top=r.top-tipH-8<minTop?Math.min(r.bottom+8,vh-tipH-8):r.top-tipH-8;
 tip.style.translate=Math.round(left)+"px "+Math.round(Math.max(minTop,top))+"px";
 tip.hidden=false;
 li.classList.add("is-active");
}
function hideTip(li){tipFor=null;const tip=$("rd-tip");if(tip)tip.hidden=true;(li||document.querySelector(".rd-day.is-active"))?.classList.remove("is-active");}
/* After the pointer leaves, fall back to the keyboard-focused day, if any. */
function restore(){const f=document.activeElement;if(f?.classList?.contains("rd-day"))requestTip(f);else hideTip();}

/* ---------- by company ---------- */
function companies(f){
 const host=$("rd-companies");if(!host)return;
 D.ready(host);
 const list=[...f.byCompany.values()].sort((a,b)=>(b.buy+b.sell)-(a.buy+a.sell)||(a.t||a.name).localeCompare(b.t||b.name)).slice(0,6);
 if(!list.length){host.innerHTML='<p class="rd-empty">'+(f.rows.length?"No priced purchases or sales to compare by company.":"No companies yet. They appear after the first SEC import.")+'</p>';return;}
 const max=Math.max(...list.map(x=>Math.max(x.buy,x.sell)));
 const pct=v=>v?Math.max(1.5,v/max*100).toFixed(2):"0";
 host.innerHTML='<div class="rd-co__head" aria-hidden="true"><span></span><span class="rd-co__side rd-co__side--sell"><i class="rd-tri rd-tri--down"></i>Sold</span><span class="rd-co__side"><i class="rd-tri rd-tri--up"></i>Bought</span><span class="rd-num">Net</span></div>'+
  '<ul class="rd-co__list">'+list.map(x=>{
   const net=x.buy-x.sell,label=x.t||D.companyName(x.name)||"No ticker";
   return '<li class="rd-co__row">'+
    '<a class="rd-co__id" href="'+E(D.companyHref(x.t))+'">'+D.companyTile(x.t,x.name,x.cik,"sm")+'<span><strong data-ent="company">'+E(label)+'</strong>'+(x.t?(x.name?'<small>'+E(D.companyName(x.name))+'</small>':''):'<small>No ticker</small>')+'</span></a>'+
    '<span class="rd-co__track rd-co__track--sell" aria-hidden="true"><span class="rd-co__bar rd-co__bar--down" style="width:'+pct(x.sell)+'%"></span></span>'+
    '<span class="rd-co__track rd-co__track--buy" aria-hidden="true"><span class="rd-co__bar rd-co__bar--up" style="width:'+pct(x.buy)+'%"></span></span>'+
    '<span class="rd-co__net rd-num"><span class="sr-only">Net </span><span class="rd-qty rd-qty--'+(net>0?"buy":net<0?"sell":"other")+'">'+E(D.signedMoney(net))+'</span></span>'+
    '<span class="rd-co__detail">'+[x.ns?'Sold '+nb(D.money(x.sell))+' in '+E(D.plural(x.ns,"sale")):"",x.nb?'Bought '+nb(D.money(x.buy))+' in '+E(D.plural(x.nb,"purchase")):""].filter(Boolean).join(" · ")+'</span>'+
   '</li>';}).join("")+'</ul>'+
  (f.byCompany.size>list.length?'<p class="rd-more">'+E(D.plural(f.byCompany.size-list.length,"more company","more companies"))+' with priced trades in these imports.</p>':'');
 D.hydrate(host);D.arrive(host);
}

/* ---------- biggest trades ---------- */
function biggest(f){
 const host=$("rd-largest");if(!host)return;
 D.ready(host);
 const list=f.priced.slice().sort((a,b)=>D.valueOf(b)-D.valueOf(a)).slice(0,6);
 if(!list.length){host.innerHTML='<li class="rd-empty">'+(f.rows.length?"No priced purchases or sales among the loaded trades.":"No trades have been imported yet.")+'</li>';return;}
 const max=D.valueOf(list[0]);
 host.innerHTML=list.map((x,i)=>{
  const k=D.kind(x),v=D.valueOf(x),p=D.priceOf(x),s=D.sharesOf(x),lag=D.lagOf(x),t=D.tick(x.ticker);
  const traded=D.validDate(x.transaction_date)?"traded "+D.tradedShort(x.transaction_date):"trade date not reported";
  return '<li class="rd-big rd-big--'+k+'" style="--i:'+i+'">'+
   '<span class="rd-big__rank">'+String(i+1).padStart(2,"0")+'</span>'+
   '<span class="rd-big__value">'+E(D.money(v))+'</span>'+
   '<span class="rd-big__bar" aria-hidden="true"><span style="width:'+Math.max(1.5,v/max*100).toFixed(2)+'%"></span></span>'+
   '<span class="rd-big__what">'+D.badge(x)+
    '<span class="rd-ent">'+D.coTile(x,"sm")+(t?'<span data-ent="company">'+E(t)+'</span>':'<span data-ent="company">'+E(D.companyName(x.issuer_name)||"Issuer not reported")+'</span>')+'</span>'+
    '<span class="rd-ent">'+D.whoTile(x,"sm")+D.personName(x)+'</span></span>'+
   '<span class="rd-big__terms">'+nb((s!==null?D.qty(Math.abs(s))+" shares":"")+(p!==null?" × "+D.price(p):""))+' · '+nb(traded)+(D.validDate(x.published_at)?' · '+nb("filed "+D.filedShort(x.published_at)+(lag!==null&&!x.is_amendment?" ("+D.lagWords(lag)+")":"")):'')+(x.is_amendment?' · '+nb("amended filing (4/A)"):'')+'</span>'+
   '<a class="rd-arrow" href="'+E(D.filingHref(x.accession))+'" aria-label="'+E("Open the filing: "+D.sentence(x))+'">Filing ↗</a>'+
  '</li>';
 }).join("");
 D.hydrate(host);D.arrive(host);
}

function fail(e){
 const msg=D.failText("The latest imported trades could not be loaded",e);
 const k=$("rd-kpis");if(k){D.ready(k);k.innerHTML='<p class="rd-empty rd-empty--error">'+msg+(D.canRetry(e)?' <button type="button" class="rd-retry" data-retry="trades" data-hf-atom aria-label="Try loading the latest trades again">Try again</button>':'')+'</p>';}
 const c=$("rd-daily-chart");if(c)c.innerHTML='<p class="rd-empty rd-empty--error">The chart is unavailable until the trades load.</p>';
 $("rd-daily-frame")?.removeAttribute("aria-busy");
 const s=$("rd-daily-switch");if(s)s.hidden=true;
 const tb=$("rd-daily-table");if(tb)tb.innerHTML="";
 setView("chart",false);
 const co=$("rd-companies");if(co){D.ready(co);co.innerHTML='<p class="rd-empty rd-empty--error">Companies are unavailable until the trades load.</p>';}
 const l=$("rd-largest");if(l){D.ready(l);l.innerHTML='<li class="rd-empty rd-empty--error">The biggest trades are unavailable until the trades load.</li>';}
 const sc=$("rd-flow-scope");if(sc)sc.textContent="Purchases and sales reported on SEC Form 4, from the latest imported trades.";
}

D.watch(["trades"],r=>{
 if(!r.trades.ok){last=null;D.later(2,()=>fail(r.trades.error));return;}
 const f=last=D.derive(r.trades.value);
 // Each block in its own slice, in reading order.
 D.later(2,()=>{scope(f);kpis(f);});
 D.later(2.5,()=>companies(f));
 D.later(2.6,()=>daily(f));
 D.later(3,()=>biggest(f));
});
let resizeTimer=0;
const resized=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{const host=$("rd-daily-chart");if(!last||!host||!host._days)return;const w=chartWidth(host),n=Math.min(limitFor(w),last.days.size);if(limitFor(w)!==lastLimit||tightFor(w,n)!==lastTight)daily(last);},150);};
if(window.ResizeObserver){const frame=$("rd-daily-frame");if(frame)new ResizeObserver(es=>{const w=Math.round(es[es.length-1].contentRect.width);if(w&&w!==chartW){const first=!chartW;chartW=w;if(!first)resized();}}).observe(frame);}
else addEventListener("resize",resized,{passive:true});
document.addEventListener("DOMContentLoaded",()=>{
 const host=$("rd-daily-chart"),tip=$("rd-tip");
 headerBottom=78;
 let hideTimer=0;
 const later=()=>{clearTimeout(hideTimer);hideTimer=setTimeout(restore,250);};
 host?.addEventListener("pointerover",e=>{const li=e.target.closest?.(".rd-day");if(!li)return;clearTimeout(hideTimer);requestTip(li);});
 host?.addEventListener("pointerout",e=>{const li=e.target.closest?.(".rd-day");if(li&&!li.contains(e.relatedTarget)&&!tip?.contains(e.relatedTarget))later();});
 tip?.addEventListener("pointerenter",()=>clearTimeout(hideTimer));
 tip?.addEventListener("pointerleave",later);
 host?.addEventListener("focusin",e=>{const li=e.target.closest?.(".rd-day");if(li){clearTimeout(hideTimer);host.dataset.focus=li.dataset.day;requestTip(li);}});
 host?.addEventListener("focusout",e=>{const li=e.target.closest?.(".rd-day");if(li&&!e.relatedTarget?.closest?.(".rd-day"))hideTip(li);});
 // Arrow keys move between days; the chart is one tab stop.
 host?.addEventListener("keydown",e=>{
  const li=e.target.closest?.(".rd-day");if(!li)return;
  const all=[...host.querySelectorAll(".rd-day")],i=all.indexOf(li);
  const to=e.key==="ArrowRight"||e.key==="ArrowDown"?i+1:e.key==="ArrowLeft"||e.key==="ArrowUp"?i-1:e.key==="Home"?0:e.key==="End"?all.length-1:null;
  if(to===null)return;
  e.preventDefault();
  const next=all[Math.max(0,Math.min(all.length-1,to))];if(!next||next===li)return;
  li.tabIndex=-1;next.tabIndex=0;next.focus();
 });
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&tip&&!tip.hidden)hideTip();});
 // Scrolling moves the readout with a focused day (once per frame); a day that is only hovered lets it go.
 addEventListener("scroll",()=>{if(!tip||tip.hidden)return;const a=document.activeElement;if(a?.classList?.contains("rd-day"))requestTip(a);else hideTip();},{passive:true});
 document.getElementById("rd-daily-switch")?.addEventListener("click",e=>{const b=e.target.closest?.("button[data-view]");if(b)setView(b.dataset.view,true);});
 setView("chart",false);
 // The tip's size never changes with its content (fixed figures, one font); measured once.
 if(tip){tip.hidden=false;tip.style.visibility="hidden";tipW=tip.offsetWidth||tipW;tipH=tip.offsetHeight||tipH;tip.hidden=true;tip.style.visibility="";}
});

/* ---------- 05 About this data ---------- */
/* ingest_runs.status as src/ingest.mjs writes it: running → success | partial | error. */
const RUN={success:"",completed:"",ok:"",partial:" · partial import",running:" · in progress",error:" · import failed"};
const runNote=x=>{const k=String(x||"").toLowerCase();return k in RUN?RUN[k]:k?" · "+k.slice(0,24):"";};
function about(r){
 const state=$("v4-data-state");
 D.ready($("rd-about"));
 if(!r.status.ok){
  // Keep the value short: the HTTP status when there is one, else the message.
  const e=r.status.error,msg=String(e.message||"").replace(/\s*Taking you.*$/,""),code=/HTTP \d{3}/.exec(msg),why=code?code[0]:msg.slice(0,80);
  if(state)state.innerHTML="Unavailable"+(why?" · "+E(why):"")+(D.canRetry(e)?' <button type="button" class="rd-retry" data-retry="status" data-hf-atom>Try again</button>':'');
  set("v4-filing-count","filings imported: unavailable");set("v4-last-import","last import: unavailable");
 }else{
  const s=r.status.value||{},run=s.lastIngest||null;
  const online=s.engine?s.engine==="online":s.ok!==false;
  set("v4-data-state",online?(s.sec==="requires_user_agent"?"Online · SEC import not configured":"Online"):"Degraded");
  set("v4-filing-count",Number.isFinite(Number(s.filings))?D.plural(Number(s.filings),"filing")+" imported":"filings imported: not reported");
  const when=run?(run.status==="running"?run.started_at:(run.finished_at||run.started_at)):s.lastIngestAt||null;
  set("v4-last-import",when?(run?.status==="running"?"import started ":"last import ")+D.stamp(when)+runNote(run?.status):"no import recorded yet");
 }
 const first=r.filing.ok?r.filing.value:null,fallback=r.status.ok?r.status.value?.latest_published_at:null;
 set("v4-latest-filing-date",first?.published_at?"newest filing published "+D.filedDate(first.published_at):fallback?"newest filing published "+D.filedDate(fallback):r.filing.ok?"no filings imported yet":"newest filing: unavailable");
}
D.watch(["status","filing"],r=>D.later(5,()=>about(r)));
})();
