/* Today (dashboard.html). Reads GET /v1/me/today (watchlist strip, hero, market totals), GET /v1/chart for the hero
   chart, GET /v1/feed for the latest filings (polled once a minute while the page is visible; new rows animate in),
   GET /v1/me/people/updates, GET /v1/me/research-decisions and GET /v1/status. Every part renders on its own when its
   data lands, replaces a skeleton of the same size, and says what failed in place with a Try again. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,fmt,esc,logo,hydrateLogos,monogram,spark,ring,settle,roll,enter,icon}=UI;
const $=s=>document.querySelector(s);
const verb=k=>k==="buy"?"Bought":"Sold";
const pill=m=>m.planned?`<span class="pill pill--plan" title="Sale under a pre-scheduled 10b5-1 plan">Plan sale</span>`:`<span class="pill pill--${m.kind}">${verb(m.kind)}</span>`;
const coHref=t=>"/company.html?ticker="+encodeURIComponent(t);
const failed=(el,what,retry)=>{el.removeAttribute("aria-busy");el.innerHTML=`<div class="err"><p>${esc(what)} didn't load.</p><button class="btn btn--secondary" type="button">${icon("refresh-cw")}Try again</button></div>`;el.querySelector("button").addEventListener("click",retry);};

$("[data-today-date]").textContent=new Date().toLocaleDateString("en-US",{weekday:"long"})+" · "+new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

/* ---------- hero + strip + market ---------- */
let watch=new Set(),chart=null;
async function loadToday(){
 const hero=$("[data-hero]"),strip=$("[data-strip]");
 let d;try{d=await api("/v1/me/today");}catch(e){if(e.status===401||e.status===402)return;failed(hero,"Today's summary",loadToday);failed(strip,"Your watchlist",loadToday);return;}
 watch=new Set(d.watchlist.map(w=>w.ticker));
 renderHero(hero,d.hero);renderStrip(strip,d.watchlist);renderMarket(d.market);
 applyFilter();
}
function renderHero(el,h){
 el.removeAttribute("aria-busy");
 if(!h){el.innerHTML=`<div class="empty" style="grid-column:1/-1"><span class="empty__ico">${icon("activity")}</span><h3>No insider buys or sales filed this week yet</h3><p>Insidir reads every Form 4 the minute it's posted. The biggest move at the companies you watch will show here.</p><button class="btn btn--primary" type="button" data-add>${icon("plus")}Add a stock</button></div>`;
  el.querySelector("[data-add]").addEventListener("click",()=>UI.palette());return;}
 const t=h.trade,s=h.score,label=h.scope==="watchlist"?"Biggest insider move in your watchlist · last 30 days":"Biggest insider move across the market · last 7 days";
 const why=String(s.sentence||"").replace(/^\w+:\s*/,"");
 el.innerHTML=`<div class="hero__info">
  <p class="t-label" id="hero-label">${esc(label)}</p>
  <a class="hero__co" href="${coHref(t.ticker)}">${logo(t.ticker,40,t.name)}<span><b>${esc(t.ticker)}</b><span class="t-small">${esc(fmt.company(t.name)||t.ticker)}</span></span></a>
  <p class="t-hero hero__num" data-hero-num aria-label="${esc(fmt.money(t.value))}">${UI.reduce?esc(fmt.money(t.value)):"$0"}</p>
  <p class="hero__what">${pill(t)}<span class="t-small num">${esc(fmt.date(t.day))}</span><span class="t-small">· filed ${esc(fmt.ago(t.filedAt))} ago</span></p>
  <p class="t-body hero__sentence">${esc(t.sentence)}</p>
  <div class="hero__score">${ring(s.score,{label:`Signal score ${s.score} of 100, ${s.band}`})}<div><b class="band">${esc(s.band)} signal</b><p>${esc(why)}</p></div></div>
  <div class="hero__acts">${t.url?`<a class="btn btn--secondary" href="${esc(t.url)}" target="_blank" rel="nofollow noopener">SEC filing ${icon("arrow-up-right")}</a>`:""}<a class="btn btn--ghost" href="${coHref(t.ticker)}">Open ${esc(t.ticker)} ${icon("chevron-right")}</a></div>
 </div>
 <div class="hero__chart"><div class="hero__chart-head"><div class="hero__px" data-px><b class="num">&nbsp;</b><span class="t-small">&nbsp;</span></div>
  <div class="seg" role="group" aria-label="Chart range">${["1M","3M","6M","1Y"].map(r=>`<button type="button" data-range="${r}" aria-pressed="${r==="6M"}">${r}</button>`).join("")}</div></div>
  <div data-chart class="chart" role="img" aria-label="${esc(t.ticker)} daily closes with insider trades marked"></div>
  <div class="legend"><span><i class="l-buy"></i>Buy</span><span><i class="l-sell"></i>Sale</span><span><i class="l-plan"></i>10b5-1 plan sale</span><span class="legend__size">Dot size follows the amount</span></div></div>`;
 hydrateLogos(el);settle(el);
 const num=el.querySelector("[data-hero-num]");roll(num,Number(t.value)||0,v=>fmt.money(v));
 loadChart(t.ticker,el);
}
async function loadChart(t,root){
 const box=root.querySelector("[data-chart]"),px=root.querySelector("[data-px]");
 let c;try{c=await api("/v1/chart?ticker="+encodeURIComponent(t)+"&days=366");}catch{box.innerHTML=`<div class="err"><p>The price chart didn't load.</p></div>`;return;}
 if(!c.closes.length){box.innerHTML=`<div class="empty"><span class="empty__ico">${icon("activity")}</span><h3>No price history yet</h3><p>Daily closes for ${esc(t)} haven't been loaded. The insider trades are listed below.</p></div>`;return;}
 const L=c.last;
 px.innerHTML=`<b class="num">${fmt.price(L.close)}</b><span class="t-small">${L.pct==null?"":`<span class="chg chg--${L.pct>0?"up":L.pct<0?"down":"flat"}">${fmt.pct(L.pct,2)}</span>`}<span class="num">Close · ${esc(fmt.date(L.day,false))}</span></span>`;
 chart=window.InsidirChart.mount(box,c,{range:"6M"});
 root.querySelectorAll("[data-range]").forEach(b=>b.addEventListener("click",()=>{root.querySelectorAll("[data-range]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));chart.setRange(b.dataset.range);}));
}
function renderStrip(el,list){
 if(!list.length){el.innerHTML=`<div class="card wcard wcard--empty"><div class="empty" style="padding:var(--sp2) 0"><span class="empty__ico">${icon("star")}</span><h3>Your watchlist is empty</h3><p>Add the stocks you own or follow. You'll see their price, their insiders' latest moves and an alert the minute a new filing posts.</p><button class="btn btn--primary" type="button" data-add>${icon("plus")}Add a stock</button></div></div>`;
  el.querySelector("[data-add]").addEventListener("click",()=>UI.palette());return;}
 el.innerHTML=list.map(w=>{const L=w.last,dir=L?.pct==null?"flat":L.pct>0?"up":L.pct<0?"down":"flat";
  const actLine=w.activity?`<span class="wcard__act"><span class="dot dot--${w.activity}" aria-hidden="true"></span><b>${w.activity==="buy"?"Insider buy":w.activity==="sell"?"Insider sale":"Buys and sales"}</b><span class="num">${esc(fmt.date(w.activityDay,false))}</span></span>`:`<span class="wcard__act">No insider trades in 30 days</span>`;
  return `<a class="card card--hover wcard" href="${coHref(w.ticker)}">
  <div class="wcard__top">${logo(w.ticker,28,w.name)}<span><b>${esc(w.ticker)}</b><span class="t-small">${esc(fmt.company(w.name)||"")}</span></span></div>
  <div class="wcard__px">${L?`<b>${fmt.price(L.close)}</b><span class="chg chg--${dir}">${fmt.pct(L.pct,2)}</span>`:`<span class="t-small">No price yet</span>`}</div>
  ${spark(w.spark,{w:176,h:32})}${actLine}</a>`;}).join("");
 hydrateLogos(el);enter(el.children);
}
function renderMarket(m){
 const el=$("[data-market] .card__body");if(!el)return;
 if(!m||(!m.bought&&!m.sold)){el.innerHTML=`<p class="t-small">No open-market insider buys or sales have been filed for trades this week yet.</p>`;return;}
 const tot=m.bought+m.sold||1;
 el.innerHTML=`<div class="mkt__nums"><div><span class="t-label">Bought</span><b class="up" data-r="${m.bought}">${fmt.money(m.bought)}</b></div><div><span class="t-label">Sold</span><b class="down" data-r="${m.sold}">${fmt.money(m.sold)}</b></div></div>
 <div class="mkt__bar" role="img" aria-label="${Math.round(m.bought/tot*100)}% of the dollar volume was buying"><i class="b" style="flex:${m.bought}"></i><i class="s" style="flex:${m.sold}"></i></div>
 <p class="t-small"><span class="num">${m.buys}</span> buys and <span class="num">${m.sells}</span> sales on the open market, trades dated in the last 7 days.</p>`;
 el.querySelectorAll("[data-r]").forEach(b=>roll(b,Number(b.dataset.r),v=>fmt.money(v)));
}

/* ---------- feed ---------- */
let items=[],filter="all";
const feedEl=$("[data-feed]");
const row=m=>`<li class="row feed__row" data-id="${esc(m.id)}" data-kind="${m.kind}" data-t="${esc(m.ticker)}">
 <a class="feed__hit" href="${coHref(m.ticker)}" aria-label="${esc(fmt.person(m.owner))}, ${esc(fmt.role(m.role))} at ${esc(fmt.company(m.name)||m.ticker)}, ${m.kind==="buy"?"bought":"sold"} ${fmt.money(m.value)}${m.planned?" under a 10b5-1 plan":""}"></a>
 ${logo(m.ticker,28,m.name)}
 <span class="feed__co"><b>${esc(fmt.company(m.name)||m.ticker)}</b><span class="feed__sub"><span class="tick">${esc(m.ticker)}</span><span class="feed__ago-m"> · ${esc(fmt.ago(m.filedAt))}</span></span></span>
 <span class="feed__who">${monogram(m.owner)}<span>${esc(fmt.person(m.owner))} <em>· ${esc(fmt.role(m.role))}</em></span></span>
 <span class="feed__pill">${pill(m)}</span>
 <span class="feed__amt ${m.planned?"":m.kind==="buy"?"up":"down"}">${fmt.money(m.value)}</span>
 <span class="feed__ago" title="Filed ${esc(fmt.date(m.filedAt))}">${esc(fmt.ago(m.filedAt))}</span>
 ${m.url?`<a class="feed__link" href="${esc(m.url)}" target="_blank" rel="nofollow noopener" aria-label="Open the SEC filing">${icon("arrow-up-right")}</a>`:"<span></span>"}</li>`;
const visible=()=>items.filter(m=>filter==="all"||(filter==="watch"?watch.has(m.ticker):m.kind===filter&&!(filter==="buy"&&m.planned)));
let limit=12;
function drawFeed(){
 feedEl.removeAttribute("aria-busy");
 const all=visible(),list=all.slice(0,limit);
 if(!list.length){feedEl.innerHTML=`<li class="empty"><span class="empty__ico">${icon(filter==="watch"?"star":"inbox")}</span><h3>${filter==="watch"?"Nothing new at your watchlist companies":"No filings here yet"}</h3><p>${filter==="watch"?"None of the latest filings are at companies you watch. You'll get an alert the minute one is.":"New Form 4 filings appear here within minutes of posting."}</p></li>`;return;}
 feedEl.innerHTML=list.map(row).join("")+(all.length>limit?`<li class="feed__more"><button class="btn btn--ghost" type="button" data-more>Show ${Math.min(12,all.length-limit)} more</button></li>`:"");hydrateLogos(feedEl);
 feedEl.querySelector("[data-more]")?.addEventListener("click",()=>{const before=feedEl.querySelectorAll(".feed__row").length;limit+=12;drawFeed();enter([...feedEl.querySelectorAll(".feed__row")].slice(before));});
}
async function loadFeed(){
 try{items=(await api("/v1/feed?limit=60")).items||[];drawFeed();}catch(e){if(e.status===401||e.status===402)return;failed(feedEl,"The latest filings",loadFeed);}
}
function applyFilter(){if(items.length)drawFeed();}
document.querySelectorAll("[data-feed-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.feedFilter;document.querySelectorAll("[data-feed-filter]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));drawFeed();enter(feedEl.children);}));
async function poll(){
 if(document.hidden||!items.length)return;
 try{const fresh=(await api("/v1/feed?limit=20")).items||[];const have=new Set(items.map(x=>x.id));const add=fresh.filter(x=>!have.has(x.id));if(!add.length)return;
  items=[...add,...items].slice(0,100);
  const show=new Set(visible().slice(0,limit).map(x=>x.id));const tmp=document.createElement("ul");tmp.innerHTML=add.filter(x=>show.has(x.id)).map(row).join("");
  const nodes=[...tmp.children];if(feedEl.querySelector(".empty"))feedEl.innerHTML="";feedEl.prepend(...nodes);while(feedEl.querySelectorAll(".feed__row").length>limit)feedEl.querySelector(".feed__row:last-of-type")?.remove();hydrateLogos(feedEl);enter(nodes);
 }catch{}
}
setInterval(poll,60000);

