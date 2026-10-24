/* Insidir Intelligence (intelligence.html) on the ui.css design. Sections, each from the /v1 API and shown as received:
     Ask        POST /v1/me/intelligence/investigate?stream=1 (NDJSON stages, then a cited report), follow-ups carry the
                previous plan as context; POST /v1/me/intelligence/synthesize for an AI synthesis checked against the sources
     Briefing   GET /v1/me/intelligence/briefing?days=, POST /v1/me/intelligence/preferences {frequency},
                GET /v1/ai/explain?accession= (only when GET /v1/ai/status says AI is configured), POST /v1/me/watchlist
     Overview   GET /v1/me/intelligence/instrument: counts from stored records and the records behind each count
     Tape       GET /v1/intelligence/tape?days=&form=&ticker=&person=&before=
     Structure  GET /v1/intelligence/structure?ticker=
     Mirror     GET /v1/intelligence/mirror/managers, /managers/<cik>, /simulate?cik=&budget=
   Server text is escaped; only https links to sec.gov (or Insidir's own pages) become links. Insiders get initials, never
   photos. Every answer keeps its sources and says it is research, not investment advice. 401/402 go to sign-in and
   subscribe (ui.js). */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {fmt,esc,logo,hydrateLogos,monogram,filingHref}=UI;
// Insiders: their real photo from the media pipeline when one exists, initials until then (ui.js face()).
const face=(name,cik,ticker,issuerCik,size=24)=>UI.face(name,{cik,ticker,issuerCik,size});
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia("(prefers-reduced-motion: reduce)");
const scrollTo=(el,block="start")=>el&&el.scrollIntoView({behavior:reduce.matches?"auto":"smooth",block});
// The gate scripts look inside main.ix; the shell owns <main>, so the page marks it.
const main=$("#main");if(main)main.classList.add("ix");

/* ---------- requests ---------- */
const offline=()=>Object.assign(Error("Insidir could not be reached. Check your connection and try again."),{status:0});
const api=(p,o)=>UI.api(p,o).catch(e=>{throw e&&e.status!=null?e:offline();});

/* ---------- safe links and formats (display only; nothing here computes a figure) ---------- */
const secUrl=u=>{try{const x=new URL(u);return x.protocol==="https:"&&(x.hostname==="www.sec.gov"||x.hostname==="data.sec.gov")?x.href:null;}catch{return null;}};
const localHref=h=>typeof h==="string"&&/^\/?(#[a-z-]+|[a-z-]+\.html(\?[A-Za-z0-9=&%._-]*)?)$/.test(h)?h:null;
const tickerOk=t=>typeof t==="string"&&/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t);
const cikOk=c=>typeof c==="string"&&/^\d{1,10}$/.test(c)&&/[1-9]/.test(c);
const DAY={month:"short",day:"numeric",year:"numeric",timeZone:"UTC"};
const asDate=v=>new Date(String(v).length===10?v+"T12:00:00Z":v);
const fmtDay=v=>{if(!v)return "Not stated";const d=asDate(v);return Number.isFinite(d.getTime())?d.toLocaleDateString("en-US",DAY):"Not stated";};
const fmtShort=v=>{const d=asDate(v);return v&&Number.isFinite(d.getTime())?d.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"}):"—";};
const fmtTime=v=>{if(!v)return "Not stated";const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Not stated";};
const fmtClock=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";};
const fmtRange=r=>!r?"Not stated":r.from===r.to?fmtDay(r.from):fmtDay(r.from)+" – "+fmtDay(r.to);
const usd=(n,cents=false)=>n==null||!Number.isFinite(Number(n))?"—":"$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:cents?2:0,maximumFractionDigits:cents?2:0});
const num=n=>n==null?"—":Number(n).toLocaleString("en-US",{maximumFractionDigits:4});
const price=n=>n==null?"—":"$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4});
const pct=(x,d=1)=>x==null?"—":(x*100).toFixed(d)+"%";
const ago=v=>{const t=Date.parse(v);if(!Number.isFinite(t))return "";const m=Math.max(1,Math.round((Date.now()-t)/60000));return m<60?m+" min ago":m<1440?Math.round(m/60)+" h ago":Math.round(m/1440)+" d ago";};
const daysBetween=(a,b)=>Math.round((Date.parse(String(b).slice(0,10)+"T12:00:00Z")-Date.parse(String(a).slice(0,10)+"T12:00:00Z"))/86400000);
const plural=(n,one,many)=>n+" "+(n===1?one:many||one+"s");
const companyLink=(t,label)=>tickerOk(t)?`<a class="ix-link" href="/company.html?ticker=${encodeURIComponent(t)}">${esc(label||t)}</a>`:`<span>${esc(label||"—")}</span>`;
const personLink=(cik,name)=>{const c=String(cik||"").replace(/^0+/,"");return cikOk(c)?`<a class="ix-link" href="/person.html?cik=${encodeURIComponent(c)}">${esc(name)}</a>`:esc(name);};
const ext=(url,label)=>{const u=secUrl(url);return u?`<a class="ix-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`:"";};
// An ownership filing (Form 3/4/5) also opens inside Insidir.
const inApp=(url,acc,label="Open filing")=>{const h=filingHref(url,acc);return /^\/filing\.html\?/.test(h)?`<a class="ix-open" href="${esc(h)}">${esc(label)}</a>`:"";};
const loader=label=>`<div class="ix-loading" role="status"><span class="skel" style="display:block;width:40%;height:14px"></span><span class="t-label muted">${esc(label)}…</span></div>`;
const errorBlock=(title,e,retry)=>`<div class="err ix-error" role="alert"><p><span class="strong">${esc(title)}</span> ${esc(e&&e.message||"Something went wrong.")}</p>${retry?`<button type="button" class="btn btn--secondary" data-retry="${esc(retry)}">Try again</button>`:""}</div>`;
const empty=(title,text,actions="")=>`<div class="empty ix-empty"><h3>${esc(title)}</h3><p>${text}</p>${actions?`<div class="ix-actions">${actions}</div>`:""}</div>`;
const tradeCls=c=>c==="reported_purchase"||c==="purchase"?"up":c==="reported_sale"||c==="sale"?"down":"";
// A new member's first steps on Today tick off reading the briefing and asking a question.
const onboarded=step=>{try{localStorage.setItem("insidir:onboard:"+step,"1");}catch{/* private mode */}};

/* A time axis with one tick per real disclosure (selected: ringed; new since the last visit: taller). */
function strip(events,{from,to,selected=null,width=900,height=44,ticks=6,label}){
 const span=Math.max(1,to-from),x=t=>8+(width-16)*(t-from)/span,r=n=>Math.round(n*10)/10,base=height-16;
 let axis=`<line class="ix-axis" x1="8" x2="${width-8}" y1="${base}" y2="${base}"/>`;
 for(let i=0;i<=ticks;i++){const t=from+span*i/ticks,xx=r(x(t));
  axis+=`<text class="ix-axis__l" x="${xx}" y="${height-2}" text-anchor="${i===0?"start":i===ticks?"end":"middle"}">${esc(new Date(t).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"}))}</text>`;}
 const marks=events.filter(e=>e.t>=from&&e.t<=to).map(e=>{const xx=r(x(e.t)),sel=e.id===selected,top=e.strong?4:12;
  return `<g class="iv-tick${e.strong?" is-strong":""}${sel?" is-selected":""}" data-event="${esc(e.id)}"><rect class="ix-hit" x="${xx-5}" y="0" width="10" height="${base}"/><line x1="${xx}" x2="${xx}" y1="${top}" y2="${base}"/>${sel?`<circle cx="${xx}" cy="${top}" r="4"/>`:""}</g>`;}).join("");
 return `<svg class="ix-strip" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}">${axis}${marks}</svg>`;
}
/* Small bars (filings per month, reported value per quarter). */
const bars=(values,labels,label)=>{const max=Math.max(1,...values);
 return `<div class="ix-bars" role="img" aria-label="${esc(label)}">${values.map((v,i)=>`<i style="height:${v?Math.max(2,Math.round(40*v/max)):0}px" title="${esc((labels[i]||"")+": "+v)}"></i>`).join("")}</div>${labels.length?`<div class="ix-bars__x t-micro muted"><span>${esc(labels[0])}</span><span>${esc(labels.at(-1))}</span></div>`:""}`;};

/* ======================= OVERVIEW ======================= */
const MARKET=["filings","companies","insiders","purchases","sales","changes"];
const MEMBER=["findings","watchlist","people","holdings"];
const inst={data:null,cats:{},selected:"findings",brief:null};
const instEl=$("[data-instrument]");
const countOf=c=>!c||c.count==null?"—":Number(c.count).toLocaleString("en-US");
function tileHtml(id){
 const c=inst.cats[id]||{},tone=id==="purchases"?" up":id==="sales"?" down":"";
 const sub=c.value?fmt.money(c.value)+" reported value":c.detail||c.unit||"";
 return `<button type="button" class="card ix-tile${c.count===0?" is-empty":""}" data-cat="${id}" aria-pressed="${inst.selected===id}"><span class="t-label muted">${esc(c.label||id)}</span><span class="ix-tile__n${tone}" data-count="${id}">${countOf(c)}</span><span class="t-micro muted">${esc(sub)}</span></button>`;
}
function findingsCategory(){
 const b=inst.brief;
 if(!b)return {id:"findings",label:"Research findings",count:null,unit:"stories in your briefing",records:[],explore:{label:"Read the briefing",href:"#briefing"},loading:true};
 const fresh=(b.stories||[]).filter(s=>s.isNew).length;
 return {id:"findings",label:"Research findings",count:(b.stories||[]).length,unit:"stories in your briefing",detail:fresh+" new since your last visit",
  records:(b.stories||[]).slice(0,6).map(s=>({title:s.headline,meta:(s.ticker||s.company)+" · "+ago(s.disclosedAt)+(s.isNew?" · new":""),href:"#briefing",story:s.id,ticker:s.ticker})),
  explore:{label:"Read the briefing",href:"#briefing"},needsSetup:!!b.needsSetup};
}
function panelHtml(id){
 const c=inst.cats[id];if(!c)return loader("Reading records");
 const recs=(c.records||[]).map(r=>{
  const href=r.external?secUrl(r.href):localHref(r.href);
  const pic=r.personCik||r.person?face(r.person||r.title,r.personCik,r.ticker,r.issuerCik):tickerOk(r.ticker)?logo(r.ticker,24,r.title):`<span class="ix-blank" aria-hidden="true"></span>`;
  const inner=`${pic}<span class="ix-rec__t"><span class="ix-rec__title">${esc(r.title)}</span><span class="t-micro muted">${esc(r.meta||"")}${r.value?" · "+esc(usd(r.value)):""}</span></span>`;
  const go=`<span class="t-micro muted ix-rec__go">${r.external?"SEC.gov ↗":"Open"}</span>`;
  return `<li>${href?`<a class="row ix-rec" href="${esc(href)}"${r.external?' target="_blank" rel="noopener noreferrer"':""}${r.story?` data-story-jump="${esc(r.story)}"`:""}>${inner}${go}</a>`:`<span class="row ix-rec">${inner}</span>`}</li>`;}).join("");
 const none=c.loading?loader("Reading your briefing"):id==="findings"&&c.needsSetup?`<p class="t-label muted">Follow a company or a person and your findings appear here.</p>`:`<p class="t-label muted">No records in this group for the last 30 days.</p>`;
 const more=localHref(c.explore&&c.explore.href);
 return `<header class="ix-panel__head"><div><h3 class="strong">${esc(c.label)}</h3><p class="t-label muted"><span class="strong ix-ink">${countOf(c)}</span> ${esc(c.unit||"")}${c.detail?" · "+esc(c.detail):""}</p></div>${more?`<a class="btn btn--ghost" href="${esc(more)}">${esc(c.explore.label)}</a>`:""}</header>`+
  (recs?`<ul class="ix-panel__list">${recs}</ul>`:none);
}
function select(id,focus=false){
 if(!inst.cats[id])return;inst.selected=id;
 const panel=$("[data-panel]",instEl);panel.innerHTML=panelHtml(id);hydrateLogos(panel);
 $$("[data-cat]",instEl).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.cat===id)));
 if(focus&&matchMedia("(max-width:767px)").matches)scrollTo(panel,"nearest");
}
function renderInstrument(){
 $("[data-rows=market]",instEl).innerHTML=MARKET.map(tileHtml).join("");
 $("[data-rows=member]",instEl).innerHTML=MEMBER.map(tileHtml).join("");
 const d=inst.data;
 if(d){$("[data-meta-latest]").textContent=d.latestFilingAt?fmtTime(d.latestFilingAt):"None stored";$("[data-meta-computed]").textContent=fmtTime(d.computedAt);}
 instEl.setAttribute("aria-busy","false");select(inst.selected);
}
async function loadInstrument(){
 try{
  inst.data=await api("/v1/me/intelligence/instrument");
  for(const c of inst.data.mark||[])inst.cats[c.id]=c;
  inst.cats.findings=findingsCategory();
  renderInstrument();wireStructureChips();
 }catch(e){
  instEl.setAttribute("aria-busy","false");if(e.status===401||e.status===402)return;
  $("[data-panel]",instEl).innerHTML=errorBlock("The instrument could not be loaded.",e,"instrument");
 }
}
instEl.addEventListener("click",e=>{
 const j=e.target.closest("[data-story-jump]");if(j){e.preventDefault();jumpToStory(j.dataset.storyJump);return;}
 const t=e.target.closest("[data-cat]");if(t){select(t.dataset.cat,true);return;}
 if(e.target.closest('[data-retry="instrument"]'))loadInstrument();
});

