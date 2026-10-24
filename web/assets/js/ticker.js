/* The ticker page (company.html?ticker=T). The price is the hero; the signature chart (GET /v1/chart, every insider
   buy and sale on the line) sits under it; tabs: Insiders (GET /v1/ticker/T/insiders, with each insider's track record
   and a bar per past buy's 3-month return), Funds (GET /v1/ticker/T/funds, 13F), Filings (GET /v1/filings?ticker=T),
   Connections (GET /v1/entities/<cik>/connections as a radial graph) and Company (GET /v1/company/profile and /news).
   Watch adds the stock to the watchlist with important alerts on. Each tab loads when first opened. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,filingHref,fmt,esc,logo,hydrateLogos,monogram,face,big,trade,roll}=UI;
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const T=String(new URLSearchParams(location.search).get("ticker")||"").trim().toUpperCase().replace(/^\$/,"");
const TICK=/^[A-Z][A-Z0-9.-]{0,9}$/;
const failed=(el,what,retry)=>{el.innerHTML=`<div class="err"><p>${esc(what)} didn't load.</p>${retry?'<button class="btn btn--secondary" type="button">Try again</button>':""}</div>`;el.querySelector("button")?.addEventListener("click",retry);};
const quiet=(el,h,p)=>{el.innerHTML=`<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;};

if(!TICK.test(T)){
 $("[data-tk-pick]").hidden=false;$("[data-tk-search]").addEventListener("click",()=>UI.palette());
 api("/v1/me/watchlist").then(w=>{const box=$("[data-tk-watch]");box.innerHTML=(w.items||[]).map(x=>`<a class="btn btn--secondary" href="/company.html?ticker=${encodeURIComponent(x.ticker)}">${logo(x.ticker,24)}<span class="tick">${esc(x.ticker)}</span></a>`).join("");hydrateLogos(box);}).catch(()=>{});
 return;
}
$("[data-tk]").hidden=false;
document.title=T+" — Insidir";
let cik=null,name=null;

/* ---------- header, price, chart ---------- */
async function loadChart(){
 const box=$("[data-chart]");
 let c;try{c=await api("/v1/chart?ticker="+encodeURIComponent(T)+"&days=1830");}catch(e){if(e.status===401||e.status===402)return;failed(box,"The chart",loadChart);return;}
 cik=c.cik;name=c.name;
 $("[data-tk-logo]").innerHTML=logo(T,56,c.name);hydrateLogos($("[data-tk-logo]"));
 $("[data-tk-name]").textContent=fmt.company(c.name)||T;
 $("[data-tk-sub]").innerHTML=`<span class="tick">${esc(T)}</span>${c.markers.length?` · ${c.markers.length} insider ${c.markers.length===1?"trade":"trades"} on the chart`:""}`;
 if(!c.closes.length){$("[data-tk-price]").innerHTML=`<span class="t-section muted">No price history yet</span>`;$("[data-tk-chg]").textContent="";quiet(box,"No price history yet","Daily closes for "+T+" haven't been loaded. Its insider trades are below.");loadTab("insiders");return;}
 const L=c.last;
 roll($("[data-tk-price]"),L.close,v=>big(v,"price"),{html:true});
 $("[data-tk-chg]").innerHTML=`${L.pct==null?"":`<span class="chg chg--${L.pct>0?"up":L.pct<0?"down":"flat"}">${fmt.pct(L.pct,2)}</span>`}<span class="muted">Close, ${esc(fmt.date(L.day))}</span>`;
 const chart=window.InsidirChart.mount(box,c,{range:"1Y"});
 $$("[data-range]").forEach(b=>b.addEventListener("click",()=>{$$("[data-range]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));chart.setRange(b.dataset.range);}));
 loadTab(current);
}

/* ---------- watch ---------- */
const wbtn=$("[data-tk-watchbtn]");
const setWatch=on=>{wbtn.setAttribute("aria-pressed",String(on));wbtn.textContent=on?"Watching":"Watch";wbtn.className="btn "+(on?"btn--secondary":"btn--primary");};
api("/v1/me/watchlist").then(w=>setWatch((w.items||[]).some(x=>x.ticker===T))).catch(()=>setWatch(false));
wbtn.addEventListener("click",async()=>{const on=wbtn.getAttribute("aria-pressed")==="true";wbtn.disabled=true;
 try{if(on)await api("/v1/me/watchlist/"+encodeURIComponent(T),{method:"DELETE"});else await api("/v1/me/watchlist",{method:"POST",body:{ticker:T,mode:"important"}});setWatch(!on);}catch{}finally{wbtn.disabled=false;}});

/* ---------- tabs ---------- */
const loaded=new Set();let current=(location.hash||"").slice(1)||"insiders";
if(!["insiders","funds","filings","connections","company"].includes(current))current="insiders";
function show(k,focus){current=k;for(const b of $$("[role=tab]")){const on=b.getAttribute("aria-controls")==="pan-"+k;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();}
 for(const p of $$("[data-pan]"))p.hidden=p.dataset.pan!==k;history.replaceState(null,"","#"+k);loadTab(k);}
$$("[role=tab]").forEach((b,i,all)=>{b.addEventListener("click",()=>show(b.getAttribute("aria-controls").slice(4)));
 b.addEventListener("keydown",e=>{if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft")return;const n=all[(i+(e.key==="ArrowRight"?1:all.length-1))%all.length];show(n.getAttribute("aria-controls").slice(4),true);});});
function loadTab(k){if(loaded.has(k))return;if(k==="connections"&&!cik)return;loaded.add(k);({insiders,funds,filings,connections,company})[k]();}

const bars=list=>`<span class="bars" role="img" aria-label="3-month return after each past buy">${list.map(r=>r==null?`<i style="height:3px" title="Not 3 months yet"></i>`:`<i class="${r>=0?"up":"down"}" style="height:${Math.max(3,Math.min(24,Math.round(Math.abs(r)*48)))}px" title="${fmt.pct(r,0)}"></i>`).join("")}</span>`;
async function insiders(){
 const el=$("[data-pan=insiders]");
 let d;try{d=await api("/v1/ticker/"+encodeURIComponent(T)+"/insiders");}catch(e){loaded.delete("insiders");failed(el,"The insiders",insiders);return;}
 if(!d.items.length){quiet(el,"No open-market insider trades in two years",`Nobody at ${fmt.company(name)||T} bought or sold on the open market since ${fmt.date(new Date(Date.now()-730*864e5).toISOString())}. Watch it to hear the minute someone does.`);return;}
 el.innerHTML=`<div class="tk-table"><table class="table tk-ins"><thead><tr><th scope="col">Insider</th><th scope="col">Latest trade</th><th scope="col" class="r">Bought</th><th scope="col" class="r">Sold</th><th scope="col">Track record</th></tr></thead><tbody>
 ${d.items.map(x=>`<tr><td><span class="tk-who">${face(x.owner,{cik:x.ownerCik,ticker:T,size:24})}<a href="/person.html?cik=${encodeURIComponent(x.ownerCik.padStart(10,"0"))}"><span class="strong">${esc(fmt.person(x.owner))}</span> <span class="muted t-label">${esc(fmt.role(x.role))}</span></a></span></td>
  <td class="c-last">${x.last?`<span class="tk-track">${trade(x.last)}<span class="t-label muted">${esc(fmt.money(x.last.value))}, ${esc(fmt.date(x.last.day,false))}</span>${x.last.url?`<a class="tk-row-link t-micro" href="${esc(filingHref(x.last.url,x.last.id))}">Filing</a>`:""}</span>`:""}</td>
  <td class="r c-bought ${x.bought?"up":"muted"}">${x.bought?fmt.money(x.bought):""}</td><td class="r c-sold ${x.sold?"down":"muted"}">${x.sold?fmt.money(x.sold):""}</td>
  <td class="c-track">${x.track?`<span class="tk-track">${bars(x.bars)}<span class="t-label">${x.track.hits}/${x.track.n} up after 3 months</span></span>`:`<span class="t-label muted">${x.buys?"Too early to tell":"No buys"}</span>`}</td></tr>`).join("")}</tbody></table></div>
 <p class="t-label muted">Open-market buys and sales in the last two years. A track record counts buys whose 3 months have passed.</p>`;hydrateLogos(el);
}
async function funds(){
 const el=$("[data-pan=funds]");
 let d;try{d=await api("/v1/ticker/"+encodeURIComponent(T)+"/funds");}catch{loaded.delete("funds");failed(el,"The funds",funds);return;}
 if(!d.items.length){quiet(el,"None of the funds Insidir tracks hold it",`Insidir imports the 13F filings of a set of large funds. None of them reported holding ${fmt.company(name)||T} in their latest quarter.`);return;}
 el.innerHTML=`<div class="tk-table"><table class="table"><thead><tr><th scope="col">Fund</th><th scope="col" class="r">Shares</th><th scope="col" class="r">Value</th><th scope="col" class="r">Change</th><th scope="col">Quarter</th></tr></thead><tbody>
 ${d.items.map(f=>`<tr><td><span class="tk-who">${monogram(f.fund,24)}<a href="/entity.html?cik=${encodeURIComponent(f.fundCik)}" class="strong">${esc(fmt.company(f.fund))}</a></span></td><td class="r">${fmt.shares(f.shares)}</td><td class="r">${fmt.money(f.value)}</td>
  <td class="r ${f.isNew?"up":f.change>0?"up":f.change<0?"down":"muted"}">${f.isNew?"New":f.change==null?"—":fmt.pct(f.change,0)}</td><td>${f.url?`<a class="tk-row-link" href="${esc(f.url)}" target="_blank" rel="nofollow noopener">${esc(fmt.date(f.period,false))}</a>`:esc(fmt.date(f.period,false))}</td></tr>`).join("")}</tbody></table></div>
 <p class="t-label muted">${esc(d.note)}</p>`;
}
async function filings(){
 const el=$("[data-pan=filings]");
 let d;try{d=await api("/v1/filings?ticker="+encodeURIComponent(T)+"&limit=30");}catch{loaded.delete("filings");failed(el,"The filings",filings);return;}
 const items=d.items||[];
 if(!items.length){quiet(el,"No filings imported yet","Filings for "+T+" appear here as they post to SEC EDGAR.");return;}
 el.innerHTML=`<ul class="rows">${items.map(f=>`<li class="row tk-filing">${f.source_url||f.accession?`<a class="hit" href="${esc(filingHref(f.source_url,f.accession))}" aria-label="Form ${esc(f.form_type||f.title)} filed ${esc(fmt.date(f.published_at))}"></a>`:""}
  <span class="strong">Form ${esc(f.form_type||f.title||"")}${f.is_amendment?" (amended)":""}</span><span class="t-label muted">${esc((f.owner_names||[]).map(fmt.person).join(", ")||fmt.company(f.issuer_name))}</span><span class="t-micro muted">${esc(fmt.date(f.published_at))}</span></li>`).join("")}</ul>`;
}
async function connections(){
 const el=$("[data-pan=connections]");
 let d;try{d=await api("/v1/entities/"+encodeURIComponent(String(cik).padStart(10,"0"))+"/connections");}catch{loaded.delete("connections");failed(el,"The connections",connections);return;}
 if(!(d.edges||[]).length){quiet(el,"No connections yet","People and companies tied to "+T+" by SEC filings appear here.");return;}
 el.innerHTML=`<div data-graph></div><p class="t-label muted">Ties from SEC filings: who reports trades at ${esc(fmt.company(name)||T)}, and where else they do. Hover a name to follow its path.</p>`;
 window.InsidirGraph.mount(el.querySelector("[data-graph]"),d,{cap:25});
}
async function company(){
 const el=$("[data-pan=company]");
 const [p,n]=await Promise.all([api("/v1/company/profile?ticker="+encodeURIComponent(T)).catch(()=>null),api("/v1/company/news?ticker="+encodeURIComponent(T)).catch(()=>null)]);
 if(!p&&!n){quiet(el,"Company details aren't available right now","The profile and headlines come from public sources that didn't answer. The insider data above is unaffected.");loaded.delete("company");return;}
 const facts=[["Website",p?.website],["Employees",p?.employees?Number(p.employees).toLocaleString("en-US"):null],["Founded",p?.inception?String(p.inception).slice(0,4):null],["Headquarters",p?.headquarters]].filter(x=>x[1]);
 const news=(n?.items||[]).slice(0,6);
 el.innerHTML=`<div class="tk-about"><div><p class="t-body">${esc(p?.description||"No description on file.")}</p>
  ${news.length?`<div class="tk-news">${news.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noopener" class="t-body">${esc(x.title)}<br><span class="t-micro muted">${esc(x.source||"")}${x.publishedAt?" · "+esc(fmt.date(x.publishedAt)):""}</span></a>`).join("")}</div>`:""}</div>
  ${facts.length?`<dl class="tk-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${k==="Website"?`<a href="${esc(/^https?:/.test(v)?v:"https://"+v)}" target="_blank" rel="noopener">${esc(String(v).replace(/^https?:\/\//,""))}</a>`:esc(v)}</dd></div>`).join("")}</dl>`:""}</div>`;
}

/* ---------- your note: the private research journal for this ticker only ---------- */
const NOTE_MAX=1500,noteEl=$("[data-tk-note]"),noteText=$("#tk-note-text"),noteMsg=t=>{$("[data-note-msg]").textContent=t;};
let saved=null,status="researching",noteBusy=false;
const markStatus=s=>{status=s;$$("[data-status]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.status===s)));};
const count=()=>{$("[data-note-count]").textContent=noteText.value.length.toLocaleString("en-US")+" of "+NOTE_MAX.toLocaleString("en-US")+" characters";};
const showNote=n=>{saved=n?{status:n.review_status,notes:n.notes||""}:null;markStatus(saved?saved.status:"researching");noteText.value=saved?saved.notes:"";count();$("[data-note-delete]").hidden=!saved;};
async function loadNote(){
 try{const d=await api("/v1/me/research-decisions?ticker="+encodeURIComponent(T));showNote((d.items||[]).find(x=>x.ticker===T)||null);
  noteMsg(saved?"Saved "+fmt.date(d.items.find(x=>x.ticker===T).updated_at)+".":"");}
 catch(e){if(e.status===401||e.status===402)return;noteMsg("Your note didn't load.");}
 finally{noteEl.removeAttribute("aria-busy");}
}
async function saveNote(next=status){
 if(noteBusy)return;const notes=noteText.value.trim();
 if(notes.length>NOTE_MAX){noteMsg("Notes are at most 1,500 characters.");return;}
 const before=saved?saved.status:null;noteBusy=true;markStatus(next);noteMsg("Saving…");$("[data-note-undo]").hidden=true;
 try{const r=await api("/v1/me/research-decisions",{method:"POST",body:{ticker:T,reviewStatus:next,notes}});
  saved={status:r.item.review_status,notes:r.item.notes||""};$("[data-note-delete]").hidden=false;noteMsg("Saved.");}
 catch(e){if(before)markStatus(before);noteMsg("Not saved: "+e.message);}
 finally{noteBusy=false;}
}
$$("[data-status]").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.status===status&&saved)return;if(saved||noteText.value.trim())saveNote(b.dataset.status);else markStatus(b.dataset.status);}));
$("[data-note-save]").addEventListener("click",()=>saveNote());
noteText.addEventListener("input",count);
noteText.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){e.preventDefault();saveNote();}});
$("[data-note-delete]").addEventListener("click",async()=>{
 if(!saved||noteBusy)return;const gone=saved;noteBusy=true;noteMsg("Deleting…");
 try{await api("/v1/me/research-decisions?ticker="+encodeURIComponent(T),{method:"DELETE"});showNote(null);noteMsg("Note deleted.");
  const u=$("[data-note-undo]");u.hidden=false;u.onclick=async()=>{u.hidden=true;noteText.value=gone.notes;count();await saveNote(gone.status);};}
 catch(e){noteMsg("Not deleted: "+e.message);}
 finally{noteBusy=false;}
});
loadNote();

loadChart();show(current);
})();