/* ---------- people, notes, status ---------- */
async function loadPeople(){
 const el=$("[data-people]");
 try{const d=await api("/v1/me/people/updates?limit=6");el.removeAttribute("aria-busy");const ppl=(d.people||[]).slice(0,5);
  if(!ppl.length){el.outerHTML=`<div class="empty" data-people><span class="empty__ico">${icon("users")}</span><h3>Follow an insider</h3><p>Follow a CEO or director and every trade they file lands here and in your alerts.</p><a class="btn btn--secondary" href="/people.html">Find people</a></div>`;return;}
  el.innerHTML=ppl.map(p=>{const l=p.last||{};const k=l.transaction_code==="P"?"buy":l.transaction_code==="S"?"sell":null;
   return `<li class="row side-row"><a class="feed__hit" href="/person.html?cik=${encodeURIComponent(p.owner_cik)}" aria-label="${esc(fmt.person(p.owner_name))}"></a>${monogram(p.owner_name,32)}<span><b>${esc(fmt.person(p.owner_name))}</b><span class="t-small"><span class="tick">${esc(p.ticker||"")}</span>${p.last_published_at?" · "+esc(fmt.ago(p.last_published_at)):""}</span></span>${k?`<span class="num ${l.rule_10b5_1&&k==="sell"?"plan":k==="buy"?"up":"down"}">${fmt.money(l.estimated_value)}</span>`:""}</li>`;}).join("");
 }catch(e){if(e.status!==401&&e.status!==402)failed(el,"People you follow",loadPeople);}
}
async function loadNotes(){
 const el=$("[data-notes]");
 try{const d=await api("/v1/me/research-decisions");el.removeAttribute("aria-busy");const n=(d.items||[]).slice(0,4);
  if(!n.length){el.outerHTML=`<div class="empty" data-notes><span class="empty__ico">${icon("notebook-pen")}</span><h3>No notes yet</h3><p>Save a note on any company page and it waits for you here.</p></div>`;return;}
  el.innerHTML=n.map(x=>`<li class="row side-row"><a class="feed__hit" href="${coHref(x.ticker)}" aria-label="${esc(x.ticker)} note"></a>${logo(x.ticker,28)}<span><b>${esc(x.ticker)}</b><span class="t-small">${esc(String(x.notes||x.review_status||"").slice(0,80))}</span></span><span class="t-small num">${esc(fmt.date(x.updated_at,false))}</span></li>`).join("");hydrateLogos(el);
 }catch(e){if(e.status!==401&&e.status!==402)failed(el,"Your notes",loadNotes);}
}
async function loadStatus(){
 try{const s=await api("/v1/status");if(s.latestFilingPublishedAt)$("[data-status]").innerHTML=`SEC Form 4 filings from EDGAR; the latest posted <span class="num">${esc(fmt.ago(s.latestFilingPublishedAt))}</span> ago. Prices are daily closes, not live quotes.`;}catch{}
}

loadToday();loadFeed();loadPeople();loadNotes();loadStatus();
})();