/* ---------- the section bar and the AI status ---------- */
(()=>{const links=$$(".ix-nav a[data-spy]");if(!("IntersectionObserver" in window))return;const seen=new Map();
 const io=new IntersectionObserver(es=>{for(const e of es)seen.set(e.target.id,e.isIntersecting?e.intersectionRatio:0);let best=null,r=0;for(const [id,v] of seen)if(v>r){best=id;r=v;}
  links.forEach(a=>a.toggleAttribute("aria-current",a.dataset.spy===best));},{rootMargin:"-120px 0px -45% 0px",threshold:[0,.1,.3,.6]});
 links.forEach(a=>{const el=document.getElementById(a.dataset.spy);if(el)io.observe(el);});})();
let aiConfigured=false;
async function aiStatus(){
 try{const s=await api("/v1/ai/status");aiConfigured=!!s.configured;$("[data-ai-status]").textContent=aiConfigured?"Plain-English summaries are on, cited and checked.":"Facts from SEC records; AI summaries are off.";}
 catch{aiConfigured=false;}
}

/* ======================= THE TAPE ======================= */
const tape={filters:{days:7,form:"all",ticker:"",person:""},events:[],selected:null,nextBefore:null,timer:null,seq:0,since:null};
const tapeEl=$("[data-tape]");
function tapeQuery(before){const f=tape.filters,q=new URLSearchParams({days:String(f.days),form:f.form});if(f.ticker)q.set("ticker",f.ticker);if(f.person)q.set("person",f.person);if(before)q.set("before",before);return "/v1/intelligence/tape?"+q;}
function tapeRow(e){
 const sel=tape.selected===e.id,who=e.person?String(e.person).split("; ")[0]:"";
 const amt=e.amount!=null?`<span class="${tradeCls(String(e.classification||"").toLowerCase())}">${esc(fmt.money(e.amount))}</span>`:`<span class="muted">—</span>`;
 return `<li class="ix-tape__item${sel?" is-selected":""}${e.new?" is-new":""}" data-event="${esc(e.id)}">
  <button type="button" class="ix-tape__row" aria-expanded="${sel}">
   <span class="ix-tape__time"><span class="strong">${esc(fmtShort(e.filedAt))}</span><span class="t-micro muted">${esc(fmtClock(e.filedAt))}</span></span>
   <span class="ix-tape__co">${logo(e.ticker,24,e.company)}<span class="ix-tape__txt"><span class="strong">${esc(e.ticker||"—")}</span><span class="t-micro muted">${esc(e.company||"")}</span></span></span>
   <span class="ix-tape__who">${who?face(who,e.personCik,e.ticker,e.issuerCik):""}<span class="ix-tape__txt"><span>${esc(e.person||"—")}</span><span class="t-micro muted">${esc(e.form)} · ${esc(e.classification||"")}</span></span></span>
   <span class="ix-tape__amt">${amt}</span>
   <span class="ix-tape__state t-micro${e.new?"":" muted"}">${e.new?"New":"Historical"}</span>
  </button>
  ${sel?`<div class="ix-tape__detail"><dl class="ix-dl">
   <div><dt>Event date</dt><dd>${esc(fmtDay(e.eventDate))}</dd></div><div><dt>Filed</dt><dd>${esc(fmtTime(e.filedAt))}</dd></div><div><dt>Retrieved by Insidir</dt><dd>${esc(fmtTime(e.retrievedAt))}</dd></div>
   <div><dt>Amount</dt><dd>${e.amount!=null?esc(usd(e.amount))+(e.amountNote?`<span class="t-micro muted ix-line">${esc(e.amountNote)}</span>`:""):"Not reported"}</dd></div></dl>
   <p class="ix-actions">${ext(e.source,"Original filing")}${/^Form [345]\b/.test(String(e.form||""))?inApp(e.source,String(e.id||"").replace(/^f4:/,"")):""}${tickerOk(e.ticker)?`<a class="ix-open" href="/company.html?ticker=${encodeURIComponent(e.ticker)}">Stock page</a>`:""}${localHref(e.personHref)?`<a class="ix-open" href="${esc("/"+e.personHref.replace(/^\//,""))}">Reporting person</a>`:""}${tickerOk(e.ticker)?`<button type="button" class="btn btn--ghost" data-structure-open="${esc(e.ticker)}">Reporting structure</button>`:""}</p></div>`:""}
 </li>`;
}
const stripFor=w=>strip(tape.events.map(e=>({id:e.id,t:Date.parse(e.filedAt),strong:e.new})),{from:Date.now()-tape.filters.days*86400000,to:Date.now(),selected:tape.selected,width:w,ticks:w<560?3:6,label:"When each listed disclosure was filed"});
function renderTape(){
 const fresh=tape.events.filter(e=>e.new).length,w=Math.max(300,Math.round(tapeEl.clientWidth-48||860));
 tapeEl.innerHTML=`<div class="ix-tape__strip" data-strip>${stripFor(w)}</div><p class="t-label muted ix-tape__summary">${plural(tape.events.length,"disclosure")} shown${fresh?" · "+fresh+" new since your last visit":" · none new since your last visit"}${tape.since?" ("+esc(fmtTime(tape.since))+")":""}</p>`+
  (tape.events.length?`<ol class="ix-tape__list">${tape.events.map(tapeRow).join("")}</ol>${tape.nextBefore?`<div class="ix-center"><button type="button" class="btn btn--ghost" data-tape-more>Earlier disclosures</button></div>`:""}`:
   empty("Nothing on the tape for these filters.","No stored disclosure matches this company, person, filing type and period. Widen the period or clear the filters.",`<button type="button" class="btn btn--secondary" data-tape-reset>Clear filters</button>`));
 hydrateLogos(tapeEl);tapeEl.setAttribute("aria-busy","false");
}
async function loadTape({append=false}={}){
 const seq=++tape.seq;tapeEl.setAttribute("aria-busy","true");if(!append)tapeEl.innerHTML=loader("Reading the tape");
 try{const d=await api(tapeQuery(append?tape.nextBefore:null));if(seq!==tape.seq)return;
  tape.events=append?tape.events.concat(d.events||[]):(d.events||[]);tape.nextBefore=d.nextBefore;tape.since=d.since;if(!append)tape.selected=null;renderTape();}
 catch(e){if(seq!==tape.seq)return;tapeEl.setAttribute("aria-busy","false");if(e.status!==401&&e.status!==402)tapeEl.innerHTML=errorBlock("The tape could not be loaded.",e,"tape");}
}
(()=>{
 const form=$("[data-tape-filters]");form.addEventListener("submit",e=>e.preventDefault());
 const seg=(sel,key,cast=v=>v)=>$$(sel+" button",form).forEach(b=>b.addEventListener("click",()=>{$$(sel+" button",form).forEach(x=>x.setAttribute("aria-pressed",String(x===b)));tape.filters[key]=cast(b.dataset.value);loadTape();}));
 seg("[data-tape-form]","form");seg("[data-tape-days]","days",Number);
 const typed=()=>{clearTimeout(tape.timer);tape.timer=setTimeout(()=>{
  const t=$("#tape-ticker").value.trim().toUpperCase().replace(/^\$/,""),p=$("#tape-person").value.trim();
  const okT=!t||tickerOk(t),okP=!p||/^[\p{L}\p{N} .,'&-]{1,60}$/u.test(p);
  $("#tape-ticker").toggleAttribute("aria-invalid",!okT);$("#tape-person").toggleAttribute("aria-invalid",!okP);
  if(!okT||!okP)return;tape.filters.ticker=t;tape.filters.person=p;loadTape();},380);};
 $("#tape-ticker").addEventListener("input",typed);$("#tape-person").addEventListener("input",typed);
 const clear=()=>{tape.filters={days:7,form:"all",ticker:"",person:""};$("#tape-ticker").value="";$("#tape-person").value="";$("#tape-ticker").removeAttribute("aria-invalid");$("#tape-person").removeAttribute("aria-invalid");
  $$("[data-tape-form] button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.value==="all")));$$("[data-tape-days] button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.value==="7")));loadTape();};
 $("[data-tape-clear]").addEventListener("click",clear);
 tapeEl.addEventListener("click",e=>{
  if(e.target.closest("[data-tape-reset]")){clear();return;}
  if(e.target.closest("[data-tape-more]")){loadTape({append:true});return;}
  if(e.target.closest('[data-retry="tape"]')){loadTape();return;}
  const so=e.target.closest("[data-structure-open]");if(so){openStructure(so.dataset.structureOpen,true);return;}
  if(e.target.closest(".ix-tape__detail a"))return;
  const tick=e.target.closest(".iv-tick"),row=e.target.closest(".ix-tape__row");
  const id=tick?tick.dataset.event:row?row.closest("[data-event]").dataset.event:null;if(!id)return;
  tape.selected=tape.selected===id?null:id;renderTape();
  const li=tapeEl.querySelector(`li[data-event="${CSS.escape(id)}"]`);if(li&&tick)scrollTo(li,"nearest");
 });
 let w=0;if("ResizeObserver" in window)new ResizeObserver(()=>{const nw=Math.round(tapeEl.clientWidth-48);if(Math.abs(nw-w)>24&&tape.events.length){w=nw;const s=$("[data-strip]",tapeEl);if(s)s.innerHTML=stripFor(Math.max(300,nw));}}).observe(tapeEl);
})();

