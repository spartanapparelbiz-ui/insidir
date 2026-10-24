/* Portfolio (portfolio.html) on the ui.css design: the member's own holdings and the insider filings at each.
     GET/POST /v1/me/manual-holdings, DELETE /v1/me/manual-holdings/<T>   self-reported holdings (add, edit = save the
                                                                          same ticker again, remove with Undo) and the
                                                                          latest Form 4 per ticker in 30 days
     GET /v1/me/brokerage/status, GET /v1/me/brokerage/portfolio          optional read-only brokerage view (SnapTrade)
     POST /v1/me/brokerage/connect, DELETE /v1/me/brokerage                connect (to SnapTrade's own page) and disconnect
   No orders, no live prices, nothing invented: an empty list says so. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,fmt,esc,logo,hydrateLogos,filingHref,trade}=UI;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const TICK=/^[A-Z0-9][A-Z0-9.-]{0,14}$/,QTY=/^\d{1,10}(?:\.\d{1,8})?$/;
const list=$("[data-pf-list]"),actEl=$("[data-pf-activity]"),msg=t=>{$("[data-pf-msg]").textContent=t;};
const qty=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:8}):"—";};
const money=(v,c="USD")=>v==null||!Number.isFinite(Number(v))?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:/^[A-Z]{3}$/.test(c)?c:"USD",maximumFractionDigits:2}).format(Number(v));
const trim=v=>{const s=String(v??"");return s.includes(".")?s.replace(/0+$/,"").replace(/\.$/,""):s;};
let holdings=[],manualActivity=[],brokerActivity=[],editing=null;

/* ---------- who filed: each reporting owner links to their page; a joint filing names every owner ---------- */
const SUFFIX=/^(?:inc|llc|l\.?l\.?c|l\.?p|lp|ltd|limited|co|corp|corporation|company|plc|n\.?a|n\.?v|s\.?a|ag|se|jr|sr|ii|iii|iv|v|esq|m\.?d|ph\.?d)\.?$/i;
const splitNames=s=>String(s??"").split(/\s*,\s*/).filter(Boolean).reduce((o,p)=>{if(o.length&&SUFFIX.test(p))o[o.length-1]+=", "+p;else o.push(p);return o;},[]);
const ownersOf=t=>{const l=t.owner_cik?[{cik:t.owner_cik,name:t.owner_name}]:Array.isArray(t.owners)&&t.owners.length?t.owners.filter(o=>o&&(o.cik||o.name)):splitNames(t.owner_name).map(name=>({cik:null,name}));return l.length?l.slice(0,12):[{cik:null,name:""}];};
const cikOf=c=>{const s=String(c??"").trim();return /^\d{1,10}$/.test(s)&&/[1-9]/.test(s)?s.replace(/^0+/,""):"";};
const nameLink=o=>{const n=fmt.person(o.name||"A reporting person"),c=cikOf(o.cik);return c?`<a class="pf-link" href="/person.html?cik=${c}">${esc(n)}</a>`:esc(n);};
const did=t=>t.category==="reported_purchase"?trade({kind:"buy"}):t.category==="reported_sale"?trade({kind:"sell"}):`<span class="t-label muted">Other Form 4 transaction</span>`;
function activityRow(t){
 const T=String(t.ticker||"").toUpperCase(),owners=ownersOf(t),lead=owners.find(o=>cikOf(o.cik))||owners[0];
 const href=t.source_url||t.accession?filingHref(t.source_url,t.accession):"";
 return `<li class="row pf-act">${logo(T,32)}
  <span class="pf-act__what"><span class="pf-act__line"><a class="strong pf-link" href="/company.html?ticker=${encodeURIComponent(T)}">${esc(T)}</a>${did(t)}</span>
   <span class="pf-act__who">${UI.face(lead.name,{cik:lead.cik,ticker:T,issuerCik:t.issuer_cik,size:24})}<span class="t-label muted">${owners.map(nameLink).join(", ")}</span></span></span>
  <span class="pf-act__end"><span class="t-micro muted">Filed ${esc(fmt.date(t.published_at)||"—")}</span>${href?`<a class="pf-link t-label" href="${esc(href)}">Filing</a>`:""}</span></li>`;
}
function drawActivity(){
 actEl.removeAttribute("aria-busy");
 const by=new Map();for(const t of [...manualActivity,...brokerActivity])if(TICK.test(String(t.ticker||"").toUpperCase())&&!by.has(t.ticker))by.set(t.ticker,t);
 const items=[...by.values()].sort((a,b)=>String(b.published_at).localeCompare(String(a.published_at)));
 actEl.innerHTML=items.length?items.map(activityRow).join(""):`<li class="empty pf-empty"><h3>No insider filings at your stocks in 30 days</h3><p>No imported Form 4 filing matches your tickers in the past 30 days. That does not mean nothing was filed; each stock page lists every filing Insidir has.</p></li>`;
 hydrateLogos(actEl);
}

