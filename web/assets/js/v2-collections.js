/* Source-backed collection views for companies, filings, and signed-in watchlists. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const kind=document.body.dataset.collection;
if(!["companies","filings","watchlist"].includes(kind))return;
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean=v=>{let t=String(v??"").trim().toUpperCase();return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)?t:"";};
const d=v=>{if(!v)return "—";let x=new Date(v);return Number.isNaN(x.getTime())?"—":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(x)};
/* Filing timestamps are shown on the SEC's calendar day (America/New_York): a Form 4 accepted at 9:30 p.m. ET was filed that day,
   though it is already past midnight UTC. Date-only values (trade and report dates) stay in UTC. */
const filed=v=>{if(!v)return "—";let x=new Date(v);return Number.isNaN(x.getTime())?"—":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"America/New_York"}).format(x)};
const sec=v=>{try{const u=new URL(String(v));return u.protocol==="https:"&&(u.hostname==="sec.gov"||u.hostname==="www.sec.gov")&&!u.username&&!u.password?u.toString():""}catch{return ""}};
const a=(url,label)=>'<a href="'+E(url)+'">'+E(label)+'</a>';
const src=(url,label)=>{const u=sec(url);return u?'<a href="'+E(u)+'" target="_blank" rel="noopener noreferrer">'+E(label)+' ↗</a>':"Source not provided"};
const detail=t=>clean(t)?"company.html?ticker="+encodeURIComponent(clean(t)):"research.html";
/* Every company gets its real logo (entity-media.js, one /v1/media batch per page): by ticker, or by the
   issuer's SEC CIK when no ticker was reported; initials only when no logo exists anywhere. */
const companyLogo=(t,x={})=>window.InsidirMedia?.company({ticker:t,cik:x.issuer_cik,name:x.issuer_name,size:"sm"})||"";
/* Issuer names as people write them ("NVIDIA Corp", not "NVIDIA CORP"), as on the overview (entity-media.js); a bare
   form number reads as a form ("Form 4"). */