/* ======================= BRIEFING ======================= */
const brief={days:7,order:"priority",data:null};
const feed=$("[data-feed]");
const sources=s=>(s.sources||[]).map(src=>{const u=secUrl(src.url);return u?`<li><a class="ix-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(src.label)} <span aria-hidden="true">↗</span></a>${s.kind==="insider_filings"?inApp(src.url,src.accession,"Open in Insidir"):""}<span class="t-micro muted ix-line">Filed ${esc(fmtTime(src.filedAt))}${src.people&&src.people.length?" · "+esc(src.people.join(", ")):""}</span></li>`:"";}).join("");
const peopleList=s=>(s.people||[]).map(p=>`<li>${face(p.name,p.cik,s.ticker,s.issuerCik)}<span>${personLink(p.cik,p.name)}${p.role?`<span class="t-micro muted ix-line">${esc(p.role)}</span>`:""}</span></li>`).join("");
function details(s){
 const firstAcc=s.kind==="insider_filings"?(s.sources||[]).map(x=>x.accession).find(a=>/^\d{18}$/.test(String(a||""))):null,src=sources(s);
 return `<details class="ix-more"><summary>Sources and context</summary><div class="ix-more__body">
  ${src?`<div><p class="t-micro muted">Original documents</p><ul class="ix-sources">${src}</ul></div>`:`<p class="t-label muted">No SEC document link was recorded for this item.</p>`}
  <div><p class="t-micro muted">Why it ranks here</p><p class="t-label">${esc((s.ranking&&s.ranking.reasons||[]).join(" · ")||"Newest first")}</p></div>
  ${aiConfigured&&firstAcc?`<div data-explain-box><button type="button" class="btn btn--secondary" data-explain="${esc(firstAcc)}">Explain this filing in plain English</button></div>`:""}</div></details>`;
}
const dates=s=>`<dl class="ix-dl ix-dates"><div><dt>Event</dt><dd>${esc(fmtRange(s.eventDate))}</dd></div><div><dt>Disclosed</dt><dd>${esc(fmtTime(s.disclosedAt))}</dd></div><div><dt>Retrieved by Insidir</dt><dd>${esc(fmtTime(s.retrievedAt))}</dd></div></dl>`;
const kicker=s=>`<p class="ix-kick">${logo(s.ticker,24,s.company)}<span class="strong">${companyLink(s.ticker,s.ticker||s.company)}</span><span class="t-label muted">${s.kind==="company_report"?"Company report":"Insider filings"}${s.isNew?' · <span class="ix-ink">New</span>':""} · ${esc(ago(s.disclosedAt))}</span></p>`;
const leadHtml=s=>`<article class="card ix-pad ix-lead" data-story="${esc(s.id)}"><p class="t-micro muted">Main development</p>${kicker(s)}<h3 class="t-section">${esc(s.headline)}</h3>
 <ul class="ix-facts">${(s.facts||[]).map(f=>`<li>${esc(f)}</li>`).join("")}</ul>${(s.people||[]).length?`<ul class="ix-people">${peopleList(s)}</ul>`:""}${dates(s)}
 <p class="t-label ix-why"><span class="strong">Why it’s here:</span> <span class="muted">${esc((s.why||[]).map(w=>w.text).join(" · "))}</span></p>${details(s)}</article>`;
