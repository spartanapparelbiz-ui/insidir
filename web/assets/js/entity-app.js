/* One SEC filer or fund (entity.html?cik=<CIK>) on the ui.css design. Everything shown is what the record says:
     GET /v1/entities/<cik>                         the SEC record (src/sec-directory.mjs): names, tickers, kind, imported
                                                    Form 4 relationships, EDGAR's latest filings
     GET /v1/intelligence/mirror/managers[/<cik>]   its Form 13F holdings, when it is one of the managers Insidir imports
     GET /v1/entities/<cik>/connections?asOf=       people and companies tied to it by Form 4 filings (graph and list)
     GET /v1/entities/<cik>/changes?days=           what changed, each item with its SEC evidence
     GET /v1/ai/status, GET /v1/ai/explain          a checked plain-English summary of a filing, only when AI is on
     POST /v1/me/people {owner_cik}                 follow a reporting owner
   Explicit states for an invalid CIK, a CIK EDGAR has never assigned, and EDGAR being unreachable. */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,fmt,esc,logo,hydrateLogos,monogram,filingHref}=UI;
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const raw=(new URLSearchParams(location.search).get("cik")||"").trim();
const status=$("[data-en-status]");
const say=t=>{status.textContent=t||"";};
const secUrl=u=>{try{const x=new URL(u);return x.protocol==="https:"&&(x.hostname==="www.sec.gov"||x.hostname==="data.sec.gov")?x.href:null;}catch{return null;}};
const ext=(u,label)=>{const s=secUrl(u);return s?`<a class="en-link" href="${esc(s)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`:"";};
// Ownership forms open inside Insidir; everything else on SEC.gov.
const filingLink=(form,u,acc,label)=>/^(3|4|5)(\/A)?$/.test(String(form||"").trim())?`<a class="en-link" href="${esc(filingHref(u,acc))}">${esc(label)}</a>`:ext(u,label);
const day=v=>fmt.date(v)||"—";
const usd=n=>n==null||!Number.isFinite(Number(n))?"—":"$"+Number(n).toLocaleString("en-US",{maximumFractionDigits:0});
const num=n=>n==null?"—":Number(n).toLocaleString("en-US",{maximumFractionDigits:4});
const pct=(x,d=1)=>x==null?"—":(x*100).toFixed(d)+"%";
const plural=(n,one,many)=>n+" "+(n===1?one:many||one+"s");
const failed=(el,what,retry)=>{el.innerHTML=`<div class="err"><p>${esc(what)} didn't load.</p><button class="btn btn--secondary" type="button">Try again</button></div>`;el.querySelector("button").addEventListener("click",retry);};
const quiet=(el,h,p)=>{el.innerHTML=`<div class="empty"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`;};
const KIND={company:"Company",person:"Reporting person",organization:"Reporting entity",unknown:"SEC filer"};
const BASIS={sec_ticker_list:"on the SEC company ticker list",form4_issuer:"issuer on an imported Form 4",edgar_submissions:"from its EDGAR submissions",filed_name_pattern:"read from the name as filed",edgar_entity_lookup:"found in EDGAR's name lookup"};
const AS={name:"SEC name",former:"Former name",ticker:"Ticker",filed:"Name as filed"};
const SOURCE={sec_ticker_list:"SEC ticker list",edgar_submissions:"EDGAR submissions",edgar_entity_lookup:"EDGAR name lookup",form4_issuer:"Form 4 (issuer)",form4_owner:"Form 4 (reporting owner)"};

if(!/^\d{1,10}$/.test(raw)||!/[1-9]/.test(raw)){
 $("[data-en-pic]").innerHTML="";$("[data-en-name]").textContent="SEC filer";
 $("[data-en-sub]").textContent="This link has no valid SEC CIK (up to 10 digits).";
 $("[data-en-acts]").innerHTML=`<button class="btn btn--primary" type="button" data-en-search>Search a fund or filer</button>`;
 $("[data-en-search]").addEventListener("click",()=>UI.palette());return;
}
const cik10=raw.padStart(10,"0"),bare=String(Number(raw));
let R=null,M=null;

