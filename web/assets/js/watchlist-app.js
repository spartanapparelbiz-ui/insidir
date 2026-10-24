/* Watchlist (watchlist.html): the member's watched stocks (GET /v1/me/watchlist). Each row: the company's logo and name,
   its last daily close and change, a 30-close sparkline, and its latest open-market insider buy or sale of the last
   year, the amount linked to its SEC filing (GET /v1/chart?ticker=T&days=365, at most four at a time). The row opens
   the stock page. Add a ticker (POST /v1/me/watchlist, with important alerts on, as the stock page's Watch button
   does); remove one with Undo (DELETE /v1/me/watchlist/T). Sort A–Z, by latest insider trade, or by when it was added. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,filingHref,fmt,esc,logo,hydrateLogos,spark,enter,trade}=UI;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const list=$("[data-wl-list]"),msgEl=$("[data-wl-msg]"),countEl=$("[data-wl-count]");
const clean=v=>{const t=String(v??"").trim().toUpperCase().replace(/^\$/,"");return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)?t:"";};
const coHref=t=>"/company.html?ticker="+encodeURIComponent(t);
const say=t=>{msgEl.textContent=t||"";};
let items=[],sort="az",drawn=false;
const data=new Map(); // ticker → {state:"loading"|"ok"|"none"|"err", c}

/* ---------- per-stock data, four requests at a time ---------- */
const queue=[];let running=0;
function want(t){const d=data.get(t);if(d&&d.state!=="err")return;data.set(t,{state:"loading"});queue.push(t);pump();}
function pump(){
 while(running<4&&queue.length){const t=queue.shift();running++;
  api("/v1/chart?ticker="+encodeURIComponent(t)+"&days=365")
   .then(c=>data.set(t,{state:"ok",c}),e=>data.set(t,{state:e.status===400?"none":"err"}))
   .finally(()=>{running--;paint(t);pump();if(!running&&!queue.length&&sort==="trade")draw();});}
}
const latest=c=>(c?.markers||[]).reduce((a,m)=>!a||String(m.day)>=String(a.day)?m:a,null);

/* ---------- rows ---------- */
const chg=p=>p==null?"":`<span class="chg chg--${p>0?"up":p<0?"down":"flat"}">${fmt.pct(p,2)}</span>`;
function name(t){const d=data.get(t);return d?.c?.name?fmt.company(d.c.name):"";}
function pxCell(d){
 if(d.state==="loading")return `<span class="skel" style="width:64px;height:16px"></span><span class="skel" style="width:44px;height:12px"></span>`;
 const L=d.c?.last;if(!L)return `<span class="t-label muted">No price yet</span>`;
 return `<span class="strong">${esc(fmt.price(L.close))}</span>${chg(L.pct)}`;
}
function sparkCell(d){
 const v=(d.c?.closes||[]).slice(-31).map(p=>p[1]);
 if(d.state==="loading")return `<span class="skel wl__spark"></span>`;
 return v.length>1?spark(v,{w:96,h:28}):`<span class="wl__spark" aria-hidden="true"></span>`;
}
function tradeCell(d){
 if(d.state==="loading")return `<span class="skel" style="width:70%;height:16px"></span><span class="skel" style="width:50%;height:12px"></span>`;
 if(d.state==="err")return `<span class="t-label muted">The latest insider trade didn't load.</span><button class="btn btn--ghost wl__retry" type="button" data-retry>Try again</button>`;
 const m=latest(d.c);
 if(!m)return `<span class="t-label muted">No open-market insider buys or sales in the last year</span>`;
 const tone=m.planned?"plan":m.kind==="buy"?"up":"down",href=filingHref(m.url,m.id),amt=m.value!=null?fmt.money(m.value):"Filing";
 const amount=href?`<a class="wl__amt ${tone}" href="${esc(href)}" aria-label="${esc(amt==="Filing"?"SEC filing":amt+", SEC filing")}">${esc(amt)}</a>`:(m.value!=null?`<span class="wl__amt ${tone}">${esc(amt)}</span>`:"");
 return `<span class="wl__trade-top">${trade(m)}${amount}</span><span class="t-label muted">${esc(fmt.person(m.owner))}${m.role?", "+esc(fmt.role(m.role)):""} · ${esc(fmt.date(m.day))}</span>`;
}
function row(w){
 const t=w.ticker,d=data.get(t)||{state:"loading"},n=name(t),added=fmt.date(w.created_at);
 return `<li class="row wl" data-t="${esc(t)}"><a class="hit" href="${coHref(t)}" aria-label="Open ${esc(t)}${n?", "+esc(n):""}"></a>
 ${logo(t,32,d.c?.name||"")}
 <span class="wl__id lx-two"${added?` title="Added ${esc(added)}"`:""}><span class="tick">${esc(t)}</span><span class="t-label muted" data-name>${esc(n)}</span></span>
 <span class="wl__px" data-px>${pxCell(d)}</span>
 <span class="wl__spark-slot" data-spark>${sparkCell(d)}</span>
 <span class="wl__trade" data-trade>${tradeCell(d)}</span>
 <button class="btn btn--ghost btn--icon row__link wl__rm" type="button" data-rm aria-label="Remove ${esc(t)} from your watchlist">${UI.icon("x")}</button></li>`;
}
function paint(t){
 const li=list.querySelector(`.wl[data-t="${CSS.escape(t)}"]`);if(!li)return;const d=data.get(t)||{state:"loading"};
 const n=name(t);li.querySelector("[data-name]").textContent=n;li.querySelector(".hit").setAttribute("aria-label","Open "+t+(n?", "+n:""));
 li.querySelector("[data-px]").innerHTML=pxCell(d);li.querySelector("[data-spark]").innerHTML=sparkCell(d);li.querySelector("[data-trade]").innerHTML=tradeCell(d);
}
const ORDER={
 az:(a,b)=>a.ticker.localeCompare(b.ticker,"en"),
 trade:(a,b)=>String(latest(data.get(b.ticker)?.c)?.day||"").localeCompare(String(latest(data.get(a.ticker)?.c)?.day||""))||a.ticker.localeCompare(b.ticker,"en"),
 added:(a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))||a.ticker.localeCompare(b.ticker,"en")};