/* ---------- holdings ---------- */
function holdingRow(h){
 const T=String(h.ticker||"").toUpperCase();if(!TICK.test(T))return "";
 const a=manualActivity.find(x=>x.ticker===T)||brokerActivity.find(x=>x.ticker===T);
 if(editing===T)return `<li class="row pf-row is-editing" data-t="${esc(T)}">${logo(T,32)}<span class="strong">${esc(T)}</span>
  <form class="pf-edit" data-edit><label class="sr-only" for="pf-e-${esc(T)}">Shares of ${esc(T)}</label><input class="input" id="pf-e-${esc(T)}" inputmode="decimal" autocomplete="off" maxlength="20" value="${esc(trim(h.quantity))}"><button class="btn btn--primary" type="submit">Save</button><button class="btn btn--ghost" type="button" data-cancel>Cancel</button></form></li>`;
 return `<li class="row pf-row" data-t="${esc(T)}">${logo(T,32)}
  <span class="pf-row__id"><a class="strong pf-link" href="/company.html?ticker=${encodeURIComponent(T)}">${esc(T)}</a><span class="t-micro muted">${a?`Insider filing ${esc(fmt.ago(a.published_at))} ago`:"No insider filing in 30 days"} · edited ${esc(fmt.date(h.updated_at)||"—")}</span></span>
  <span class="pf-row__qty"><span class="t-body">${esc(qty(h.quantity))}</span><span class="t-micro muted"> shares</span></span>
  <span class="pf-row__acts"><button class="btn btn--ghost" type="button" data-edit-t aria-label="Edit ${esc(T)} shares">Edit</button><button class="btn btn--ghost" type="button" data-remove aria-label="Remove ${esc(T)}">Remove</button></span></li>`;
}
function drawHoldings(){
 list.removeAttribute("aria-busy");
 $("[data-pf-count]").textContent=holdings.length?`${holdings.length} ${holdings.length===1?"stock":"stocks"} you entered · read-only: no orders, no live prices`:"Your stocks and the insider filings at each one. Read-only: no orders, no live prices.";
 list.innerHTML=holdings.length?holdings.map(holdingRow).join(""):`<li class="empty pf-empty"><h3>No holdings yet</h3><p>Add a ticker and the number of shares you own. Insidir shows the insider filings at each one.</p></li>`;
 hydrateLogos(list);
 const inp=list.querySelector(".is-editing input");if(inp){inp.focus();inp.select();}
}
async function load(){
 try{const d=await api("/v1/me/manual-holdings");holdings=d.items||[];manualActivity=d.recentSecActivity||[];drawHoldings();drawActivity();}
 catch(e){if(e.status===401||e.status===402)return;list.removeAttribute("aria-busy");
  list.innerHTML=`<li class="err"><p>Your holdings didn't load.</p><button class="btn btn--secondary" type="button">Try again</button></li>`;list.querySelector("button").addEventListener("click",load);
  if(!brokerActivity.length){actEl.removeAttribute("aria-busy");actEl.innerHTML=`<li class="err"><p>Insider activity didn't load.</p></li>`;}}
}
const valid=(t,q)=>TICK.test(t)&&QTY.test(q)&&Number(q)>0&&Number(q)<=1e9;
async function save(t,q){await api("/v1/me/manual-holdings",{method:"POST",body:{ticker:t,quantity:q}});}
$("[data-pf-form]").addEventListener("submit",async e=>{
 e.preventDefault();const ti=$("#pf-ticker"),qi=$("#pf-qty"),t=ti.value.trim().toUpperCase().replace(/^\$/,""),q=qi.value.trim().replace(/,/g,"");
 ti.toggleAttribute("aria-invalid",!TICK.test(t));qi.toggleAttribute("aria-invalid",!(QTY.test(q)&&Number(q)>0&&Number(q)<=1e9));
 if(!valid(t,q)){msg("Enter a ticker and a number of shares above zero, with up to 8 decimals.");return;}
 const b=$("[data-pf-save]");b.disabled=true;msg("Saving "+t+"…");
 try{const had=holdings.some(h=>h.ticker===t);await save(t,q);ti.value="";qi.value="";await load();msg(had?t+" updated to "+qty(q)+" shares.":t+" added.");}
 catch(err){msg(err.message);}finally{b.disabled=false;}
});
list.addEventListener("click",async e=>{
 const li=e.target.closest("[data-t]");if(!li)return;const T=li.dataset.t,h=holdings.find(x=>x.ticker===T);if(!h)return;
 if(e.target.closest("[data-edit-t]")){editing=T;drawHoldings();return;}
 if(e.target.closest("[data-cancel]")){editing=null;drawHoldings();return;}
 if(e.target.closest("[data-remove]")){
  const idx=holdings.indexOf(h);holdings.splice(idx,1);drawHoldings();
  try{await api("/v1/me/manual-holdings/"+encodeURIComponent(T),{method:"DELETE"});}catch(err){holdings.splice(idx,0,h);drawHoldings();msg("Couldn't remove "+T+": "+err.message);return;}
  toast(`${T} removed`,async()=>{try{await save(T,String(h.quantity));await load();msg(T+" restored.");}catch(err){msg(err.message);}});
 }
});
list.addEventListener("submit",async e=>{
 const f=e.target.closest("[data-edit]");if(!f)return;e.preventDefault();
 const T=f.closest("[data-t]").dataset.t,q=$("input",f).value.trim().replace(/,/g,"");
 if(!valid(T,q)){$("input",f).setAttribute("aria-invalid","");msg("Enter a number of shares above zero, with up to 8 decimals.");return;}
 $$("button",f).forEach(b=>b.disabled=true);
 try{await save(T,q);editing=null;await load();msg(T+" updated to "+qty(q)+" shares.");}catch(err){msg(err.message);$$("button",f).forEach(b=>b.disabled=false);}
});
list.addEventListener("keydown",e=>{if(e.key==="Escape"&&editing){editing=null;drawHoldings();}});
const toastEl=$("[data-toast]");let toastTimer=0;
function toast(text,undo){toastEl.innerHTML=`<span>${esc(text)}</span>${undo?'<button class="btn btn--secondary" type="button">Undo</button>':""}`;toastEl.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toastEl.hidden=true;},6000);
 const b=toastEl.querySelector("button");if(b)b.onclick=()=>{toastEl.hidden=true;undo();};}