/* ---------- tabs ---------- */
const loaders={holdings,filings,connections,changes,record};
const loaded=new Set();let current=null;
function show(k,focus){current=k;for(const b of $$("[role=tab]")){const on=b.getAttribute("aria-controls")==="pan-"+k;b.setAttribute("aria-selected",String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus();}
 for(const p of $$("[data-pan]"))p.hidden=p.dataset.pan!==k;history.replaceState(null,"","#"+k);if(!loaded.has(k)){loaded.add(k);loaders[k]();}}
$$("[role=tab]").forEach(b=>{b.addEventListener("click",()=>show(b.getAttribute("aria-controls").slice(4)));
 b.addEventListener("keydown",e=>{if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft")return;const all=$$("[role=tab]").filter(x=>!x.hidden),i=all.indexOf(b),n=all[(i+(e.key==="ArrowRight"?1:all.length-1))%all.length];show(n.getAttribute("aria-controls").slice(4),true);});});

/* ---------- header ---------- */
function header(){
 const e=R.entity,isCo=e.kind==="company";
 document.title=(fmt.company(e.name)||e.name)+" · CIK "+e.cik+" — Insidir";
 $("[data-en-pic]").innerHTML=isCo&&e.tickers[0]?logo(e.tickers[0],56,e.name):e.kind==="person"?UI.face(e.displayName||e.name,{cik:e.cik,size:56}):`<span class="logo logo--56" aria-hidden="true">${esc(UI.initials(e.name))}</span>`;
 $("[data-en-name]").textContent=e.kind==="person"?(e.displayName||fmt.person(e.name)):(fmt.company(e.name)||e.name);
 const listing=!isCo?"":e.listed?"Listed: "+e.tickers.map((t,i)=>t+(e.exchanges[i]?" ("+e.exchanges[i]+")":"")).join(", "):e.delistedAt?"No longer on the SEC ticker list since "+day(e.delistedAt):"No ticker on the SEC ticker list";
 $("[data-en-sub]").textContent=[M?"Fund filing Form 13F":KIND[e.kind]||"SEC filer","CIK "+e.cik,listing].filter(Boolean).join(" · ");
 const acts=[];
 if(isCo&&e.listed&&e.tickers[0])acts.push(`<a class="btn btn--primary" href="/company.html?ticker=${encodeURIComponent(e.tickers[0])}">Stock page</a>`);
 if(e.isReportingOwner)acts.push(`<a class="btn btn--secondary" href="/person.html?cik=${bare}">Reporting-owner page</a><button class="btn btn--secondary" type="button" data-en-follow>Follow</button>`);
 acts.push(`<a class="btn btn--ghost" href="${esc(secUrl(R.edgar?.browseUrl)||"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="+cik10+"&owner=include&count=40")}" target="_blank" rel="noopener noreferrer">EDGAR ↗</a>`);
 $("[data-en-acts]").innerHTML=acts.join("");hydrateLogos($("[data-en-pic]"));
 $("[data-en-follow]")?.addEventListener("click",async ev=>{const b=ev.currentTarget;b.disabled=true;
  try{await api("/v1/me/people",{method:"POST",body:{owner_cik:cik10}});b.textContent="Following";say("Following. Their Form 4 filings appear in your alerts and briefing as Insidir imports them.");}
  catch(err){b.disabled=false;say("Could not follow: "+err.message);}});
 say(R.edgarState==="source_unavailable"?"SEC EDGAR could not be reached just now; this is what Insidir has stored for CIK "+e.cik+".":"");
}

/* ---------- holdings (13F) ---------- */
function holdings(){
 const el=$("[data-pan=holdings]"),d=M,c=d.current,ch=d.changes;
 const delay=c.periodOfReport&&c.filedAt?Math.round((Date.parse(c.filedAt)-Date.parse(c.periodOfReport))/864e5):null;
 const list=(items,f)=>items.length?`<ul class="en-kv">${items.slice(0,8).map(f).join("")}</ul>${items.length>8?`<p class="t-micro muted">and ${items.length-8} more</p>`:""}`:`<p class="t-label muted">None</p>`;
 el.innerHTML=`<div class="en-stats"><div><p class="t-label muted">Reported value</p><p class="t-section">${UI.big(d.reportedValue)}</p></div><div><p class="t-label muted">Positions</p><p class="t-section">${esc(d.positionsTotal)}</p></div>
  <div><p class="t-label muted">Quarter ended</p><p class="t-section">${esc(day(c.periodOfReport))}</p></div><div><p class="t-label muted">Filed</p><p class="t-section">${esc(day(c.filedAt))}</p>${delay!=null?`<p class="t-micro muted">${delay} days after quarter end</p>`:""}</div></div>
  <p class="en-links">${ext(c.sourceUrl,"Form "+(c.formType||"13F-HR")+" on SEC.gov")}${ext(c.infoTableUrl,"Information table")}<span class="t-label muted">${c.completeness==="complete"?"Totals match the filing’s cover page":c.completeness==="totals_missing"?"No cover-page totals to check against":"Totals do not match the cover page"}</span></p>
  <div class="en-scroll"><table class="table en-table"><thead><tr><th scope="col">Holding</th><th scope="col">Class</th><th scope="col" class="r">Shares</th><th scope="col" class="r">Value</th><th scope="col" class="r">Weight</th></tr></thead><tbody>${
   d.positions.slice(0,50).map(p=>`<tr><td><span class="strong">${esc(fmt.company(p.issuer)||p.issuer)}</span><span class="t-micro muted en-line">CUSIP ${esc(p.cusip)}${p.putCall?" · "+esc(p.putCall)+" option":""}</span></td><td class="t-label muted">${esc(p.titleOfClass||"—")}</td><td class="r">${esc(num(p.shares))}</td><td class="r">${esc(fmt.money(p.value))}</td><td class="r">${esc(pct(p.weightOfReported,1))}</td></tr>`).join("")}</tbody></table></div>
  ${d.positionsTotal>50?`<p class="t-label muted">The 50 largest of ${esc(d.positionsTotal)} positions. The full list is in the information table on SEC.gov.</p>`:""}
  <h2 class="t-label muted en-h">${ch?"Changes since the quarter ended "+esc(day(ch.comparedTo.periodOfReport)):"Changes between quarters"}</h2>
  ${ch?`${ch.comparable?"":`<p class="t-label muted">One of the two reports did not match its own cover-page totals, so some differences may reflect missing rows.</p>`}<div class="en-changes">
   <div><h3 class="t-label muted">New positions</h3>${list(ch.new,x=>`<li><span>${esc(fmt.company(x.issuer)||x.issuer)}</span><span class="up">${esc(num(x.shares))} sh</span></li>`)}</div>
   <div><h3 class="t-label muted">Exited</h3>${list(ch.exited,x=>`<li><span>${esc(fmt.company(x.issuer)||x.issuer)}</span><span class="down">was ${esc(num(x.previousShares))} sh</span></li>`)}</div>
   <div><h3 class="t-label muted">Increased</h3>${list(ch.increased,x=>`<li><span>${esc(fmt.company(x.issuer)||x.issuer)}</span><span class="up">+${esc(num(x.change))}${x.changePct!=null?" ("+pct(x.changePct,0)+")":""}</span></li>`)}</div>
   <div><h3 class="t-label muted">Decreased</h3>${list(ch.decreased,x=>`<li><span>${esc(fmt.company(x.issuer)||x.issuer)}</span><span class="down">${esc(num(x.change))}${x.changePct!=null?" ("+pct(x.changePct,0)+")":""}</span></li>`)}</div></div>`:`<p class="t-label muted">Only one quarterly report has been imported, so there is nothing to compare yet.</p>`}
  <h2 class="t-label muted en-h">Disclosure history</h2>
  <ul class="rows">${d.history.map(h=>`<li class="row en-filing">${secUrl(h.sourceUrl)?`<a class="hit" href="${esc(secUrl(h.sourceUrl))}" target="_blank" rel="noopener noreferrer" aria-label="Form ${esc(h.formType)} for the quarter ended ${esc(day(h.periodOfReport))} on SEC.gov"></a>`:""}<span class="strong">${esc(h.formType||"13F-HR")}</span><span class="t-label muted">Quarter ended ${esc(day(h.periodOfReport))} · ${plural(h.entries,"row")} · ${esc(fmt.money(h.reportedValue))}${h.completeness!=="complete"?" · totals unverified":""}</span><span class="t-micro muted">Filed ${esc(day(h.filedAt))}</span></li>`).join("")}</ul>
  <ul class="en-notes">${(d.notes||[]).map(n=>`<li>${esc(n)}</li>`).join("")}</ul>`;
}

/* ---------- filings (EDGAR) ---------- */
function filings(){
 const el=$("[data-pan=filings]"),f=R.edgar?.recentFilings||[];
 if(!f.length){quiet(el,"No recent filings from EDGAR",R.edgar?"EDGAR lists no recent filings for this filer.":"EDGAR could not be reached just now. Try again shortly, or open the EDGAR index above.");return;}
 el.innerHTML=`<ul class="rows">${f.slice(0,40).map(x=>{const own=/^(3|4|5)(\/A)?$/.test(x.form),href=own?filingHref(x.url,x.accession):secUrl(x.url);
  return `<li class="row en-filing">${href?`<a class="hit" href="${esc(href)}"${own?"":' target="_blank" rel="noopener noreferrer"'} aria-label="Form ${esc(x.form)} filed ${esc(day(x.filedAt))}${own?"":" on SEC.gov"}"></a>`:""}<span class="strong">${/^\d/.test(x.form)?"Form ":""}${esc(x.form)}</span><span class="t-label muted">${x.reportDate?"For "+esc(day(x.reportDate)):"&nbsp;"}</span><span class="t-micro muted">${esc(day(x.filedAt))}${own?"":" ↗"}</span></li>`;}).join("")}</ul>
  ${R.edgar?.olderFilingFiles?`<p class="t-label muted">EDGAR keeps older filings in ${plural(R.edgar.olderFilingFiles,"more file")}. ${ext(R.edgar.browseUrl,"Full EDGAR history")}</p>`:""}`;
}

/* ---------- connections ---------- */
let asOf="";
async function connections(){
 const el=$("[data-pan=connections]");
 el.innerHTML=`<div class="en-tools"><label class="en-field"><span class="t-label muted">As of</span><input class="input" type="date" data-asof value="${esc(asOf)}"></label>
  <div class="seg" role="group" aria-label="View"><button type="button" data-view="map" aria-pressed="true">Map</button><button type="button" data-view="list" aria-pressed="false">List</button></div></div><div data-conn><span class="skel" style="display:block;height:320px"></span></div>`;
 $("[data-asof]",el).addEventListener("change",e=>{asOf=e.target.value;connections();});
 const box=$("[data-conn]",el);
 let d;try{d=await api("/v1/entities/"+cik10+"/connections?limit=40"+(asOf?"&asOf="+encodeURIComponent(asOf):""));}
 catch(e){if(e.status===404){quiet(box,"No connections yet","No Form 4 relationships are in Insidir's imported filings for this filer.");return;}failed(box,"The connections",connections);return;}
 if(!(d.edges||[]).length){quiet(box,"No connections yet","People and companies tied to this filer by Form 4 filings appear here.");return;}
 const byId=new Map((d.nodes||[]).map(n=>[n.id,n]));
 const name=n=>!n?"—":n.kind==="person"?fmt.person(n.name):fmt.company(n.name)||n.name;
 const nodeLink=n=>{if(!n)return "—";const h=String(n.url||"").replace(/^\//,"");return /^[a-z]+\.html\?[a-z]+=[A-Za-z0-9.-]+$/.test(h)?`<a class="en-link" href="/${esc(h)}">${esc(name(n))}</a>`:esc(name(n));};
 const pic=n=>!n?"":n.kind==="company"?logo(n.ticker||"",24,n.name):n.kind==="person"?UI.face(n.name,{cik:n.id,size:24}):monogram(n.name);
 const list=`<ul class="rows">${d.edges.map(e=>{const a=byId.get(e.from),b=byId.get(e.to);
  return `<li class="row en-edge"><span class="en-who">${pic(a)}${nodeLink(a)}</span><span class="t-label muted">${esc(e.type==="reports_at"?e.role||"Reporting owner":"Filed jointly")}</span><span class="en-who">${pic(b)}${nodeLink(b)}</span>
   <span class="t-micro muted">${plural(e.filings,"filing")}, ${esc(day(e.firstFiledOn))}${e.lastFiledOn!==e.firstFiledOn?" to "+esc(day(e.lastFiledOn)):""}<span class="en-line">${(e.evidence||[]).map(x=>filingLink("4",x.url,null,day(x.filedOn))).join(" ")}</span></span></li>`;}).join("")}</ul>`;
 box.innerHTML=`<div data-graph></div><div data-list hidden>${list}</div><ul class="en-notes">${(d.gaps||[]).map(g=>`<li>${esc(g)}</li>`).join("")}${d.method?`<li>${esc(d.method)}</li>`:""}</ul>`;
 hydrateLogos(box);
 window.InsidirGraph?.mount($("[data-graph]",box),d,{cap:25});
 const setView=v=>{$$("[data-view]",el).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.view===v)));$("[data-graph]",box).hidden=v!=="map";$("[data-list]",box).hidden=v!=="list";};
 $$("[data-view]",el).forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
 if(matchMedia("(max-width:767px)").matches)setView("list");
}

/* ---------- what changed ---------- */
const CK={form4:"Insider trade",form4_amendment:"Correction",role_change:"Role change",first_seen:"New insider",financial_fact:"Results",sec_filing:"Company filing",holdings_13f:"Fund holdings"};
let days=90,hide=new Set(),aiOn=null;
async function changes(){
 const el=$("[data-pan=changes]");
 el.innerHTML=`<div class="en-tools"><div class="en-kinds" role="group" aria-label="Kinds of change" data-kinds></div>
  <div class="seg" role="group" aria-label="Window">${[30,90,180,365].map(n=>`<button type="button" data-days="${n}" aria-pressed="${n===days}">${n===365?"1 year":n+" days"}</button>`).join("")}</div></div><div data-list><span class="skel" style="display:block;height:160px"></span></div><ul class="en-notes" data-gaps></ul>`;
 $$("[data-days]",el).forEach(b=>b.addEventListener("click",()=>{days=Number(b.dataset.days);changes();}));
 if(aiOn==null)aiOn=api("/v1/ai/status").then(s=>!!s.configured).catch(()=>false);
 const box=$("[data-list]",el);
 let d;try{d=await api("/v1/entities/"+cik10+"/changes?days="+days);}
 catch(e){if(e.status===404){quiet(box,"No imported records yet","Insidir has no imported SEC records for this filer yet.");return;}failed(box,"What changed",changes);return;}
 const items=d.items||[],ai=await aiOn;
 $("[data-kinds]",el).innerHTML=Object.entries(d.counts||{}).map(([k,n])=>`<button type="button" class="btn btn--secondary" data-kind="${esc(k)}" aria-pressed="${!hide.has(k)}">${esc(CK[k]||k)} <span class="muted">${esc(n)}</span></button>`).join("");
 $("[data-gaps]",el).innerHTML=(d.gaps||[]).map(g=>`<li>${esc(g)}</li>`).join("")+(d.method?`<li>${esc(d.method)}</li>`:"");
 const paint=()=>{const show=items.filter(i=>!hide.has(i.kind));
  if(!show.length){quiet(box,"No changes in this window","Nothing changed in the records Insidir holds for this filer in the last "+days+" days.");return;}
  box.innerHTML=`<ul class="en-changelist">${show.map((it,n)=>{const ev=(it.evidence||[]).filter(x=>x&&x.url),src=ev[0];
   return `<li><p class="t-micro muted">${esc(day(it.date))} · ${esc(CK[it.kind]||it.kind)}</p><p class="strong">${esc(it.headline||it.title)}</p>${it.summary||it.detail?`<p class="t-label muted">${esc(it.summary||it.detail)}</p>`:""}
    <p class="en-links">${src?filingLink(/Form 4/i.test(src.source||"")||/^form4/.test(it.kind)?"4":"",src.url,it.accession,/^form4/.test(it.kind)?"Open the filing":"Source on SEC.gov"):""}${ai&&it.explainable&&it.accession?`<button class="btn btn--ghost" type="button" data-explain="${esc(it.accession)}">Explain this filing</button>`:""}</p>
    ${ev.length>1?`<details class="en-more"><summary>All evidence (${ev.length})</summary><ul>${ev.map(x=>`<li>${esc(x.title||x.source)} · ${esc(day(x.filedOn))} ${ext(x.url,"SEC.gov")}</li>`).join("")}</ul></details>`:""}<div data-explained></div></li>`;}).join("")}</ul>`;};
 $$("[data-kind]",el).forEach(b=>b.addEventListener("click",()=>{const k=b.dataset.kind;hide.has(k)?hide.delete(k):hide.add(k);b.setAttribute("aria-pressed",String(!hide.has(k)));paint();}));
 box.addEventListener("click",async e=>{const b=e.target.closest("[data-explain]");if(!b)return;const out=b.closest("li").querySelector("[data-explained]");b.disabled=true;out.innerHTML=`<p class="t-label muted">Writing a summary from this filing…</p>`;
  try{const r=await api("/v1/ai/explain?accession="+encodeURIComponent(b.dataset.explain));out.innerHTML=`<div class="en-ai"><p>${esc(r.explanation)}</p><p class="t-micro muted">Written by AI from this filing only and checked against it. Read the filing before relying on it. Research, not investment advice.</p></div>`;}
  catch(err){out.innerHTML=`<p class="t-label muted">${esc(err.message)}</p>`;b.disabled=false;}});
 paint();
}

/* ---------- the SEC record ---------- */
function record(){
 const el=$("[data-pan=record]"),e=R.entity;
 const facts=[["SEC CIK",esc(e.cik)],["Kind",esc(KIND[e.kind]||e.kind)+(BASIS[e.kindBasis]?` <span class="muted">(${esc(BASIS[e.kindBasis])})</span>`:"")]];
 if(e.tickers.length)facts.push(["Tickers",esc(e.tickers.join(", "))]);
 if(e.sicDescription||e.sic)facts.push(["Industry (SIC)",esc((e.sic||"")+(e.sicDescription?" · "+e.sicDescription:""))]);
 if(e.stateOfIncorporation)facts.push(["Incorporated",esc(e.stateOfIncorporation)]);
 const imp=e.importedFilings||{};facts.push(["Form 4 imported",esc([imp.asIssuer?imp.asIssuer+" as issuer":"",imp.asOwner?imp.asOwner+" as reporting owner":""].filter(Boolean).join(" · ")||"None")]);
 facts.push(["SEC record checked",esc(e.profileRefreshedAt?day(e.profileRefreshedAt):R.edgarState==="source_unavailable"?"EDGAR unreachable just now":"Not yet")]);
 const rel=R.imported?.asReportingOwner||[],names=R.names||[];
 el.innerHTML=`<dl class="en-facts">${facts.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
  <h2 class="t-label muted en-h">Reported relationships (Form 4, as a reporting owner)</h2>
  ${rel.length?`<ul class="rows">${rel.map(x=>`<li class="row en-rel"><span class="en-who">${logo(x.ticker||"",24,x.issuerName)}<span>${x.ticker?`<a class="en-link" href="/company.html?ticker=${encodeURIComponent(x.ticker)}">${esc(fmt.company(x.issuerName)||x.ticker)}</a>`:`<a class="en-link" href="/entity.html?cik=${encodeURIComponent(String(Number(x.issuerCik)))}">${esc(fmt.company(x.issuerName)||"CIK "+x.issuerCik)}</a>`}<span class="t-micro muted en-line">${esc(x.role||"Role not stated on the filing")}</span></span></span><span class="t-label muted">${plural(x.filings,"filing")} · last ${esc(day(x.lastFiledAt))}</span>${x.evidenceUrl?filingLink("4",x.evidenceUrl,null,"Latest filing"):"<span></span>"}</li>`).join("")}</ul>`:`<p class="t-label muted">No imported Form 4 filings name this filer as a reporting owner.</p>`}
  <h2 class="t-label muted en-h">Names and tickers on file</h2>
  ${names.length?`<div class="en-scroll"><table class="table en-table"><thead><tr><th scope="col">Name or ticker</th><th scope="col">As</th><th scope="col">Source</th><th scope="col">Period</th></tr></thead><tbody>${names.map(n=>`<tr><td>${esc(n.name)}</td><td class="t-label muted">${esc(AS[n.as]||n.as)}</td><td class="t-label muted">${esc(SOURCE[n.source]||n.source)}</td><td class="t-label muted">${n.from||n.to?esc(day(n.from))+" – "+esc(day(n.to)):"—"}</td></tr>`).join("")}</tbody></table></div>`:`<p class="t-label muted">No other names are on file.</p>`}`;
 hydrateLogos(el);
}

/* ---------- load ---------- */
(async()=>{
 try{
  const [r,m]=await Promise.all([api("/v1/entities/"+encodeURIComponent(raw)),api("/v1/intelligence/mirror/managers").then(l=>(l.managers||[]).some(x=>String(x.cik).padStart(10,"0")===cik10)?api("/v1/intelligence/mirror/managers/"+encodeURIComponent(cik10)):null).catch(()=>null)]);
  R=r;M=m&&m.current&&Array.isArray(m.positions)?m:null;
 }catch(e){
  if(e.status===401||e.status===402)return;
  $("[data-en-pic]").innerHTML="";$("[data-en-name]").textContent="CIK "+raw;
  $("[data-en-sub]").textContent=e.status===404?"EDGAR has no filer with CIK "+raw+". Check the number, or search by name.":e.status===503?e.message:"The SEC record didn't load. Try again shortly.";
  $("[data-en-acts]").innerHTML=e.status===404?`<button class="btn btn--primary" type="button" data-en-search>Search a fund or filer</button>`:`<button class="btn btn--secondary" type="button" data-en-retry>Try again</button>`;
  $("[data-en-search]")?.addEventListener("click",()=>UI.palette());$("[data-en-retry]")?.addEventListener("click",()=>location.reload());return;
 }
 header();$("[data-en-body]").hidden=false;
 $("#tab-holdings").hidden=!M;
 let start=(location.hash||"").slice(1);
 if(!loaders[start]||(start==="holdings"&&!M))start=M?"holdings":"filings";
 show(start);
})();
})();