function draw(){
 list.removeAttribute("aria-busy");
 const n=items.length;countEl.textContent=n?n+(n===1?" stock":" stocks"):"No stocks yet";
 if(!n){list.innerHTML=`<li class="empty" style="padding:16px 0"><h3>Your watchlist is empty</h3><p>Add the stocks you own or follow. Each one shows its price and its insiders' latest buy or sale, linked to the SEC filing, and new filings land in Alerts.</p><button class="btn btn--primary" type="button" data-find>Search a stock</button></li>`;
  list.querySelector("[data-find]").addEventListener("click",()=>UI.palette());return;}
 list.innerHTML=[...items].sort(ORDER[sort]).map(row).join("");
 hydrateLogos(list);
 if(!drawn){drawn=true;enter(list.querySelectorAll(".wl"));}
}

async function load(){
 list.setAttribute("aria-busy","true");
 let w;try{w=await api("/v1/me/watchlist");}catch(e){if(e.status===401||e.status===402)return;
  list.removeAttribute("aria-busy");countEl.innerHTML="&nbsp;";
  list.innerHTML=`<li class="err"><p>Your watchlist didn't load.</p><button class="btn btn--secondary" type="button">Try again</button></li>`;list.querySelector("button").addEventListener("click",load);return;}
 const seen=new Set();items=(w.items||[]).map(x=>({...x,ticker:clean(x.ticker)})).filter(x=>x.ticker&&!seen.has(x.ticker)&&seen.add(x.ticker));
 draw();for(const x of [...items].sort(ORDER.az))want(x.ticker);
}

/* ---------- sort ---------- */
$$("[data-wl-sort]").forEach(b=>b.addEventListener("click",()=>{sort=b.dataset.wlSort;$$("[data-wl-sort]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));draw();}));

/* ---------- add ---------- */
const form=$("[data-wl-add]"),input=$("#wl-ticker"),addBtn=form.querySelector("button");
form.addEventListener("submit",async e=>{
 e.preventDefault();const t=clean(input.value);
 if(!t){say("Enter a ticker symbol, like AAPL.");input.focus();return;}
 if(items.some(x=>x.ticker===t)){say(t+" is already on your watchlist.");input.select();return;}
 addBtn.disabled=true;
 try{await api("/v1/me/watchlist",{method:"POST",body:{ticker:t,mode:"important"}});
  items.push({ticker:t,created_at:new Date().toISOString()});input.value="";say("Added "+t+".");draw();want(t);
  const li=list.querySelector(`.wl[data-t="${CSS.escape(t)}"]`);if(li)enter([li]);}
 catch(err){if(err.status!==401&&err.status!==402)say(err.status===400?"That isn't a ticker Insidir can add. Check the symbol.":"Couldn't add "+t+". Try again.");}
 finally{addBtn.disabled=false;}
});

/* ---------- remove, with undo ---------- */
const toast=$("[data-toast]");let toastTimer=0;
list.addEventListener("click",async e=>{
 const li=e.target.closest(".wl");if(!li)return;const t=li.dataset.t;
 if(e.target.closest("[data-retry]")){e.preventDefault();want(t);paint(t);return;}
 const btn=e.target.closest("[data-rm]");if(!btn)return;
 e.preventDefault();btn.disabled=true;
 try{await api("/v1/me/watchlist/"+encodeURIComponent(t),{method:"DELETE"});}
 catch(err){btn.disabled=false;if(err.status!==401&&err.status!==402)say("Couldn't remove "+t+". Try again.");return;}
 const idx=items.findIndex(x=>x.ticker===t),[old]=items.splice(idx,1);
 const next=li.nextElementSibling?.querySelector("[data-rm]")||li.previousElementSibling?.querySelector("[data-rm]");
 const done=()=>{draw();(next&&list.querySelector(`.wl[data-t="${CSS.escape(next.closest(".wl").dataset.t)}"] [data-rm]`)||input).focus();};
 if(window.Motion?.animate&&!UI.reduce)window.Motion.animate(li,{opacity:[1,0],transform:["translateX(0)","translateX(-16px)"]},{duration:.18}).then(done);else done();
 say("");
 toast.innerHTML=`<span>Removed ${esc(t)}</span><button class="btn btn--secondary" type="button">Undo</button>`;toast.hidden=false;
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},6000);
 toast.querySelector("button").onclick=async()=>{toast.hidden=true;
  try{await api("/v1/me/watchlist",{method:"POST",body:{ticker:t,mode:"important"}});if(!items.some(x=>x.ticker===t))items.push(old);draw();}
  catch(err){if(err.status!==401&&err.status!==402)say("Couldn't add "+t+" back. Add it again above.");}};
});

load();
})();
