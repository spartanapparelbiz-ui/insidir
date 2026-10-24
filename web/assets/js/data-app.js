/* data.html: the live coverage report from GET /v1/coverage (src/coverage-ingest.mjs), on ui.css. Every number is a
   count the engine made from its database for this request; nothing here is a target, an estimate or a fixed figure.
   A skeleton until it lands; if it fails, the page says so with Try again and shows no old or estimated figure. */
(()=>{"use strict";
const host=document.querySelector("[data-coverage]");if(!host)return;
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const num=n=>n!=null&&Number.isFinite(Number(n))?Number(n).toLocaleString("en-US"):"—";
const when=v=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"}):"never";};
const day=v=>{const d=new Date(String(v||"")+"T12:00:00Z");return v&&!Number.isNaN(d.getTime())?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}):"—";};
const skeleton=host.innerHTML;
const tile=(k,v,note)=>`<div class="card"><dt class="t-label muted">${esc(k)}</dt><dd class="t-title">${esc(v)}</dd>${note?`<dd class="t-label muted">${esc(note)}</dd>`:""}</div>`;
const more=(title,items)=>items.length?`<details class="card"><summary>${esc(title)}</summary><ul class="sp-list">${items.map(x=>`<li>${x}</li>`).join("")}</ul></details>`:"";
function draw(c){
 const e=c.entities||{},f=c.filings||{},b=c.backfill||{},q=c.queue||{},s=c.lastSuccessfulSync||{};
 const quality=(c.quality||[]).filter(x=>x.count);
 host.innerHTML=`<dl class="sp-cov">`+
  tile("SEC filers indexed",num(e.total),num(e.searchableNames)+" searchable names and tickers")+
  tile("Companies",num(e.companies),num(e.listedCompanies)+" on the SEC ticker list · "+num(e.unlistedCompanies)+" without a listed ticker")+
  tile("Reporting owners",num(e.reportingOwners),num(e.persons)+" people · "+num(e.organizations)+" entities, by filed name")+
  tile("Form 4 filings imported",num(f.parsed),num(f.transactions)+" reported lines · "+num(f.failed)+" failed to parse")+
  tile("EDGAR listed, last "+num(b.windowDays)+" days",num(b.listedByEdgar),num(b.indexDaysRead)+" of "+num(b.businessDays)+" business-day indexes read"+(b.earliestDay?" · from "+day(b.earliestDay):""))+
  tile("Imported of those",b.percentImported==null?"—":num(b.imported)+" ("+b.percentImported+"%)",num((q.pending||0)+(q.retry||0)+(q.running||0))+" waiting · "+num(q.failed)+" failed every attempt")+
  `</dl><p class="t-label muted sp-cov__sync">Last successful runs · ticker list: ${esc(when(s["company-directory"]))} · daily index: ${esc(when(s["daily-index"]))} · import queue: ${esc(when(s["ingest-queue"]))} · newest filing imported: ${esc(when(f.newestPublishedAt))}</p>`+
  `<div class="sp-cov__more">`+
  more("Why filings failed to import ("+num(f.failed)+")",(f.failedByReason||[]).map(r=>esc(r.reason)+": <b>"+num(r.n)+"</b>"))+
  more("Data checks with findings ("+quality.length+")",quality.map(x=>esc(x.label)+": <b>"+num(x.count)+"</b>"))+
  more("What is not covered",(c.universe?.notCovered||[]).map(esc))+`</div>`;
}
function load(){
 host.innerHTML=skeleton;
 fetch("/v1/coverage",{headers:{Accept:"application/json"}}).then(r=>r.ok?r.json():Promise.reject(new Error("HTTP "+r.status))).then(draw).catch(()=>{
  host.innerHTML=`<div class="card sp-cov-err"><div class="err"><p>The coverage report didn't load. Nothing is shown rather than an old or estimated figure.</p><button class="btn btn--secondary" type="button">Try again</button></div></div>`;
  host.querySelector("button").addEventListener("click",load);
 });
}
load();
})();
