/* Insidir Intelligence: Briefing, Investigate and Mirror. Every row comes from an indexed public record and links to
   its source; nothing is generated per page view. Mirror shows what followed people reported, after the fact: it
   cannot copy trades or place orders. Text is set with textContent only; links only to the source hosts below. */
(()=>{"use strict";
const $=id=>document.getElementById(id);
const SOURCE_HOSTS=["www.sec.gov","efts.sec.gov","disclosures-clerk.house.gov","bsky.app"];
const safeUrl=v=>{try{const u=new URL(String(v||""));return u.protocol==="https:"&&SOURCE_HOSTS.includes(u.hostname)?u.href:null;}catch{return null;}};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=String(text);return n;};
const day=v=>{if(!v)return null;const s=String(v),d=/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0,10))&&s.length<=10?new Date(s+"T00:00:00Z"):new Date(s);
  return Number.isFinite(d.getTime())?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:s.length<=10?"UTC":undefined}):null;};
const group=v=>{const m=/^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v??"").trim());if(!m)return null;const f=(m[3]||"").replace(/0+$/,"");return m[1]+m[2].replace(/\B(?=(\d{3})+(?!\d))/g,",")+(f?"."+f:"");};
async function get(url){
  const r=await fetch(url,{credentials:"same-origin",headers:{Accept:"application/json"}});
  let d={};try{d=await r.json();}catch{}
  if(!r.ok){const e=new Error(r.status===401?"Log in to see your intelligence.":r.status===402?"An active subscription is required.":r.status===429?"Too many requests. Try again in a few minutes.":d.error||"Research is temporarily unavailable.");e.status=r.status;throw e;}
  return d;
}
const empty=(host,text,link)=>{const p=el("p","iv-empty",text);if(link){p.append(" ");const a=el("a",null,link[0]);a.href=link[1];p.append(a);}host.replaceChildren(p);};
const sourceLink=(url,label)=>{const u=safeUrl(url);if(!u)return el("span","iv-src iv-src--none","Source unavailable");const a=el("a","iv-src",label||"Original filing ↗");a.href=u;a.target="_blank";a.rel="noopener noreferrer";return a;};

/* A Form 4 research event (sec_events): direction badge, the factual summary, the three dates, the source. */
function eventRow(e){
  const li=el("article","iv-row");
  const top=el("div","iv-row__top");
  const buy=e.eventType==="insider_purchase"||e.eventType==="multi_insider_purchase";
  const sell=e.eventType==="insider_sale";
  top.append(el("span","iv-badge"+(buy?" is-up":sell?" is-down":""),buy?"Reported purchase":sell?"Reported sale":e.eventType==="form4_amendment"?"Amendment":"Form 4"));
  if(e.ticker){const t=el("a","iv-ticker",e.ticker);t.href="company.html?ticker="+encodeURIComponent(e.ticker);top.append(t);}
  if(e.amended)top.append(el("span","iv-badge","Amended"));
  li.append(top,el("p","iv-row__text",e.summary||""));
  const meta=el("p","iv-row__meta");
  const bits=[];
  if(e.transactionDate)bits.push("Traded "+day(e.transactionDate)+(e.transactionDateEnd&&String(e.transactionDateEnd).slice(0,10)!==String(e.transactionDate).slice(0,10)?" – "+day(e.transactionDateEnd):""));
  if(e.filingDate)bits.push("Filed "+day(e.filingDate));
  if(e.reportingLagDays!=null)bits.push("Reported "+e.reportingLagDays+(e.reportingLagDays===1?" day":" days")+" later");
  meta.append(el("span",null,bits.join(" · ")+" "));
  (e.sourceUrls||[]).slice(0,2).forEach((u,i)=>meta.append(sourceLink(u,i?"Second filing ↗":"Original filing ↗")," "));
  li.append(meta);return li;
}
/* A verified public notice or an imported filing (research_events / sec_filings). */
function noticeRow(x){
  const li=el("article","iv-row");
  const top=el("div","iv-row__top");
  top.append(el("span","iv-badge",x.source_type==="bluesky_post"?"Public post":x.form_type?"SEC "+x.form_type:"SEC notice"));
  const subject=x.subject||x.ticker;if(subject)top.append(el("span","iv-ticker iv-ticker--plain",subject));
  li.append(top,el("p","iv-row__text",String(x.title||(x.form_type?(x.issuer_name||"Issuer")+": Form "+x.form_type+" imported from EDGAR":x.issuer_name)||"SEC filing").slice(0,240)));
  const meta=el("p","iv-row__meta");meta.append(el("span",null,(day(x.published_at||x.observed_at)?"Published "+day(x.published_at||x.observed_at):"Date unavailable")+" "),sourceLink(x.source_url,"Original source ↗"));
  li.append(meta);return li;
}
const fill=(host,rows,render,none,link)=>{if(!rows.length)return empty(host,none,link);const f=document.createDocumentFragment();rows.forEach(r=>f.append(render(r)));host.replaceChildren(f);};