/* ---------- brokerage (read-only) ---------- */
const bstatus=t=>{$("[data-pf-bstatus]").textContent=t;};
const B={connect:$("[data-pf-connect]"),refresh:$("[data-pf-refresh]"),disconnect:$("[data-pf-disconnect]")},accEl=$("[data-pf-accounts]");
function drawAccounts(d){
 const accounts=Array.isArray(d.accounts)?d.accounts:[];
 accEl.innerHTML=accounts.length?accounts.map(a=>{const pos=Array.isArray(a.positions)?a.positions:[];
  return `<article class="pf-acct"><header class="pf-acct__head"><div><p class="strong">${esc(a.name)}</p><p class="t-micro muted">${esc(a.maskedNumber||"Masked account")} · read-only · positions as of ${esc(fmt.date(a.positionsAsOf||a.accountSyncedAt)||"not reported")}</p></div>
   <div class="pf-acct__val"><p class="t-section">${esc(money(a.netValue,a.currency))}</p><p class="t-micro muted">Value as reported by your brokerage</p></div></header>
   ${a.error?`<p class="t-label muted">${esc(a.error)}</p>`:pos.length?`<div class="pf-scroll"><table class="table pf-table"><thead><tr><th scope="col">Position</th><th scope="col" class="r">Units</th><th scope="col" class="r">Last reported price</th><th scope="col">Insider filings</th></tr></thead><tbody>${pos.map(p=>{const T=TICK.test(String(p.researchTicker||""))?p.researchTicker:null;
    return `<tr><td><span class="pf-pos">${T?logo(T,24):`<span class="logo logo--24" aria-hidden="true">·</span>`}<span><span class="strong">${esc(p.symbol)}</span><span class="t-micro muted pf-line">${esc(p.description||p.kind)}</span></span></span></td><td class="r">${esc(qty(p.quantity))}</td><td class="r">${esc(money(p.price,p.currency))}</td>
     <td>${T?`<a class="pf-link t-label" href="/company.html?ticker=${encodeURIComponent(T)}">Stock page</a>`:`<span class="t-label muted">No exact U.S. stock match</span>`}</td></tr>`;}).join("")}</tbody></table></div>`:`<p class="t-label muted">No positions came back for this account. Some holdings may not be available through the connection.</p>`}</article>`;}).join(""):
  `<div class="empty"><h3>No investment accounts shared yet</h3><p>Choose which accounts to share in SnapTrade, then refresh.</p></div>`;
 hydrateLogos(accEl);
 brokerActivity=Array.isArray(d.recentSecActivity)?d.recentSecActivity:[];drawActivity();
}
async function refresh(){
 bstatus("Loading your brokerage holdings…");B.refresh.disabled=true;
 try{const d=await api("/v1/me/brokerage/portfolio");drawAccounts(d);bstatus(d.truncatedAccounts?"Connected, read-only. Only the first eight investment accounts are shown.":"Connected, read-only. Brokerage data may be delayed; nothing here is an order.");}
 catch(e){if(e.status===401||e.status===402)return;bstatus(e.message);}finally{B.refresh.disabled=false;}
}
async function status(){
 try{const r=await api("/v1/me/brokerage/status");
  B.connect.hidden=!r.available||r.connected;B.refresh.hidden=!r.connected||!r.available;B.disconnect.hidden=!r.connected;
  if(!r.available){accEl.innerHTML="";bstatus(r.connected?"A brokerage permission exists, but brokerage access is switched off right now. You can disconnect it.":"Brokerage connections aren't available yet. Your own holdings above work without one.");return;}
  if(!r.connected){accEl.innerHTML="";brokerActivity=[];drawActivity();if(!flagMsg)bstatus("Not connected. You can give Insidir read-only access through SnapTrade; it can never place trades.");return;}
  await refresh();
 }catch(e){if(e.status===401||e.status===402)return;bstatus("Your brokerage connection couldn't be checked: "+e.message);}
}
B.connect.addEventListener("click",async()=>{B.connect.disabled=true;bstatus("Creating a read-only authorization…");
 try{const r=await api("/v1/me/brokerage/connect",{method:"POST"});const dest=new URL(r.url);
  if(dest.protocol!=="https:"||dest.hostname!=="dashboard.snaptrade.com")throw Error("Invalid authorization destination");location.assign(dest.toString());}
 catch(e){bstatus(e.message);B.connect.disabled=false;}});
B.refresh.addEventListener("click",refresh);
const confirmEl=$("[data-pf-confirm]");
B.disconnect.addEventListener("click",()=>{confirmEl.hidden=false;$("[data-pf-no]").focus();});
$("[data-pf-no]").addEventListener("click",()=>{confirmEl.hidden=true;B.disconnect.focus();});
$("[data-pf-yes]").addEventListener("click",async()=>{const y=$("[data-pf-yes]");y.disabled=true;bstatus("Revoking brokerage access…");
 try{await api("/v1/me/brokerage",{method:"DELETE"});confirmEl.hidden=true;await status();bstatus("Disconnected. Insidir no longer has access to your brokerage.");}
 catch(e){bstatus(e.message+". If needed, also revoke Insidir in your SnapTrade account.");}finally{y.disabled=false;}});
const flag=new URLSearchParams(location.search).get("connection");
const flagMsg={connected:"Brokerage authorization completed. Checking access…",cancelled:"Brokerage authorization was cancelled. No account was linked.",error:"The connection failed or expired. Please try again."}[flag]||"";
if(flagMsg){bstatus(flagMsg);history.replaceState(null,"",location.pathname);}

load();status();
})();
