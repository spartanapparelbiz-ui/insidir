/* Companies (explore.html, the shell's "Connections" item): a directory of public companies, opening each one's stock
   page with its insiders, filings and connections.
   - No search: the SEC's official ticker list, A–Z, 50 at a time (GET /v1/company/directory). If that list can't be
     reached, the companies Insidir has imported filings for (GET /v1/companies).
   - Search (?q= in the address too): the ticker list (GET /v1/search, paged), merged with the imported filings for the
     date of each company's latest one (GET /v1/companies?q=), and SEC filers found by CIK, former name or with no listed
     ticker (GET /v1/entities/search?kind=company, first page), which open their SEC record (entity.html?cik=).
   - The footer says when the importer last checked SEC EDGAR (GET /v1/status). */
(()=>{"use strict";
const UI=window.InsidirUI;if(!UI)return;
const {api,fmt,esc,logo,hydrateLogos,enter}=UI;
const $=s=>document.querySelector(s);
const form=$("[data-ex-form]"),qIn=$("#ex-q"),clearBtn=$("[data-ex-clear]"),list=$("[data-ex-list]"),more=$("[data-ex-more]"),msgEl=$("[data-ex-msg]"),countEl=$("[data-ex-count]");
const clean=v=>{const t=String(v??"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)?t:"";};
const bare=c=>String(c??"").replace(/^0+/,"")||"0";
const sameCik=(a,b)=>a!=null&&b!=null&&bare(a)===bare(b);
const say=t=>{msgEl.textContent=t||"";};
const cap=s=>String(s||"").charAt(0).toUpperCase()+String(s||"").slice(1);
const DAY=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"});
const WHEN=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York",timeZoneName:"short"});
const at=(f,v)=>{const d=new Date(v);return v&&!Number.isNaN(d.getTime())?f.format(d):"";};
let items=[],offset=0,hasMore=false,total=null,mode="sec",edgarDown=false,gen=0,busy=false,shown=0,query="";

function skeleton(){list.setAttribute("aria-busy","true");list.innerHTML=Array.from({length:4},()=>`<li class="row ex"><span class="skel" style="width:32px;height:32px;border-radius:9px"></span><span class="skel" style="width:56%;height:16px"></span><span class="skel" style="width:96px;height:14px;justify-self:end"></span><span></span></li>`).join("");}
function row(x){
 const t=clean(x.ticker),e=x.entity,matched=e?.matched;
 const name=fmt.company(e&&!t?e.name:x.name)||(t?t:"SEC filer");
 let href,sub;
 if(t){href="/company.html?ticker="+encodeURIComponent(t);sub=[t,matched?cap(matched.as)+": "+fmt.company(matched.name):""];}
 else{
  // An SEC filer with no ticker on the SEC list: its own record, and why there is no ticker.
  const why=e?.delistedAt?"Left the SEC ticker list":(e?.tickers||[]).length?"Formerly "+e.tickers.join(", "):"No listed ticker";
  href="/entity.html?cik="+encodeURIComponent(e?.cik||x.cik);sub=["CIK "+bare(e?.cik||x.cik),why,matched?cap(matched.as)+": "+fmt.company(matched.name):""];
 }
 const last=x.last?"Latest insider filing "+at(DAY,x.last):"";
 return `<li class="row ex"><a class="hit" href="${esc(href)}" aria-label="${esc(name+(t?", "+t:""))}"></a>
 ${logo(t,32,name)}
 <span class="ex__co lx-two"><span class="strong">${esc(name)}</span><span class="t-label muted">${esc(sub.filter(Boolean).join(" · "))}</span></span>
 <span class="ex__last t-label muted">${esc(last)}</span>
 ${t?`<a class="btn btn--ghost btn--icon row__link ex__conn" href="/company.html?ticker=${encodeURIComponent(t)}#connections" aria-label="${esc(t)} connections" title="Connections">${UI.icon("waypoints")}</a>`:`<span class="lx-go" aria-hidden="true">${UI.icon("chevron-right")}</span>`}</li>`;
}
function emptyState(){
 if(mode==="imported")return `<h3>No matching company</h3><p>Nothing in the filings Insidir has read matches “${esc(query)}”.</p>`;
 if(!query)return `<h3>No companies to show</h3><p>The SEC's ticker list came back empty. Try again shortly.</p>`;
 if(edgarDown)return `<h3>No match yet</h3><p>Nothing on the SEC ticker list or in imported filings matches “${esc(query)}”, and SEC EDGAR couldn't be searched just now. Try again shortly.</p>`;
 return `<h3>No SEC filer matches “${esc(query)}”</h3><p>It isn't on the SEC ticker list, in the filings Insidir has read, or in EDGAR. Try the ticker, the CIK, or the name as the SEC lists it. Looking for a person? Search insiders with ⌘K.</p><a class="btn btn--secondary" href="/people.html?q=${encodeURIComponent(query)}">Search people</a>`;
}
function draw(){
 list.removeAttribute("aria-busy");
 const n=items.length;
 countEl.textContent=mode==="sec"&&!query&&total>0?total.toLocaleString("en-US")+" companies on the SEC's ticker list"
  :n?(n.toLocaleString("en-US")+(hasMore?"+":"")+(n===1?" match":" matches")+(query?" for “"+query+"”":"")):" ";
 more.hidden=!hasMore;
 if(!n){list.innerHTML=`<li class="empty" style="padding:16px 0">${emptyState()}</li>`;return;}
 list.innerHTML=items.map(row).join("");
 hydrateLogos(list);enter([...list.querySelectorAll(".ex")].slice(shown));shown=n;
}

async function browse(){
 try{
  const d=await api("/v1/company/directory?limit=50&offset="+offset);
  mode="sec";total=Number.isInteger(d.total)?d.total:null;hasMore=!!d.hasMore;
  return (d.items||[]).map(c=>({ticker:c.ticker,name:c.name,cik:c.cik}));
 }catch(e){
  if(offset||e.status===401||e.status===402)throw e;
  // The SEC list is unreachable: the companies with filings Insidir has read.
  const d=await api("/v1/companies");mode="imported";hasMore=false;
  say("The SEC's company list couldn't be reached just now, so this shows the companies with filings Insidir has read.");
  return (d.items||[]).map(x=>({ticker:x.ticker,name:x.issuer_name,cik:x.issuer_cik,last:x.published_at})).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"en"));
 }
}
async function search(q){
 const [official,imported,filers]=await Promise.allSettled([
  api("/v1/search?q="+encodeURIComponent(q)+"&limit=50&offset="+offset),
  api("/v1/companies?q="+encodeURIComponent(q)),
  // CIKs, former names and SEC filers without a listed ticker (first page only; the ticker list pages on its own).
  offset?Promise.resolve({items:[]}):api("/v1/entities/search?kind=company&limit=30&q="+encodeURIComponent(q))]);
 for(const r of [official,imported,filers])if(r.status==="rejected"&&(r.reason?.status===401||r.reason?.status===402))throw r.reason;
 const local=imported.status==="fulfilled"&&Array.isArray(imported.value.items)?imported.value.items:[];
 if(official.status==="fulfilled"){
  mode="sec";hasMore=!!official.value.hasMore;
  const out=(official.value.items||[]).map(c=>{const m=local.find(x=>clean(x.ticker)===clean(c.ticker)||sameCik(x.issuer_cik,c.cik));
   return {ticker:c.ticker,name:c.name,cik:c.cik,last:m?.published_at||null};});
  if(!offset){
   edgarDown=filers.status==="rejected"||filers.value?.state==="source_unavailable";
   const seen=new Set([...items,...out].map(x=>bare(x.cik)));
   for(const e of filers.status==="fulfilled"?filers.value.items||[]:[]){
    if(seen.has(bare(e.cik)))continue;seen.add(bare(e.cik));
    out.push({ticker:e.listed?(e.tickers||[])[0]||"":"",name:e.name,cik:e.cik,last:e.lastFilingAt,entity:e});
   }
  }
  return out;
 }
 if(imported.status==="fulfilled"){
  mode="imported";hasMore=false;
  say("The SEC's company list couldn't be searched just now, so these are matches from the filings Insidir has read.");
  return local.map(x=>({ticker:x.ticker,name:x.issuer_name,cik:x.issuer_cik,last:x.published_at}));
 }
 throw official.reason;
}
async function load(fresh=true){
 if(!fresh&&busy)return;
 const my=fresh?++gen:gen;busy=true;more.querySelector("button").disabled=true;
 if(fresh){items=[];offset=0;shown=0;total=null;edgarDown=false;say("");skeleton();}
 const q=query;
 try{
  const got=q?await search(q):await browse();
  if(my!==gen)return;
  items=items.concat(got);offset+=mode==="sec"?(q?got.filter(x=>!x.entity).length:got.length):got.length;draw();
 }catch(e){
  if(my!==gen||e?.status===401||e?.status===402)return;
  if(fresh){list.removeAttribute("aria-busy");countEl.textContent=" ";more.hidden=true;
   list.innerHTML=`<li class="err"><p>${q?"The search didn't finish.":"The company list didn't load."}</p><button class="btn btn--secondary" type="button">Try again</button></li>`;list.querySelector("button").addEventListener("click",()=>load());}
  else say("More companies didn't load. Try again.");
 }finally{if(my===gen){busy=false;more.querySelector("button").disabled=false;}}
}
function sync(){
 history.replaceState(null,"",location.pathname+(query?"?q="+encodeURIComponent(query):""));
 clearBtn.hidden=!query;
}

/* An up-to-date check is separate from the date of the newest filing (weekends may be quiet). */
async function freshness(){
 const el=$("[data-ex-fresh]");
 try{
  const d=await api("/v1/status");
  const last=d.lastIngest?.finished_at||d.lastIngest?.started_at,checked=at(WHEN,last),latest=at(WHEN,d.latestFilingPublishedAt);
  const stale=last&&(Date.now()-Date.parse(last))/36e5>0.5;
  el.textContent=(checked?(stale?"Insidir last checked SEC EDGAR "+checked+".":"SEC EDGAR checked "+checked+"."):"")+
   (latest?" Latest imported filing published "+latest+".":" No filings imported yet.")+
   (d.lastIngest?.failed>0?" Some filings in the last check didn't import.":"");
 }catch{el.textContent="When Insidir last checked SEC EDGAR couldn't be confirmed.";}
}

form.addEventListener("submit",e=>{e.preventDefault();query=qIn.value.trim().slice(0,80);sync();load();});
clearBtn.addEventListener("click",()=>{qIn.value="";query="";sync();load();qIn.focus();});
more.querySelector("button").addEventListener("click",()=>load(false));

query=String(new URLSearchParams(location.search).get("q")||"").trim().slice(0,80);
qIn.value=query;sync();load();freshness();
})();