const companyName=n=>window.InsidirMedia?.companyName?window.InsidirMedia.companyName(n):String(n||"");
const formLabel=f=>{const t=String(f||"4").trim();return /^form\b/i.test(t)?t:"Form "+t;};
const tbody=$("collection-rows"),more=$("collection-more");
let all=[],offset=0,busy=false,moreAvailable=false,companyDirectoryMode="sec",edgarDown=false;
/* A new search supersedes the one in flight (its requests are cancelled and its answer ignored); "load more" waits. */
let generation=0,inflight=null;
const status=s=>{$("collection-status").textContent=s};
async function request(path,options={}){
 const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},signal:options.signal||inflight?.signal,...options});
 let data;try{data=await r.json()}catch{throw Error("Research service is unavailable")};
 if(!r.ok){let er=Error(data.error||"Request failed");er.status=r.status;throw er;}return data;
}
function render(){
 const html=all.map(x=>{
  const t=clean(x.ticker);
  if(kind==="companies"&&x.entity&&!t){
   // An SEC filer with no ticker on the SEC list: its own record page (entity.html), and why there is no ticker.
   const e=x.entity,why=e.delistedAt?"Left the SEC ticker list":(e.tickers||[]).length?"Formerly "+e.tickers.join(", "):"No listed ticker",url="entity.html?cik="+encodeURIComponent(e.cik);
   return '<tr><td><div class="ins-company-cell">'+companyLogo("",x)+'<span class="ins-company-cell__name">'+E(companyName(e.name))+'<span class="cl-muted"> · CIK '+E(e.cik)+(e.matched?" · "+E(e.matched.as)+": "+E(e.matched.name):"")+'</span></span></div></td><td>'+E(why)+'</td><td>'+(x.published_at?E(filed(x.published_at)):'<span class="cl-muted">No Form 4 imported</span>')+'</td><td>'+a(url,"SEC record ↗")+'</td></tr>';
  }
  if(kind==="companies")return '<tr><td><div class="ins-company-cell">'+companyLogo(t,x)+'<span class="ins-company-cell__name">'+E(companyName(x.issuer_name||x.name)||"SEC-listed issuer")+(x.entity?.matched?'<span class="cl-muted"> · '+E(x.entity.matched.as)+": "+E(x.entity.matched.name)+'</span>':"")+'</span></div></td><td>'+ (t?a(detail(t),t):"Ticker not reported")+'</td><td>'+(x.published_at?E(filed(x.published_at)):'<span class="cl-muted">View SEC records</span>')+'</td><td>'+ (t?a(detail(t),"View research ↗"):"—")+'</td></tr>';
  if(kind==="filings")return '<tr><td><div class="ins-company-cell">'+companyLogo(t,x)+'<div>'+ (t?a(detail(t),t):E(companyName(x.issuer_name)||"Reporting issuer"))+'<span class="cl-muted">'+E(companyName(x.issuer_name))+'</span></div></div></td><td>'+E(formLabel(x.form_type))+(x.is_amendment&&!/\/A$/i.test(String(x.form_type||""))?" · amended":"")+'</td><td>'+E(filed(x.published_at))+'</td><td>'+src(x.source_url,"Original SEC")+'</td></tr>';
  return '<tr><td><div class="ins-company-cell">'+companyLogo(t)+(t?a(detail(t),t):"—")+'</div></td><td>'+E(filed(x.created_at))+'</td><td>'+ (t?a(detail(t),"Research ↗"):"—")+'</td><td><button type="button" class="cl-remove" data-remove="'+E(t)+'" aria-label="Remove '+E(t)+'">Remove</button></td></tr>';
 }).join("");
 const empty=kind==="watchlist"?"No saved tickers yet. Add a symbol above to begin.":kind==="filings"?"No imported filings match this search.":companyDirectoryMode==="sec"&&edgarDown?'Nothing on the SEC ticker list or in imported filings matches, and SEC EDGAR could not be searched just now. Try again shortly.':companyDirectoryMode==="sec"?'No SEC filer matches this search: not on the SEC ticker list, not in imported filings, and not found in EDGAR. Try the ticker, the CIK, or the name as the SEC lists it. <a href="people.html">Search reporting people →</a>':"No matching company in Insidir’s imported SEC records.";
 tbody.innerHTML=html||'<tr><td class="cl-empty" colspan="4">'+empty+'</td></tr>';
 window.InsidirMedia?.hydrate(tbody);
 $("collection-count").textContent=all.length+" "+(kind==="companies"?(all.length===1?"company":"companies"):(all.length===1?"record":"records"));
 more.hidden=!moreAvailable||(kind!=="filings"&&kind!=="companies");
 if(kind==="companies")more.textContent="Load more companies →";
}
async function load(reset=true){
 if(busy&&!reset)return;
 if(reset){generation++;if(inflight)inflight.abort();inflight="AbortController" in window?new AbortController():null;}
 const mine=generation;
 busy=true;more.disabled=true;const q=$("collection-q").value.trim();
 if(reset){all=[];offset=0;tbody.innerHTML='<tr><td colspan="4" class="cl-empty">Loading source-linked records…</td></tr>';}
 try{
  let data;
  if(kind==="companies"){
   if(!q){
    companyDirectoryMode="sec";
    data=await request("/v1/company/directory?limit=50&offset="+offset);
   }else{
    // Search the SEC issuer list, not only the Form 4 filings already imported.
    const [official,imported,filers]=await Promise.allSettled([
      request("/v1/search?q="+encodeURIComponent(q)+"&limit=50&offset="+offset),
      request("/v1/companies?q="+encodeURIComponent(q)),
      // CIKs, former names and SEC filers without a listed ticker (first page only; the ticker list pages on its own).
      offset?Promise.resolve({items:[]}):request("/v1/entities/search?kind=company&limit=30&q="+encodeURIComponent(q))
    ]);
    if(official.status==="fulfilled"){
      companyDirectoryMode="sec";
      const local=imported.status==="fulfilled"&&Array.isArray(imported.value.items)?imported.value.items:[];
      const sameCik=(a,b)=>String(a||"").replace(/^0+/,"")===String(b||"").replace(/^0+/,"");
      data={hasMore:!!official.value.hasMore,items:(official.value.items||[]).map(c=>{
        const match=local.find(x=>clean(x.ticker)===clean(c.ticker)||sameCik(x.issuer_cik,c.cik));
        return {ticker:c.ticker,issuer_name:c.name,issuer_cik:c.cik,published_at:match?.published_at||null};
      })};
      edgarDown=filers.status==='rejected'||filers.value?.state==='source_unavailable';
      const shown=new Set(data.items.map(x=>String(Number(x.issuer_cik))));
      for(const e of filers.status==="fulfilled"?filers.value.items||[]:[]){
        if(shown.has(String(Number(e.cik))))continue;
        shown.add(String(Number(e.cik)));
        data.items.push({ticker:e.listed?(e.tickers||[])[0]||"":"",issuer_name:e.name,issuer_cik:e.cik,published_at:e.lastFilingAt,entity:e});
      }
    }else if(imported.status==="fulfilled"){
      companyDirectoryMode="imported-fallback";
      data={...imported.value,hasMore:false};
    }else throw official.reason;
   }
  }
  if(kind==="filings")data=await request("/v1/filings?limit=40&offset="+offset+(q?"&q="+encodeURIComponent(q):""));
  if(kind==="watchlist")data=await request("/v1/me/watchlist");
  if(mine!==generation)return;
  const records=Array.isArray(data.items)?data.items:[];
  all=reset?records:[...all,...records];
  moreAvailable=kind==="filings"&&records.length===40&&offset<960||kind==="companies"&&companyDirectoryMode==="sec"&&!!data.hasMore;
  offset+=records.length;
  status(kind==="watchlist"?"Your private saved symbols. No broker access or trading permission required.":kind==="companies"?(companyDirectoryMode==="sec"?all.length+" SEC ticker-index entries shown"+(Number.isInteger(data.total)?" of "+data.total:"")+". Open any report for available filings, financials and insider records.":companyDirectoryMode==="imported-fallback"?"Official company index unavailable; showing imported SEC records only.":"Showing imported SEC companies only."):all.length+" imported records shown. All findings should be checked against original SEC sources.");
  render();
 }catch(e){
  if(mine!==generation||e?.name==="AbortError")return;
  moreAvailable=false;
  if(kind==="watchlist"&&e.status===401){
   tbody.innerHTML='<tr><td colspan="4" class="cl-empty">Sign in to view your saved watchlist. <a href="signin.html">Sign in →</a></td></tr>';
   status("Sign in to add and manage saved tickers.");
  }else{
   tbody.innerHTML='<tr><td colspan="4" class="cl-empty">'+E(e.message)+'</td></tr>';
   status("Could not load available records.");
  }
  more.hidden=true;
 }finally{if(mine===generation){busy=false;more.disabled=false;}}
}
/* An up-to-date check is separate from the date of the newest filing (weekends may be quiet). */
async function showFreshness(){
 if(kind!=="companies")return;
 const target=$("collection-freshness");
 if(!target)return;
 try{
   const data=await request("/v1/status");
   const last=data.lastIngest?.finished_at||data.lastIngest?.started_at;
   const file=data.latestFilingPublishedAt;
   const dateTime=v=>{
     const d=new Date(v);
     return Number.isNaN(d.getTime())?null:new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York",timeZoneName:"short"}).format(d);
   };
   const checked=last?dateTime(last):null,latest=file?dateTime(file):null;
   const hours=last?(Date.now()-Date.parse(last))/3600000:Infinity;
   const quality=data.lastIngest?.failed>0?" · Some filings failed to import.":"";
   target.textContent=(checked?(hours>0.5?"Importer check may be stale: ":"SEC feed checked: ")+checked:"SEC feed check timestamp unavailable")+
     (latest?" · Latest imported filing published: "+latest:" · No imported filings yet")+
     ". The latest filing date can predate the most recent check."+quality;
 }catch{target.textContent="SEC importer freshness could not be verified. Filing dates may be older than the last successful check.";}
}
document.addEventListener("DOMContentLoaded",()=>{
 $("collection-form").addEventListener("submit",async e=>{
  e.preventDefault();
  if(kind!=="watchlist"){void load();return;}
  const t=clean($("collection-q").value);
  if(!t){status("Enter a valid stock ticker (e.g. AAPL).");return;}
  try{await request("/v1/me/watchlist",{method:"POST",body:JSON.stringify({ticker:t})});$("collection-q").value="";await load();}
  catch(err){status(err.status===401?"Please sign in to save a ticker.":err.message);}
 });
 tbody.addEventListener("click",async e=>{
  const btn=e.target.closest("button[data-remove]");
  if(!btn)return;
  const t=clean(btn.dataset.remove);
  if(!t)return;
  btn.disabled=true;status("Removing "+t+"…");
  try{await request("/v1/me/watchlist/"+encodeURIComponent(t),{method:"DELETE"});await load();}
  catch(err){status(err.message);btn.disabled=false;}
 });
 more.addEventListener("click",()=>{void load(false)});
 const params=new URLSearchParams(location.search),q=params.get("q");
 if(q&&kind!=="watchlist")$("collection-q").value=q;
 void load();
 void showFreshness();
});
})();
