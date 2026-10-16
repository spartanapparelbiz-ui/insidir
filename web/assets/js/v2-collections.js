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
const tbody=$("collection-rows"),more=$("collection-more");
let all=[],offset=0,busy=false,moreAvailable=false;
const status=s=>{$("collection-status").textContent=s};
async function request(path,options={}){
 const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},...options});
 let data;try{data=await r.json()}catch{throw Error("Research service is unavailable")};
 if(!r.ok){let er=Error(data.error||"Request failed");er.status=r.status;throw er;}return data;
}
function render(){
 const html=all.map(x=>{
  const t=clean(x.ticker);
  if(kind==="companies")return '<tr><td><div class="ins-company-cell">'+companyLogo(t,x)+'<span class="ins-company-cell__name">'+E(x.issuer_name||"Reported issuer")+'</span></div></td><td>'+ (t?a(detail(t),t):"Ticker not reported")+'</td><td>'+E(filed(x.published_at))+'</td><td>'+ (t?a(detail(t),"View research ↗"):"—")+'</td></tr>';
  if(kind==="filings")return '<tr><td><div class="ins-company-cell">'+companyLogo(t,x)+'<div>'+ (t?a(detail(t),t):E(x.issuer_name||"Reporting issuer"))+'<span class="cl-muted">'+E(x.issuer_name||"")+'</span></div></div></td><td>'+E(x.form_type||"Form 4")+(x.is_amendment?" · amended":"")+'</td><td>'+E(filed(x.published_at))+'</td><td>'+src(x.source_url,"Original SEC")+'</td></tr>';
  return '<tr><td><div class="ins-company-cell">'+companyLogo(t)+(t?a(detail(t),t):"—")+'</div></td><td>'+E(filed(x.created_at))+'</td><td>'+ (t?a(detail(t),"Research ↗"):"—")+'</td><td><button type="button" class="cl-remove" data-remove="'+E(t)+'" aria-label="Remove '+E(t)+'">Remove</button></td></tr>';
 }).join("");
 const empty=kind==="watchlist"?"No saved tickers yet. Add a symbol above to begin.":kind==="filings"?"No imported filings match this search.": "No companies match this search in the imported dataset.";
 tbody.innerHTML=html||'<tr><td class="cl-empty" colspan="4">'+empty+'</td></tr>';
 window.InsidirMedia?.hydrate(tbody);
 $("collection-count").textContent=all.length+" "+(all.length===1?"record":"records");
 more.hidden=!moreAvailable||kind!=="filings";
}
async function load(reset=true){
 if(busy)return;
 busy=true;more.disabled=true;const q=$("collection-q").value.trim();
 if(reset){all=[];offset=0;tbody.innerHTML='<tr><td colspan="4" class="cl-empty">Loading source-linked records…</td></tr>';}
 try{
  let data;
  if(kind==="companies")data=await request("/v1/companies"+(q?"?q="+encodeURIComponent(q):""));
  if(kind==="filings")data=await request("/v1/filings?limit=40&offset="+offset+(q?"&q="+encodeURIComponent(q):""));
  if(kind==="watchlist")data=await request("/v1/me/watchlist");
  const records=Array.isArray(data.items)?data.items:[];
  all=reset?records:[...all,...records];
  moreAvailable=kind==="filings"&&records.length===40&&offset<960;
  offset+=records.length;
  status(kind==="watchlist"?"Your private saved symbols. No broker access or trading permission required.":all.length+" imported records shown. All findings should be checked against original SEC sources.");
  render();
 }catch(e){
  moreAvailable=false;
  if(kind==="watchlist"&&e.status===401){
   tbody.innerHTML='<tr><td colspan="4" class="cl-empty">Sign in to view your saved watchlist. <a href="signin.html">Sign in →</a></td></tr>';
   status("Sign in to add and manage saved tickers.");
  }else{
   tbody.innerHTML='<tr><td colspan="4" class="cl-empty">'+E(e.message)+'</td></tr>';
   status("Could not load available records.");
  }
  more.hidden=true;
 }finally{busy=false;more.disabled=false;}
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
});
})();