/* ---------- Briefing ---------- */
async function briefing(){
  const filings=$("intel-filings"),notices=$("intel-briefing");
  await Promise.all([
    get("/v1/me/intelligence/filings").then(d=>fill(filings,d.items||[],eventRow,"No Form 4 purchases or sales for your watchlist or the people you follow in the past 7 days.",["Follow people","people.html"])).catch(e=>empty(filings,e.message)),
    get("/v1/me/intelligence/briefing").then(d=>fill(notices,d.items||[],noticeRow,"No verified company announcements for your watchlist in the past 7 days.",["Edit your watchlist","watchlist.html"])).catch(e=>empty(notices,e.message))
  ]);
}

/* ---------- Investigate ---------- */
function investigate(){
  const form=$("intel-form"),input=$("intel-ticker"),status=$("intel-form-status"),out=$("intel-results");
  const params=new URLSearchParams(location.search);
  form.addEventListener("submit",async ev=>{
    ev.preventDefault();
    const ticker=input.value.trim().toUpperCase();
    if(!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker)){status.textContent="Enter a ticker symbol: letters, digits, dots or dashes.";status.classList.add("is-error");input.focus();return;}
    status.classList.remove("is-error");status.textContent="Searching indexed records for "+ticker+"…";
    const btn=form.querySelector("button");btn.disabled=true;
    try{
      const d=await get("/v1/me/intelligence/investigate?ticker="+encodeURIComponent(ticker));
      status.textContent=d.summary||"";
      const rows=[...(d.events||[]),...(d.filings||[])].sort((a,b)=>new Date(b.published_at||0)-new Date(a.published_at||0));
      fill(out,rows,noticeRow,"No indexed records for "+ticker+" in the past 30 days. That does not establish that nothing was filed.",["Open the company report","company.html?ticker="+encodeURIComponent(ticker)]);
      history.replaceState(null,"","?ticker="+encodeURIComponent(ticker)+"#investigate");
    }catch(e){status.textContent=e.message;status.classList.add("is-error");}
    finally{btn.disabled=false;}
  });
  const t=(params.get("ticker")||"").toUpperCase();
  if(/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)){input.value=t;form.requestSubmit();}
}

/* ---------- Mirror ---------- */
async function mirror(){
  const out=$("intel-mirror"),people=$("intel-mirror-people");
  try{
    const d=await get("/v1/me/intelligence/mirror");
    if(!d.following){people.replaceChildren();return empty(out,"You don't follow anyone yet. Follow a director or officer and their reported Form 4 purchases and sales appear here.",["Find people","people.html"]);}
    const f=document.createDocumentFragment();
    for(const p of d.people||[]){
      const card=el("a","iv-person");card.href="person.html?cik="+encodeURIComponent(String(p.ownerCik||"").replace(/^0+/,""));
      card.append(el("b",null,p.ownerName||"Reporting owner"),
        el("span",null,p.purchases+" reported purchase"+(p.purchases===1?"":"s")+" · "+p.sales+" sale"+(p.sales===1?"":"s")),
        el("span",null,p.avgLagDays==null?"Reporting delay unavailable":"Reported on average "+group(p.avgLagDays)+" days after trading"));
      f.append(card);
    }
    people.replaceChildren(f);
    fill(out,d.items||[],eventRow,"The "+d.following+" "+(d.following===1?"person":"people")+" you follow reported no open-market purchases or sales in the past "+d.windowDays+" days.",["Follow more people","people.html"]);
  }catch(e){people.replaceChildren();empty(out,e.message);}
}

/* ---------- tabs (WAI-ARIA tabs pattern; the hash keeps the view on reload) ---------- */
const views={briefing,investigate,mirror},loaded=new Set();
const tabs=[...document.querySelectorAll('[role="tab"]')];
function show(name,focus){
  if(!views[name])name="briefing";
  for(const t of tabs){const on=t.id==="tab-"+name;t.setAttribute("aria-selected",String(on));t.tabIndex=on?0:-1;$(t.getAttribute("aria-controls")).hidden=!on;if(on&&focus)t.focus();}
  if(!loaded.has(name)){loaded.add(name);views[name]();}
  if(location.hash!=="#"+name)history.replaceState(null,"",location.pathname+location.search+(name==="briefing"?"":"#"+name));
}
tabs.forEach((t,i)=>{
  t.addEventListener("click",()=>show(t.id.slice(4)));
  t.addEventListener("keydown",e=>{const k={ArrowRight:1,ArrowLeft:-1,Home:-i,End:tabs.length-1-i}[e.key];if(k==null)return;e.preventDefault();show(tabs[(i+k+tabs.length)%tabs.length].id.slice(4),true);});
});
show(location.hash.slice(1)||(new URLSearchParams(location.search).get("ticker")?"investigate":"briefing"));
})();