const secondaryHtml=s=>`<article class="card ix-pad ix-second" data-story="${esc(s.id)}">${kicker(s)}<h4 class="strong">${esc(s.headline)}</h4><p class="t-label muted">${esc((s.facts||[])[0]||"")}</p>${dates(s)}${details(s)}</article>`;
function deskHtml(list){
 const by=new Map();for(const s of list){const k=s.ticker||s.company;if(!by.has(k))by.set(k,[]);by.get(k).push(s);}
 const to=Date.now(),from=to-brief.days*86400000;
 return [...by.entries()].map(([k,ss])=>`<section class="ix-desk__co"><header>${logo(ss[0].ticker,24,ss[0].company)}<h4 class="strong">${companyLink(ss[0].ticker,ss[0].company)}</h4><span class="t-micro muted">${plural(ss.length,"item")}</span></header>
  ${strip(ss.map(s=>({id:s.id,t:Date.parse(s.disclosedAt),strong:s.isNew})),{from,to,width:520,height:36,ticks:3,label:"When "+k+"'s items were disclosed"})}
  <ul>${ss.map(s=>`<li><a class="ix-link" href="#briefing" data-story-jump="${esc(s.id)}">${esc(s.headline)}</a><span class="t-micro muted ix-line">${esc(fmtTime(s.disclosedAt))}</span></li>`).join("")}</ul></section>`).join("");
}
function peopleDeskHtml(list){
 const by=new Map();for(const s of list)for(const p of s.people||[]){const k=p.cik||p.name;if(!by.has(k))by.set(k,{...p,items:0,tickers:new Set(),ticker:s.ticker,issuerCik:s.issuerCik});const r=by.get(k);r.items++;if(s.ticker)r.tickers.add(s.ticker);}
 return [...by.values()].sort((a,b)=>b.items-a.items).slice(0,12).map(p=>`<li>${face(p.name,p.cik,p.ticker,p.issuerCik)}<span>${personLink(p.cik,p.name)}<span class="t-micro muted ix-line">${esc(p.role||"Role not stated")} · ${esc([...p.tickers].join(", "))}</span></span></li>`).join("")||`<li class="t-label muted">No people named in this edition.</li>`;
}
function renderBriefing(){
 const d=brief.data,subj=d.subjects||{};feed.setAttribute("aria-busy","false");
 $("[data-edition-date]").textContent=new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
 $("[data-edition]").textContent=(brief.days===1?"Last 24 hours":"Last "+brief.days+" days")+" · "+plural(subj.tickers||0,"company","companies")+" and "+plural(subj.people||0,"person","people")+" you follow"+(d.since?" · new since "+fmtTime(d.since):"");
 if(d.needsSetup){
  feed.innerHTML=`<div class="card ix-pad">${empty("Your briefing starts with what you follow.","Add companies to your watchlist or follow the people who file at them. Insidir then reads every new Form 4 and company report for you, groups what belongs together and lists it here with the original SEC documents.",
   `<form class="ix-inline" data-quick-add><label class="sr-only" for="ix-quick">Ticker</label><input class="input" id="ix-quick" maxlength="15" placeholder="Ticker, e.g. NVDA" autocomplete="off" autocapitalize="characters" required><button class="btn btn--primary" type="submit">Add to watchlist</button></form><a class="btn btn--secondary" href="/explore.html">Browse companies</a><a class="btn btn--secondary" href="/people.html">Find people</a><p class="t-label muted" data-quick-status role="status"></p>`)}</div>`;
  $("[data-quick-add]").addEventListener("submit",quickAdd);
 }else{
  const list=[...(d.stories||[])];
  if(brief.order==="latest")list.sort((a,b)=>String(b.disclosedAt).localeCompare(String(a.disclosedAt)));
  if(!list.length)feed.innerHTML=`<div class="card ix-pad">${empty("Nothing new in the last "+(brief.days===1?"24 hours":brief.days+" days")+".","None of the companies or people you follow filed a Form 4 or company report that Insidir has indexed in this window. Disclosures can arrive days after an event, so this can change.",
   (brief.days<30?`<button type="button" class="btn btn--secondary" data-widen>Show the last 30 days</button>`:"")+`<a class="btn btn--ghost" href="#investigate">Ask a question instead</a>`)}</div>`;
  else{
   const lead=list[0],second=list.slice(1,5),rest=list.slice(5);
   feed.innerHTML=`<div class="ix-front"><div class="ix-front__lead">${leadHtml(lead)}</div><div class="ix-front__col">${second.length?second.map(secondaryHtml).join(""):`<p class="t-label muted">No other stories in this edition.</p>`}</div></div>
    <div class="ix-desk"><section class="card ix-pad"><h3 class="t-label muted">By company</h3><div class="ix-desk__grid">${deskHtml(list)}</div></section>
    <section class="card ix-pad"><h3 class="t-label muted">People in this edition</h3><ul class="ix-people ix-people--col">${peopleDeskHtml(list)}</ul></section></div>
    ${rest.length?`<section class="ix-also"><h3 class="t-label muted">Also in this edition</h3>${rest.map(secondaryHtml).join("")}</section>`:""}`;
   hydrateLogos(feed);
  }
  const widen=$("[data-widen]",feed);if(widen)widen.addEventListener("click",()=>setWindow(30));
 }
 $("[data-rules]").innerHTML=(d.rankingRules||[]).map(r=>`<li><span>${esc(r.label)}</span><span class="strong">${r.points>0?"+":""}${esc(r.points)}</span></li>`).join("");
 const cov=d.coverage||{};
 $("[data-coverage]").innerHTML=(cov.notes||[]).map(n=>`<p class="t-label muted">${esc(n)}</p>`).join("")+(cov.quietCount?`<p class="t-label muted">Quiet in this window (${esc(cov.quietCount)}): ${esc((cov.quiet||[]).join(", "))}</p>`:"");
 renderDelivery(d.preferences&&d.preferences.frequency,d.delivery||{});
}
function renderDelivery(freq,del){
 $$("[data-frequency] button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.frequencyValue===freq)));
 const label=freq==="daily"?"a daily digest":freq==="weekly"?"a weekly digest":"a notification for each new filing";
 const el=$("[data-delivery]");
 if(!del.pushConfigured)el.textContent="Device notifications are not available on this deployment. Your briefing still updates here.";
 else if(!del.devices)el.innerHTML=`Your choice is saved, but no device has notifications turned on, so nothing will be sent. <a class="ix-link" href="/alerts.html#settings">Turn them on in Alerts</a>.`;
 else el.textContent="You will receive "+label+" on "+plural(del.devices,"device")+". Last 7 days: "+del.sent7d+" delivered"+(del.failed7d?", "+del.failed7d+" failed":"")+(del.pending?", "+del.pending+" waiting":"")+"."+(del.lastSentAt?" Last delivered "+fmtTime(del.lastSentAt)+".":"");
}
async function loadBriefing(){
 feed.setAttribute("aria-busy","true");if(!brief.data)feed.innerHTML=`<div class="card ix-pad">${loader("Preparing your briefing")}</div>`;
 try{
  brief.data=await api("/v1/me/intelligence/briefing?days="+brief.days);renderBriefing();onboarded("briefing");
  inst.brief=brief.data;inst.cats.findings=findingsCategory();
  if(inst.data){$("[data-rows=member]",instEl).innerHTML=MEMBER.map(tileHtml).join("");select(inst.selected);}
 }catch(e){
  feed.setAttribute("aria-busy","false");if(e.status===401||e.status===402)return;
  feed.innerHTML=`<div class="card ix-pad">${errorBlock("The briefing could not be loaded.",e,"briefing")}</div>`;
  $("[data-delivery]").textContent="Delivery settings are unavailable until the briefing loads.";
 }
}
function setWindow(days){brief.days=days;$$("[data-window] button").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.days)===days)));loadBriefing();}
async function quickAdd(ev){
 ev.preventDefault();const input=$("#ix-quick"),status=$("[data-quick-status]"),t=input.value.trim().toUpperCase().replace(/^\$/,"");
 if(!tickerOk(t)){status.textContent="Enter a ticker symbol such as NVDA.";input.setAttribute("aria-invalid","true");return;}
 input.removeAttribute("aria-invalid");status.textContent="Adding "+t+"…";
 try{await api("/v1/me/watchlist",{method:"POST",body:{ticker:t}});status.textContent=t+" added.";loadBriefing();loadInstrument();}catch(e){status.textContent=e.message;}
}
async function explain(btn){
 const box=btn.closest("[data-explain-box]");btn.disabled=true;btn.textContent="Reading the filing…";
 try{const r=await api("/v1/ai/explain?accession="+encodeURIComponent(btn.dataset.explain));
  box.innerHTML=`<div class="ix-ai"><p>${esc(r.explanation)}</p><p class="t-micro muted">Written by AI from this filing’s reported lines and checked against its figures${r.cached?" · shared summary":""}. The SEC document above is the authoritative record. Research, not investment advice.</p></div>`;}
 catch(e){box.innerHTML=`<p class="t-label muted">${esc(e.status===429?e.message:e.status===422?"The summary did not pass Insidir’s source checks, so it is not shown. The filing above is the full record.":"A plain-English summary is not available right now. The filing above is the full record.")}</p>`;}
}
function jumpToStory(id){
 const t=feed.querySelector(`[data-story="${CSS.escape(id)}"]`);scrollTo(t||document.getElementById("briefing"));
 if(t){const d=t.querySelector("details");if(d)d.open=true;t.classList.remove("is-flash");void t.offsetWidth;t.classList.add("is-flash");}
}
$$("[data-window] button").forEach(b=>b.addEventListener("click",()=>setWindow(Number(b.dataset.days))));
$$("[data-order] button").forEach(b=>b.addEventListener("click",()=>{brief.order=b.dataset.orderBy;$$("[data-order] button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));if(brief.data)renderBriefing();}));
$$("[data-frequency] button").forEach(b=>b.addEventListener("click",async()=>{
 const value=b.dataset.frequencyValue,el=$("[data-delivery]"),before=$$("[data-frequency] button").find(x=>x.getAttribute("aria-pressed")==="true");
 $$("[data-frequency] button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));el.textContent="Saving…";
 try{await api("/v1/me/intelligence/preferences",{method:"POST",body:{frequency:value}});
  if(brief.data){brief.data.preferences={...(brief.data.preferences||{}),frequency:value};renderDelivery(value,brief.data.delivery||{});}else el.textContent="Saved.";}
 catch(e){$$("[data-frequency] button").forEach(x=>x.setAttribute("aria-pressed",String(x===before)));el.textContent="Not saved: "+e.message;}
}));
feed.addEventListener("click",ev=>{
 const ex=ev.target.closest("[data-explain]");if(ex){explain(ex);return;}
 const j=ev.target.closest("[data-story-jump]");if(j){ev.preventDefault();jumpToStory(j.dataset.storyJump);return;}
 if(ev.target.closest('[data-retry="briefing"]'))loadBriefing();
});

/* ======================= REPORTING STRUCTURE ======================= */
const structEl=$("[data-structure]");
const struct={data:null,person:null,seq:0};
function structureHtml(d){
 const people=d.people.map(p=>`<li><button type="button" class="ix-node ix-node--person" data-person="${esc(p.cik)}" aria-pressed="${struct.person===p.cik}">${face(p.name,p.cik,d.company.ticker,d.company.cik,32)}<span class="ix-node__t"><span class="strong">${esc(p.name)}</span><span class="t-micro muted">${esc(p.relationships.join(" · ")||"No relationship box recorded")}</span><span class="t-micro muted">${plural(p.filings,"Form 4","Form 4s")} · last ${esc(fmtShort(p.last))}</span></span></button></li>`).join("");
 const secs=d.securities.map(s=>`<li><div class="ix-node ix-node--security" data-security="${esc(s.name)}"><span class="ix-node__t"><span class="strong">${esc(s.name)}</span><span class="t-micro muted">${s.derivative?"Derivative security":"Non-derivative security"}</span><span class="t-micro muted">${plural(s.lines,"reported line")} · ${plural(s.people,"person","people")}</span></span></div></li>`).join("");
 return `<div class="ix-cap">
  <div class="ix-cap__col"><p class="t-label muted">Reporting people · ${d.people.length} in 12 months</p><ul>${people||`<li class="t-label muted">No reporting people recorded.</li>`}</ul></div>
  <div class="ix-cap__core"><div class="ix-node ix-node--company" data-company>${logo(d.company.ticker,40,d.company.name)}<span class="ix-node__t"><span class="strong">${esc(d.company.ticker)}</span><span>${esc(d.company.name)}</span><span class="t-micro muted">CIK ${esc(d.company.cik||"—")} · last Form 4 ${esc(fmtShort(d.company.lastFiling))}</span>${tickerOk(d.company.ticker)?`<a class="ix-open" href="/company.html?ticker=${encodeURIComponent(d.company.ticker)}">Stock page</a>`:""}</span></div></div>
  <div class="ix-cap__col"><p class="t-label muted">Securities, as named on Form 4</p><ul>${secs||`<li class="t-label muted">No reported lines.</li>`}</ul></div></div>
  <div class="ix-cap__evidence" data-cap-evidence>${evidenceHtml(d)}</div>`;
}
function evidenceHtml(d){
 const p=d.people.find(x=>x.cik===struct.person);
 if(!p)return `<div class="ix-evidence"><div><p class="t-label muted">Form 4 filings per month, last 12 months</p>${bars(d.periods.map(x=>x.filings),d.periods.map(x=>x.month),"Form 4 filings per month for "+d.company.ticker)}</div>
  <div><p class="t-label muted">What the lines mean</p><ul class="ix-gaps"><li>${esc(d.labels.personCompany)}</li><li>${esc(d.labels.personSecurity)}</li></ul><p class="t-label muted">Select a person to see the filings behind their lines.</p></div></div>`;
 const edges=d.edges.filter(e=>e.person===p.cik);
 return `<div class="ix-evidence"><div><p class="t-label muted">Evidence</p><h3 class="ix-who">${face(p.name,p.cik,d.company.ticker,d.company.cik,32)}<span class="strong">${personLink(p.cik,p.name)}</span></h3>
  <ul class="ix-rules"><li><span>Relationship (as filed)</span><span class="strong">${esc(p.relationships.join(" · ")||"Not stated")}</span></li><li><span>Form 4 filings, 12 months</span><span class="strong">${esc(p.filings)}</span></li><li><span>First / last in window</span><span class="strong">${esc(fmtShort(p.first))} / ${esc(fmtShort(p.last))}</span></li></ul>
  <p class="t-label muted">${esc(d.labels.personCompany)}</p>${p.sources.length?`<p class="ix-actions">${p.sources.map((u,i)=>ext(u,i?"Earlier Form 4":"Latest Form 4")+inApp(u,null,i?"Open earlier":"Open latest")).join("")}</p>`:""}</div>
  <div><p class="t-label muted">Reported transactions by security</p>${edges.length?`<div class="ix-scroll"><table class="table ix-table"><thead><tr><th scope="col">Security</th><th scope="col" class="r">Lines</th><th scope="col" class="r">Purchases</th><th scope="col" class="r">Sales</th><th scope="col" class="r">Other</th><th scope="col">Last</th><th scope="col">Source</th></tr></thead><tbody>${
   edges.map(e=>`<tr><td><span class="strong">${esc(e.security)}</span>${e.derivative?`<span class="t-micro muted ix-line">Derivative</span>`:""}</td><td class="r">${esc(e.lines)}</td><td class="r${e.purchases?" up":""}">${esc(e.purchases)}</td><td class="r${e.sales?" down":""}">${esc(e.sales)}</td><td class="r">${esc(e.other)}</td><td>${esc(fmtShort(e.last))}</td><td>${ext(e.source,"Form 4")}</td></tr>`).join("")}</tbody></table></div>`:`<p class="t-label muted">No individual lines are attributed to this person (their filings may be joint filings).</p>`}
  <p class="t-label muted">${esc(d.labels.personSecurity)}</p></div></div>`;
}
function markStructure(){
 const host=$(".ix-cap",structEl),d=struct.data;if(!host||!d)return;
 const active=struct.person?new Set(d.edges.filter(e=>e.person===struct.person).map(e=>e.security)):null;
 host.classList.toggle("has-selection",!!struct.person);
 $$("[data-security]",host).forEach(n=>n.classList.toggle("is-related",!!(active&&active.has(n.dataset.security))));
}
async function openStructure(ticker,scroll=false){
 const t=String(ticker||"").trim().toUpperCase().replace(/^\$/,""),input=$("#structure-ticker");
 if(!tickerOk(t)){input.setAttribute("aria-invalid","true");return;}
 input.removeAttribute("aria-invalid");input.value=t;
 $$("[data-structure-chips] button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.ticker===t)));
 if(scroll)scrollTo(document.getElementById("structure"));
 const seq=++struct.seq;structEl.innerHTML=loader("Connecting records for "+t);
 try{const d=await api("/v1/intelligence/structure?ticker="+encodeURIComponent(t));if(seq!==struct.seq)return;
  struct.data=d;struct.person=null;structEl.innerHTML=structureHtml(d);hydrateLogos(structEl);markStructure();}
 catch(e){if(seq!==struct.seq)return;
  if(e.status===404)structEl.innerHTML=empty("No Form 4 filings stored for "+t+".","Insidir builds this view only from reporting people’s own filings. When a filing for "+esc(t)+" is imported, its people and securities appear here.");
  else if(e.status!==401&&e.status!==402)structEl.innerHTML=errorBlock("The structure could not be loaded.",e);}
}
function wireStructureChips(){
 const box=$("[data-structure-chips]"),w=(inst.cats.watchlist&&inst.cats.watchlist.records)||[],top=(inst.cats.companies&&inst.cats.companies.records)||[];
 const tickers=[...new Set([...w.filter(r=>r.active).map(r=>r.ticker),...w.map(r=>r.ticker),...top.map(r=>r.ticker)].filter(tickerOk))].slice(0,8);
 box.innerHTML=tickers.map(t=>`<button type="button" class="btn btn--secondary" data-ticker="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join("");
 if(!struct.data&&tickers[0])openStructure(tickers[0]);
 else if(!tickers.length&&!struct.data)structEl.innerHTML=empty("Choose a company.","Type a ticker above to see its reporting people, their relationships as filed, and the securities they reported transactions in.");
}
structEl.innerHTML=loader("Waiting for your companies");
$("[data-structure-form]").addEventListener("submit",e=>{e.preventDefault();openStructure($("#structure-ticker").value);});
$("[data-structure-chips]").addEventListener("click",e=>{const b=e.target.closest("[data-ticker]");if(b)openStructure(b.dataset.ticker);});
structEl.addEventListener("click",e=>{
 const p=e.target.closest("[data-person]");if(!p||!struct.data)return;
 struct.person=struct.person===p.dataset.person?null:p.dataset.person;
 $$("[data-person]",structEl).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.person===struct.person)));
 $("[data-cap-evidence]",structEl).innerHTML=evidenceHtml(struct.data);hydrateLogos($("[data-cap-evidence]",structEl));markStructure();
 if(matchMedia("(max-width:1023px)").matches)scrollTo($("[data-cap-evidence]",structEl),"nearest");
});

/* ======================= ASK: THE RESEARCH REPORT ======================= */
const thread=$("[data-thread]"),form=$("[data-ask]"),field=$("#ix-question"),askError=$("[data-ask-error]");
let lastPlan=null,seq=0;
const stageDetail=(id,d)=>!d?"":id==="sources"?plural(d.records,"record")+" retrieved":id==="connected"?plural(d.relationships,"relationship")+" · "+plural(d.events,"dated event"):id==="verified"?d.references+" citation references checked against "+d.citations+" SEC sources"+(d.removed?" · "+d.removed+" removed":""):id==="understood"&&d.plan?((d.plan.tickers||[]).length?d.plan.tickers.join(", ")+" · ":"")+(d.plan.timeLabel||""):"";
function autosize(){field.style.height="auto";field.style.height=Math.min(220,Math.max(44,field.scrollHeight+2))+"px";}
const cites=(ids,aid)=>(ids||[]).length?`<sup class="ix-cites">${ids.map(n=>`<a class="ix-cite" href="#ix-src-${aid}-${Number(n)}" aria-label="Source ${Number(n)}">${Number(n)}</a>`).join("")}</sup>`:"";
function recordsHtml(records,aid){
 if(!records||!records.length)return "";
 return `<div class="ix-recs">${records.map(r=>`<details class="ix-rec"><summary><span class="t-label muted">${esc(fmtShort(r.transactionDate))}</span><span class="ix-rec__who">${face(r.person,r.personCik,r.ticker)}<span><span class="strong">${esc(r.person)}</span>${r.role?`<span class="t-micro muted ix-line">${esc(r.role)}</span>`:""}</span></span><span class="t-label">${esc(r.codeLabel)}${r.code?" ("+esc(r.code)+")":""}</span><span class="r ${tradeCls(r.category)}">${esc(usd(r.value))}</span><span>${cites(r.citation?[r.citation]:[],aid)}</span></summary>
  <dl class="ix-dl ix-rec__body"><div><dt>Company</dt><dd>${companyLink(r.ticker,(r.ticker||"")+" · "+(r.company||""))}</dd></div><div><dt>Person</dt><dd>${personLink(r.personCik,r.person)}</dd></div><div><dt>Security</dt><dd>${esc(r.security||"Not named")}${r.derivative?" (derivative)":""}</dd></div>
  <div><dt>Shares</dt><dd>${esc(num(r.shares))}</dd></div><div><dt>Price per share</dt><dd>${esc(price(r.price))}</dd></div><div><dt>Reported value</dt><dd>${esc(usd(r.value))}</dd></div>
  <div><dt>Transaction date</dt><dd>${esc(fmtDay(r.transactionDate))}</dd></div><div><dt>Disclosed</dt><dd>${esc(fmtTime(r.disclosedAt))}</dd></div><div><dt>Report</dt><dd>${r.amendment?"Amended Form 4":"Form 4"}</dd></div></dl></details>`).join("")}</div>`;
}
function reportHtml(a,aid){
 const plan=a.plan||{},chips=[];
 if(plan.companies&&plan.companies.length)chips.push(`<li><span class="muted">Companies</span> ${plan.companies.map(c=>esc(c.ticker)).join(", ")}</li>`);
 if(plan.person&&plan.person.name)chips.push(`<li><span class="muted">${plan.person.kind==="organization"?"Filer":"Person"}</span> ${esc(plan.person.displayName||plan.person.name)}</li>`);
 if(plan.scope==="followed_people")chips.push(`<li><span class="muted">People</span> You follow</li>`);
 if(plan.scope==="watchlist")chips.push(`<li><span class="muted">Scope</span> Your watchlist</li>`);
 if(plan.scope==="market")chips.push(`<li><span class="muted">Scope</span> All indexed companies</li>`);
 if(plan.timeLabel)chips.push(`<li><span class="muted">Period</span> ${esc(plan.timeLabel)}</li>`);
 if(plan.categories&&plan.categories.length)chips.push(`<li><span class="muted">Records</span> ${plan.categories.map(c=>c==="reported_sale"?"Sales":"Purchases").join(", ")}</li>`);
 if(plan.usedContext)chips.push(`<li><span class="muted">Follow-up</span> Kept your previous focus</li>`);
 const status={answered:"Answer from indexed records",no_data:"No matching records",unresolved:"Needs a company or a person",refused:"Outside Insidir’s scope"}[a.status]||"";
 const foot=`<p class="t-micro muted ix-report__foot">${a.method?esc(a.method)+" ":""}Research from public SEC records, not investment advice.</p>`;
 const head=`<header class="ix-report__head"><p class="t-micro muted">Research report · ${esc(status)} · retrieved ${esc(fmtTime(a.retrievedAt))}</p><h3 class="t-section ix-answer__q">${esc(a.question)}</h3>${chips.length?`<ul class="ix-plan" aria-label="How Insidir read the question">${chips.join("")}</ul>`:""}</header>`;
 if(a.status==="refused")return head+`<section class="ix-part"><h4 class="ix-part__title">What happened</h4><p class="t-body">${esc(a.message)}</p></section>`+foot;
 const nav=`<nav class="ix-report__nav" aria-label="Report sections"><a href="#${aid}-finding">What happened</a><a href="#${aid}-evidence">Evidence</a><a href="#${aid}-timeline">Timeline</a><a href="#${aid}-relationships">Connections</a><a href="#${aid}-uncertainty">What is uncertain</a></nav>`;
 let finding=`<div class="ix-summary">${(a.summary||[]).map(s=>`<p class="t-body">${esc(s.text)}${cites(s.cites,aid)}</p>`).join("")}</div>`;
 if(a.synthesis&&a.synthesis.available)finding+=`<div class="ix-block" data-synth-box><p class="t-label muted">Plain-English synthesis</p><p class="t-label muted">An AI-written reading of the cited records. It is checked against them before it is shown; if a check fails, nothing is shown.</p><button type="button" class="btn btn--secondary" data-synth>Write a synthesis</button></div>`;
 let evidence="";
 for(const sec of a.sections||[]){
  if(sec.kind==="comparison"){
   evidence+=`<div class="ix-block"><h5 class="strong">${esc(sec.title)}</h5><div class="ix-scroll"><table class="table ix-table"><thead><tr><th scope="col">Company</th><th scope="col" class="r">Filings</th><th scope="col" class="r">People</th><th scope="col" class="r">Sales</th><th scope="col" class="r">Sale value</th><th scope="col" class="r">Purchases</th><th scope="col" class="r">Purchase value</th><th scope="col" class="r">Other</th><th scope="col">Last disclosed</th></tr></thead><tbody>${
    sec.rows.map(r=>`<tr><td>${companyLink(r.ticker)}<span class="t-micro muted ix-line">${esc(r.company)}</span></td><td class="r">${esc(r.filings)}</td><td class="r">${esc(r.people)}</td><td class="r">${esc(r.sales)}</td><td class="r${r.saleValue?" down":""}">${esc(usd(r.saleValue))}</td><td class="r">${esc(r.purchases)}</td><td class="r${r.purchaseValue?" up":""}">${esc(usd(r.purchaseValue))}</td><td class="r">${esc(r.other)}</td><td>${esc(fmtDay(r.lastDisclosed))}${cites(r.citation?[r.citation]:[],aid)}</td></tr>`).join("")}</tbody></table></div></div>`;
   continue;
  }
  const purl=sec.person&&String(sec.person.url||"").replace(/^\//,"");
  const personBtn=purl&&/^[a-z]+\.html\?cik=\d+$/.test(purl)?`<a class="btn btn--ghost" href="/${esc(purl)}">Their page</a>`:"";
  evidence+=`<div class="ix-block"><div class="ix-block__head"><h5 class="ix-who">${sec.ticker?logo(sec.ticker,24,sec.company):""}<span class="strong">${esc(sec.title)}</span></h5><span class="ix-actions">${personBtn}${sec.ticker&&sec.kind!=="story"?`<a class="btn btn--ghost" href="/company.html?ticker=${encodeURIComponent(sec.ticker)}">Stock page</a><button type="button" class="btn btn--ghost" data-structure-open="${esc(sec.ticker)}">Reporting structure</button>`:""}</span></div>`+
   (sec.facts&&sec.facts.length?`<ul class="ix-facts">${sec.facts.map(f=>`<li>${esc(f.text)}${cites(f.cites,aid)}</li>`).join("")}</ul>`:"")+
   (sec.filings&&sec.filings.length?`<p class="t-label muted">${sec.kind==="person"?"Their filings with the SEC":"SEC filings in this period"}</p><ul class="ix-facts">${sec.filings.map(f=>`<li>${esc(f.text)}${cites(f.cites,aid)}</li>`).join("")}</ul>`:"")+recordsHtml(sec.records,aid)+`</div>`;
 }
 const KIND={event:"Event",transaction:"Transaction",disclosed:"Disclosed",filed:"Filed"},byDate=new Map();
 for(const e of a.timeline||[]){if(!byDate.has(e.date))byDate.set(e.date,[]);byDate.get(e.date).push(e);}
 const timeline=byDate.size?`<ol class="ix-timeline">${[...byDate.entries()].map(([d,es])=>`<li><span class="strong">${esc(fmtDay(d))}</span><ul>${es.map(e=>`<li><span class="t-micro muted">${esc(KIND[e.kind]||e.kind)}</span> ${esc(e.text)}${cites(e.cites,aid)}</li>`).join("")}</ul></li>`).join("")}</ol>`:`<p class="t-label muted">No dated records in this answer.</p>`;
 const rel=(a.relationships||[]).length?`<ul class="ix-rels">${a.relationships.map(r=>`<li><span class="ix-who">${face(r.person,r.personCik,r.ticker)}<span>${personLink(r.personCik,r.person)}<span class="t-micro muted ix-line">${esc(r.role||"Role not stated")}</span></span></span><span class="ix-who">${logo(r.ticker,24,r.company)}<span>${companyLink(r.ticker,r.ticker||r.company)}<span class="t-micro muted ix-line">${esc(r.company||"")}</span></span></span>
  <span class="t-label">Reported ${[r.sales?`<span class="down">${plural(r.sales,"sale")}</span>`:"",r.purchases?`<span class="up">${plural(r.purchases,"purchase")}</span>`:"",r.other?plural(r.other,"other change"):""].filter(Boolean).join(", ")}${(r.securities||[]).length?" in "+esc(r.securities.join(", ")):""} · last ${esc(fmtShort(r.last))}${cites(r.cites,aid)}<span class="t-micro muted ix-line">${esc(r.basis)}</span></span></li>`).join("")}</ul>`:`<p class="t-label muted">No person-to-company relationships appear in these records.</p>`;
 const v=a.verification||{};
 const uncertainty=`<ul class="ix-gaps">${(a.gaps||[]).map(g=>`<li>${esc(g)}</li>`).join("")}</ul><p class="t-label muted">Verification: ${v.references||0} citation references checked against ${v.citations||0} SEC sources${v.removed?"; "+v.removed+" that did not resolve were removed":"; all resolved"}.</p>`;
 const srcs=(a.citations||[]).map(c=>{const url=secUrl(c.url);return `<li id="ix-src-${aid}-${esc(c.id)}"><span class="ix-srcn">${esc(c.id)}</span><span>${url?`<a class="ix-src" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(c.label)} <span aria-hidden="true">↗</span></a>`:esc(c.label)}${c.kind==="form4"?inApp(c.url,c.accession):""}<span class="t-micro muted ix-line">${c.date?"Event "+esc(fmtDay(c.date))+" · ":""}Filed ${esc(fmtDay(c.publishedAt))}</span></span></li>`;}).join("");
 const part=(id,title,body)=>`<section class="ix-part" id="${aid}-${id}"><h4 class="ix-part__title">${title}</h4>${body}</section>`;
 return head+nav+`<div class="ix-answer__grid"><div class="ix-answer__main">${part("finding","What happened",finding)}${part("evidence","Evidence",evidence||`<p class="t-label muted">No records matched.</p>`)}${part("timeline","Timeline",timeline)}${part("relationships","Connections",rel)}${part("uncertainty","What is uncertain",uncertainty)}
  <form class="ix-followup" data-followup><label class="sr-only" for="${aid}-fu">Follow-up question</label><input class="input" id="${aid}-fu" maxlength="400" placeholder="Ask a follow-up, e.g. “Only purchases?” or “What about Microsoft?”" autocomplete="off"><button class="btn btn--primary" type="submit">Continue</button></form>
  ${(a.followUps||[]).length?`<p class="t-label muted">What to look at next</p><ul class="ix-follow">${a.followUps.map(f=>`<li><button type="button" class="btn btn--secondary" data-follow>${esc(f)}</button></li>`).join("")}</ul>`:""}</div>
  <aside class="ix-side">${srcs?`<section class="ix-sourcebox"><h5 class="t-label muted">Sources</h5><ol class="ix-srclist">${srcs}</ol></section>`:""}</aside></div>`+foot;
}
/* Streams /investigate?stream=1: each line is a stage the server has actually completed. */
async function runInvestigation(q,context,onStage){
 let res;
 try{res=await fetch("/v1/me/intelligence/investigate?stream=1",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json",Accept:"application/x-ndjson"},body:JSON.stringify({question:q,context})});}catch{throw offline();}
 if(res.status===401){location.href="/signin.html?next="+encodeURIComponent(location.pathname.replace(/^\//,"")+location.search);throw Object.assign(Error("Sign in required"),{status:401});}
 if(res.status===402){location.href="/subscribe.html";throw Object.assign(Error("Subscription required"),{status:402});}
 if(!res.ok){let d=null;try{d=await res.json();}catch{/* not JSON */}throw Object.assign(Error((d&&d.error)||"Request failed ("+res.status+")"),{status:res.status});}
 const handle=msg=>{if(msg.stage==="answer")return msg.answer;if(msg.stage==="error")throw Object.assign(Error(msg.error),{status:msg.status});onStage(msg);return null;};
 if(!res.body||!res.body.getReader){let answer=null;for(const l of (await res.text()).split("\n"))if(l.trim())answer=handle(JSON.parse(l))||answer;if(!answer)throw Object.assign(Error("The research stream ended early. Try again."),{status:0});return answer;}
 const reader=res.body.getReader(),dec=new TextDecoder();let buf="",answer=null;
 for(;;){const {value,done}=await reader.read();if(value)buf+=dec.decode(value,{stream:true});let i;
  while((i=buf.indexOf("\n"))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(line)answer=handle(JSON.parse(line))||answer;}if(done)break;}
 if(buf.trim())answer=handle(JSON.parse(buf))||answer;
 if(!answer)throw Object.assign(Error("The research stream ended early. Try again."),{status:0});
 return answer;
}
async function ask(question,{followUp=false}={}){
 const q=String(question||"").trim();askError.hidden=true;
 if(!q){askError.textContent="Type a question, or choose one of the examples.";askError.hidden=false;field.focus();return;}
 if(q.length>400){askError.textContent="Questions are limited to 400 characters.";askError.hidden=false;return;}
 const aid="a"+(++seq);
 $$(".ix-answer",thread).forEach(el=>{if(el.closest(".ix-prev"))return;const d=document.createElement("details");d.className="card ix-prev";d.innerHTML=`<summary>${esc(el.dataset.q)}</summary>`;el.replaceWith(d);d.appendChild(el);});
 const box=document.createElement("article");box.className="card ix-pad ix-answer";box.dataset.q=q;box.id=aid;
 box.innerHTML=`<header class="ix-report__head"><p class="t-micro muted">Research report · in progress</p><h3 class="t-section ix-answer__q">${esc(q)}</h3></header><ol class="ix-steps" aria-label="Research status" data-steps><li class="is-active"><span>Sending the question</span><span class="t-micro muted"></span></li></ol>`;
 thread.prepend(box);scrollTo(box);
 const btn=$(".ix-ask__go",form);btn.disabled=true;
 try{
  const a=await runInvestigation(q,followUp&&lastPlan?lastPlan:null,msg=>{
   const steps=$("[data-steps]",box);
   if(msg.stage==="start"){steps.innerHTML=(msg.stages||[]).map((s,i)=>`<li data-stage="${esc(s.id)}" class="${i===0?"is-active":""}"><span>${esc(s.label)}</span><span class="t-micro muted"></span></li>`).join("");return;}
   const li=$(`[data-stage="${CSS.escape(String(msg.stage))}"]`,steps);if(!li)return;
   li.className="is-done";li.lastElementChild.textContent=stageDetail(msg.stage,msg.detail);
   const next=li.nextElementSibling;if(next)next.className="is-active";
  });
  if(a.plan&&a.status!=="refused")lastPlan=a.plan;
  box.innerHTML=reportHtml(a,aid);box._answer=a;onboarded("investigate");hydrateLogos(box);
 }catch(e){
  if(e.status===401||e.status===402)return;
  box.innerHTML=`<h3 class="t-section ix-answer__q">${esc(q)}</h3>`+errorBlock(e.status===429?"Research limit reached.":"This question could not be researched right now.",e);
 }finally{btn.disabled=false;}
}
async function synth(btn){
 const box=btn.closest("[data-synth-box]"),article=btn.closest(".ix-answer"),a=article&&article._answer;if(!a)return;
 btn.disabled=true;btn.textContent="Writing from the cited records…";
 try{const r=await api("/v1/me/intelligence/synthesize",{method:"POST",body:{question:a.question,context:a.plan&&a.plan.usedContext?a.plan:null}});
  if(r.status==="ready"){const aid=article.id;
   const html=esc(r.text).split(/\n{2,}/).map(p=>`<p class="t-body">${p.replace(/\[(\d{1,3})\]/g,(m,n)=>`<a class="ix-cite" href="#ix-src-${aid}-${n}">${n}</a>`)}</p>`).join("");
   box.innerHTML=`<p class="t-label muted">Plain-English synthesis</p><div class="ix-ai">${html}<p class="t-micro muted">Written by AI (${esc(r.tier==="deep"?"research model":"standard model")}) from the cited records only; figures and citations were checked before display${r.cached?"; shared with other readers who asked about the same records":""}. Research, not investment advice.</p></div>`;}
  else box.innerHTML=`<p class="t-label muted">Plain-English synthesis</p><p class="t-label muted">${esc(r.reason||"Not available.")}</p>`;
 }catch(e){box.innerHTML=`<p class="t-label muted">Plain-English synthesis</p><p class="t-label muted">${esc(e.message)}</p>`;}
}
field.addEventListener("input",autosize);
field.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
form.addEventListener("submit",e=>{e.preventDefault();const q=field.value;ask(q,{followUp:!!lastPlan&&/^(what about|and|how about|only|just|same|now|also)\b/i.test(q.trim())});});
$$("[data-examples] button").forEach(b=>b.addEventListener("click",()=>{field.value=b.textContent;autosize();ask(b.textContent);}));
thread.addEventListener("click",e=>{
 const f=e.target.closest("[data-follow]");if(f){field.value=f.textContent;autosize();ask(f.textContent,{followUp:true});return;}
 const s=e.target.closest("[data-synth]");if(s){synth(s);return;}
 const so=e.target.closest("[data-structure-open]");if(so)openStructure(so.dataset.structureOpen,true);
});
thread.addEventListener("submit",e=>{const f=e.target.closest("[data-followup]");if(!f)return;e.preventDefault();const v=$("input",f).value.trim();if(v){field.value=v;autosize();ask(v,{followUp:true});}});

/* ======================= MIRROR: FORM 13F ======================= */
const mirror=$("[data-mirror]");
const mstate={managers:[],cik:null,detail:null,budget:500,timer:null,sim:null};
function unavailable(m){
 mirror.innerHTML=`<div class="card ix-pad">${empty("Mirror opens when the first Form 13F reports are imported.",esc(m.reason||"Form 13F filings have not been imported yet.")+" Mirror only ever shows holdings read from managers’ own SEC filings. Until they are imported and checked, there is nothing to show, so nothing is shown.")}
  ${m.lastCheckedAt?`<p class="t-label muted">Last checked ${esc(fmtTime(m.lastCheckedAt))}.</p>`:""}${(m.notes||[]).length?`<p class="t-label muted ix-gap-t">What a 13F is, and is not</p><ul class="ix-gaps">${m.notes.map(n=>`<li>${esc(n)}</li>`).join("")}</ul>`:""}</div>`;
}
const managerList=()=>`<ul class="ix-managers" aria-label="Institutional managers">${mstate.managers.map(m=>`<li><button type="button" aria-pressed="${m.cik===mstate.cik}" data-manager="${esc(m.cik)}">${monogram(m.name||"CIK "+m.cik)}<span><span class="strong ix-line">${esc(m.name||"CIK "+m.cik)}</span><span class="t-micro muted">Quarter ended ${esc(fmtDay(m.latestPeriod))} · ${esc(fmt.money(m.reportedValue))}</span></span></button></li>`).join("")}</ul>`;
function changesHtml(d){
 const ch=d.changes;
 if(!ch)return `<section class="ix-block"><h4 class="strong">Changes between quarters</h4><p class="t-label muted">Only one quarterly report has been imported for this manager, so there is nothing to compare yet.</p></section>`;
 const list=(items,f)=>items.length?`<ul class="ix-kv">${items.slice(0,8).map(f).join("")}</ul>${items.length>8?`<p class="t-micro muted">and ${items.length-8} more</p>`:""}`:`<p class="t-label muted">None</p>`;
 return `<section class="ix-block"><h4 class="strong">Changes since the quarter ended ${esc(fmtDay(ch.comparedTo.periodOfReport))}</h4>${ch.comparable?"":`<p class="t-label muted">One of the two reports did not match its own cover-page totals, so some differences may reflect missing rows rather than changes.</p>`}
  <div class="ix-changes"><div><h5 class="t-label muted">New positions</h5>${list(ch.new,x=>`<li><span>${esc(x.issuer)}</span><span class="up">${esc(num(x.shares))} sh</span></li>`)}</div><div><h5 class="t-label muted">Exited</h5>${list(ch.exited,x=>`<li><span>${esc(x.issuer)}</span><span class="down">was ${esc(num(x.previousShares))} sh</span></li>`)}</div>
  <div><h5 class="t-label muted">Share count increased</h5>${list(ch.increased,x=>`<li><span>${esc(x.issuer)}</span><span class="up">+${esc(num(x.change))}${x.changePct!=null?" ("+pct(x.changePct,0)+")":""}</span></li>`)}</div><div><h5 class="t-label muted">Share count decreased</h5>${list(ch.decreased,x=>`<li><span>${esc(x.issuer)}</span><span class="down">${esc(num(x.change))}${x.changePct!=null?" ("+pct(x.changePct,0)+")":""}</span></li>`)}</div></div>
  <p class="t-label muted">Share counts at the two quarter ends. It does not show when, or at what price, anything changed in between.</p></section>`;
}
function profileHtml(d){
 const c=d.current,complete=c.completeness==="complete",delay=c.periodOfReport&&c.filedAt?daysBetween(c.periodOfReport,c.filedAt):null,hist=[...d.history].reverse();
 return `<div class="card ix-pad ix-profile"><header class="ix-profile__head"><p class="t-micro muted">Form 13F-HR · CIK ${esc(d.manager.cik)}</p><h3 class="t-section"><a class="ix-link" href="/entity.html?cik=${encodeURIComponent(String(d.manager.cik).replace(/^0+/,""))}">${esc(d.manager.name)}</a></h3>
  <p class="t-label muted">Holdings as of ${esc(fmtDay(c.periodOfReport))} · filed ${esc(fmtDay(c.filedAt))}${delay!=null?" · "+delay+" days after quarter end":""}</p>
  <p class="ix-actions">${ext(c.sourceUrl,"Filing")}${ext(c.infoTableUrl,"Information table")}<span class="t-label muted">${complete?"Totals match the filing’s cover page":c.completeness==="totals_missing"?"No cover-page totals to check against":"Totals do not match the cover page"}</span></p></header>
  <dl class="ix-stats"><div><dt>Reported value</dt><dd>${esc(fmt.money(d.reportedValue))}<span class="t-micro muted ix-line">${esc(usd(d.reportedValue))}</span></dd></div><div><dt>Positions</dt><dd>${esc(d.positionsTotal)}<span class="t-micro muted ix-line">${plural(c.entries,"table row")}</span></dd></div><div><dt>Quarter end</dt><dd>${esc(fmtShort(c.periodOfReport))}<span class="t-micro muted ix-line">${esc(String(c.periodOfReport||"").slice(0,4))}</span></dd></div><div><dt>Reporting delay</dt><dd>${delay!=null?delay+" d":"—"}<span class="t-micro muted ix-line">quarter end to filing</span></dd></div></dl>
  <section class="ix-sim" aria-labelledby="ix-sim-title"><h4 class="strong" id="ix-sim-title">Illustrative allocation</h4>
   <div class="ix-sim__row"><div class="ix-budget"><label class="t-label muted" for="ix-budget">Hypothetical budget</label><div class="ix-budget__field"><span aria-hidden="true">$</span><input class="input" id="ix-budget" inputmode="decimal" autocomplete="off" value="${esc(String(mstate.budget))}" aria-describedby="ix-budget-note"></div></div>
   <div class="ix-chips" role="group" aria-label="Quick budgets">${[100,500,1000,10000].map(v=>`<button type="button" class="btn btn--secondary" data-budget="${v}" aria-pressed="${mstate.budget===v}">${usd(v)}</button>`).join("")}</div></div>
   <p class="t-label muted" id="ix-budget-note">Each eligible holding gets the share of the budget that its reported value is of the eligible total, rounded to cents. Nothing is purchased or sent anywhere.</p>
   <div data-sim aria-live="polite">${loader("Calculating")}</div></section>
  <div class="ix-mirror__grid"><section class="ix-block"><h4 class="strong">Disclosure history</h4><ol class="ix-timeline">${d.history.map(h=>{const dl=h.periodOfReport&&h.filedAt?daysBetween(h.periodOfReport,h.filedAt):null;return `<li><span class="strong">Quarter ended ${esc(fmtDay(h.periodOfReport))}</span><span class="t-label muted ix-line">Filed ${esc(fmtDay(h.filedAt))}${dl!=null?" ("+dl+" days later)":""} · ${plural(h.entries,"row")} · ${esc(fmt.money(h.reportedValue))}${h.formType==="13F-HR/A"?" · amendment":""}${h.completeness!=="complete"?" · totals unverified":""}</span>${ext(h.sourceUrl,"Source")}</li>`;}).join("")}</ol>
   ${hist.length>1?`<p class="t-label muted ix-gap-t">Reported value by quarter</p>${bars(hist.map(h=>h.reportedValue),hist.map(h=>String(h.periodOfReport||"").slice(0,7)),"Reported value by quarter")}`:""}</section>${changesHtml(d)}</div>
  <section class="ix-block"><h4 class="strong">Reported holdings</h4><div class="ix-scroll"><table class="table ix-table"><thead><tr><th scope="col">Holding</th><th scope="col">Class</th><th scope="col" class="r">Shares</th><th scope="col" class="r">Reported value</th><th scope="col" class="r">Weight</th></tr></thead><tbody>${
   d.positions.slice(0,40).map(p=>`<tr><td><span class="strong">${esc(p.issuer)}</span><span class="t-micro muted ix-line">CUSIP ${esc(p.cusip)}${p.putCall?" · "+esc(p.putCall)+" option":""}${p.shareType==="PRN"?" · principal amount":""}</span></td><td>${esc(p.titleOfClass||"—")}</td><td class="r">${esc(num(p.shares))}</td><td class="r">${esc(usd(p.value))}</td><td class="r">${esc(pct(p.weightOfReported,2))}<span class="ix-meter" aria-hidden="true"><i style="width:${Math.min(100,(p.weightOfReported||0)*100/Math.max(.0001,(d.positions[0]&&d.positions[0].weightOfReported)||1)).toFixed(1)}%"></i></span></td></tr>`).join("")}</tbody></table></div>
   ${d.positionsTotal>40?`<p class="t-label muted">Showing the 40 largest of ${esc(d.positionsTotal)} positions. The simulation uses all of them.</p>`:""}</section>
  <section class="ix-block"><h4 class="strong">Coverage and delays</h4><ul class="ix-gaps">${(d.notes||[]).map(n=>`<li>${esc(n)}</li>`).join("")}</ul></section></div>`;
}
/* Squarified treemap (Bruls, Huizing, van Wijk) over the illustrative weights. */
function layout(items,W,H){
 const list=items.filter(i=>i.value>0).sort((a,b)=>b.value-a.value),total=list.reduce((s,i)=>s+i.value,0);if(!total)return [];
 const scale=W*H/total,out=[];let x=0,y=0,w=W,h=H,row=[],i=0;
 const worst=(r,side)=>{const s=r.reduce((a,b)=>a+b.area,0),mx=Math.max(...r.map(e=>e.area)),mn=Math.min(...r.map(e=>e.area));return Math.max(side*side*mx/(s*s),s*s/(side*side*mn));};
 const lay=r=>{const s=r.reduce((a,b)=>a+b.area,0);
  if(w>=h){const cw=s/h;let yy=y;for(const e of r){const eh=e.area/cw;out.push({item:e.item,x,y:yy,w:cw,h:eh});yy+=eh;}x+=cw;w-=cw;}
  else{const ch=s/w;let xx=x;for(const e of r){const ew=e.area/ch;out.push({item:e.item,x:xx,y,w:ew,h:ch});xx+=ew;}y+=ch;h-=ch;}};
 const nodes=list.map(item=>({item,area:item.value*scale}));
 while(i<nodes.length){const side=Math.min(w,h),next=nodes[i];if(!row.length||worst(row.concat(next),side)<=worst(row,side)){row.push(next);i++;}else{lay(row);row=[];}}
 if(row.length)lay(row);return out;
}
function treemapHtml(s,W,H){
 const top=s.allocations.slice(0,18),rest=s.allocations.slice(18);
 const items=top.map((a,i)=>({key:a.cusip,label:a.issuer,value:a.weight,dollars:a.dollars,rank:i}));
 if(rest.length)items.push({key:"rest",label:rest.length+" other holdings",value:rest.reduce((x,a)=>x+a.weight,0),dollars:Math.round(rest.reduce((x,a)=>x+a.dollars*100,0))/100,rank:99});
 const rects=layout(items,W,H);
 return `<svg class="ix-treemap" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc("Illustrative allocation by holding: "+items.map(i=>i.label+" "+pct(i.value)).join(", "))}">${rects.map(r=>{
  const it=r.item,big=r.w>110&&r.h>46,mid=r.w>64&&r.h>26,chars=Math.max(3,Math.floor((r.w-16)/7.4));
  return `<g class="ix-tm${it.rank<6?" is-top":""}" data-key="${esc(it.key)}"><title>${esc(it.label+" · "+pct(it.value,2)+" · "+usd(it.dollars,true))}</title><rect x="${(r.x+1).toFixed(1)}" y="${(r.y+1).toFixed(1)}" width="${Math.max(0,r.w-2).toFixed(1)}" height="${Math.max(0,r.h-2).toFixed(1)}" rx="6"/>`+
   (mid?`<text x="${(r.x+10).toFixed(1)}" y="${(r.y+21).toFixed(1)}">${esc(it.label.length>chars?it.label.slice(0,chars-1)+"…":it.label)}</text>`:"")+
   (big?`<text class="is-sub" x="${(r.x+10).toFixed(1)}" y="${(r.y+39).toFixed(1)}">${esc(pct(it.value))} · ${esc(usd(it.dollars,true))}</text>`:"")+`</g>`;}).join("")}</svg>`;
}
function simHtml(s,box){
 const W=Math.max(300,Math.round((box&&box.clientWidth)||800)),H=W<560?260:340;
 return `<dl class="ix-stats"><div><dt>Allocated</dt><dd data-tw="allocated">${esc(usd(s.allocated,true))}</dd></div><div><dt>Holdings used</dt><dd>${esc(s.eligiblePositions)}<span class="t-micro muted ix-line">of ${esc(s.positions)}</span></dd></div><div><dt>Coverage</dt><dd>${esc(pct(s.coverage))}<span class="t-micro muted ix-line">of reported value</span></dd></div><div><dt>Excluded</dt><dd>${esc(s.excluded.length)}<span class="t-micro muted ix-line">${s.excluded.length?"listed below":"none"}</span></dd></div></dl>
  <div class="ix-treemap__wrap">${treemapHtml(s,W,H)}</div>
  <details class="ix-more"><summary>Every illustrative amount (${esc(s.allocations.length)})</summary><div class="ix-more__body"><div class="ix-scroll"><table class="table ix-table"><thead><tr><th scope="col">Holding</th><th scope="col" class="r">Reported value</th><th scope="col" class="r">Weight</th><th scope="col" class="r">Illustrative amount</th></tr></thead><tbody>${
   s.allocations.map(a=>`<tr><td><span class="strong">${esc(a.issuer)}</span><span class="t-micro muted ix-line">${esc(a.titleOfClass||"")} · ${esc(a.cusip)}</span></td><td class="r">${esc(usd(a.reportedValue))}</td><td class="r">${esc(pct(a.weight,3))}</td><td class="r">${esc(usd(a.dollars,true))}</td></tr>`).join("")}</tbody></table></div></div></details>
  ${s.excluded.length?`<details class="ix-more"><summary>Excluded from the simulation (${esc(s.excluded.length)})</summary><div class="ix-more__body"><ul class="ix-gaps">${s.excluded.map(x=>`<li>${esc(x.issuer)} (${esc(usd(x.reportedValue))}): ${esc(x.reason)}</li>`).join("")}</ul></div></details>`:""}
  ${s.belowOneCent?`<p class="t-label muted">${esc(s.belowOneCent)} holdings are too small a share of this budget to receive a whole cent.</p>`:""}
  <p class="t-micro muted">${esc(s.disclaimer||"")} ${esc(s.method||"")}</p>`;
}
async function runSim(){
 const box=$("[data-sim]",mirror),input=$("#ix-budget",mirror);if(!box||!mstate.cik)return;
 const raw=(input?input.value:String(mstate.budget)).replace(/[$,\s]/g,"");
 if(!/^\d{1,8}(\.\d{1,2})?$/.test(raw)||Number(raw)<1||Number(raw)>10000000){if(input)input.setAttribute("aria-invalid","true");box.innerHTML=`<p class="t-label" role="alert">Enter a budget between $1 and $10,000,000, with at most two decimals.</p>`;return;}
 if(input)input.removeAttribute("aria-invalid");mstate.budget=Number(raw);
 $$("[data-budget]",mirror).forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.budget)===mstate.budget)));
 try{const s=await api("/v1/intelligence/mirror/simulate?cik="+encodeURIComponent(mstate.cik)+"&budget="+encodeURIComponent(raw));
  mstate.sim=s;box.innerHTML=simHtml(s,box);const el=$("[data-tw=allocated]",box);if(el)UI.roll(el,Number(s.allocated),v=>usd(v,true));}
 catch(e){if(e.status!==401&&e.status!==402)box.innerHTML=errorBlock("The simulation could not be run.",e);}
}
async function selectManager(cik){
 mstate.cik=cik;$$("[data-manager]",mirror).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.manager===cik)));
 const pane=$("[data-profile]",mirror);pane.innerHTML=`<div class="card ix-pad">${loader("Reading the manager’s filings")}</div>`;
 try{mstate.detail=await api("/v1/intelligence/mirror/managers/"+encodeURIComponent(cik));pane.innerHTML=profileHtml(mstate.detail);runSim();}
 catch(e){if(e.status!==401&&e.status!==402)pane.innerHTML=`<div class="card ix-pad">${errorBlock("This manager’s filings could not be loaded.",e,"mirror")}</div>`;}
}
async function loadMirror(){
 mirror.innerHTML=`<div class="card ix-pad">${loader("Reading Form 13F reports")}</div>`;
 try{const m=await api("/v1/intelligence/mirror/managers");mirror.setAttribute("aria-busy","false");
  if(!m.available||!(m.managers||[]).length){mirror.className="ix-mirror ix-mirror--single";unavailable(m);return;}
  mstate.managers=m.managers;mirror.className="ix-mirror";
  mirror.innerHTML=`<div class="card ix-mgrs">${managerList()}</div><div data-profile></div>`;selectManager(m.managers[0].cik);}
 catch(e){mirror.setAttribute("aria-busy","false");if(e.status!==401&&e.status!==402){mirror.className="ix-mirror ix-mirror--single";mirror.innerHTML=`<div class="card ix-pad">${errorBlock("Mirror could not be loaded.",e,"mirror")}</div>`;}}
}
mirror.addEventListener("click",e=>{
 const m=e.target.closest("[data-manager]");if(m&&m.dataset.manager!==mstate.cik){selectManager(m.dataset.manager);return;}
 const b=e.target.closest("[data-budget]");if(b){const input=$("#ix-budget",mirror);if(input)input.value=b.dataset.budget;runSim();return;}
 if(e.target.closest('[data-retry="mirror"]'))loadMirror();
});
mirror.addEventListener("input",e=>{if(e.target.id==="ix-budget"){clearTimeout(mstate.timer);mstate.timer=setTimeout(runSim,350);}});
mirror.addEventListener("keydown",e=>{if(e.target.id==="ix-budget"&&e.key==="Enter"){clearTimeout(mstate.timer);runSim();}});
(()=>{let w=0;if("ResizeObserver" in window)new ResizeObserver(()=>{const box=$("[data-sim]",mirror),nw=box?Math.round(box.clientWidth):0;if(mstate.sim&&box&&Math.abs(nw-w)>40){w=nw;const wrap=$(".ix-treemap__wrap",box);if(wrap)wrap.innerHTML=treemapHtml(mstate.sim,Math.max(300,nw),nw<560?260:340);}}).observe(mirror);})();

/* ---------- start ---------- */
aiStatus().finally(loadBriefing);
loadInstrument();loadTape();loadMirror();autosize();
const q=new URLSearchParams(location.search).get("q");
if(q&&q.length<=400){field.value=q;autosize();ask(q);}
})();
