/* SEC-backed company overview; never fabricates price charts or advice. */
(() => {
"use strict";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const symbol=v=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(v||"").toUpperCase())?String(v).toUpperCase():"";
const date=v=>{if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d);};
const money=v=>v==null||!Number.isFinite(Number(v))?"Not reported":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",notation:"compact",maximumFractionDigits:2}).format(Number(v));
const src=v=>{try{const u=new URL(String(v));return u.protocol==="https:"&&(u.hostname==="www.sec.gov"||u.hostname==="sec.gov")&&!u.username&&!u.password?u.toString():"";}catch{return ""}};
const link=(v,label)=>{let u=src(v);return u?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':"Source unavailable";};
const text=(id,v)=>{const x=$(id);if(x)x.textContent=v;};
async function get(url,options={}){const r=await fetch(url,{credentials:"same-origin",headers:{Accept:"application/json",...(options.body?{"Content-Type":"application/json"}:{})},...options});let data;try{data=await r.json()}catch{throw Error("The research service did not return data")};if(!r.ok){const e=Error(data.error||"Research temporarily unavailable");e.status=r.status;throw e;}return data;}
let current="";
async function load(raw){
 const t=symbol(raw);
 if(!t){text("cv-status","Enter a valid stock ticker. No broker connection is required.");return;}
 current=t;
 history.replaceState(null,"","company.html?ticker="+encodeURIComponent(t));
 text("cv-bread-ticker",t);const identity=window.InsidirMedia;
 $("cv-symbol").textContent="";$("cv-symbol").innerHTML=identity?.logo(t,"lg")||"";identity?.hydrate($("cv-symbol"));
 text("cv-name",t);
 text("cv-details","Loading official company records…");text("cv-status","Connecting SEC filings, XBRL facts, and reported Form 4 transactions…");
 text("cv-filing-count","—");text("cv-fact-count","—");text("cv-transaction-count","—");
 $("cv-follow").hidden=false;
 $("cv-research").href="research.html?ticker="+encodeURIComponent(t);
 const batch=await Promise.allSettled([
   get("/v1/intelligence?ticker="+encodeURIComponent(t)),
   get("/v1/transactions?ticker="+encodeURIComponent(t)+"&limit=50"),
   get("/v1/filings?ticker="+encodeURIComponent(t)+"&limit=50")
 ]);
 if(current!==t)return;
 const [intel,transactions,imported]=batch;
 if(intel.status==="fulfilled"){
  const data=intel.value,company=data.company||{};
  text("cv-name",company.name||t);
  text("cv-details",t+" · SEC CIK "+(company.cik||"not available")+" · Official company record");
  text("cv-description",data.brief?.summary||"Official filings and reported fundamentals are available for review.");
  text("cv-filing-count",String(data.filings?.length||0));
  text("cv-fact-count",String(data.facts?.length||0));
  const facts=Array.isArray(data.facts)?data.facts:[];
  $("cv-facts-grid").innerHTML=facts.length?facts.map(f=>'<div class="cv-fact"><span>'+esc(f.label||f.id)+'</span><strong>'+esc(money(f.value))+'</strong><small>Period '+esc(f.start?date(f.start)+" – ":"")+esc(date(f.periodEnd))+' · '+esc(f.form||"SEC filing")+'</small><small>Filed '+esc(date(f.filedAt))+'</small>'+link(f.sourceUrl,"Verify original")+'</div>').join(""):'<p class="cv-empty">Financial facts were not returned for this ticker.</p>';
  const fs=Array.isArray(data.filings)?data.filings:[];
  $("cv-filings-list").innerHTML=fs.length?fs.map(f=>'<tr><td><strong>'+esc(f.form||"—")+'</strong></td><td>'+esc(f.headline||"SEC disclosure")+'</td><td>'+esc(date(f.filedAt))+'</td><td>'+link(f.sourceUrl,"SEC filing")+'</td></tr>').join(""):'<tr><td class="cv-empty" colspan="4">No selected official company filings were returned.</td></tr>';
  text("cv-status","Official SEC research loaded. Sources and reporting periods are shown for independent review.");
 }else{
  text("cv-description","Additional SEC company submissions and financial facts are unavailable: "+intel.reason.message+". Imported Form 4 evidence may still appear below.");
  $("cv-facts-grid").innerHTML='<p class="cv-empty">Financial facts unavailable right now. Try the full Research Desk or SEC EDGAR directly.</p>';
  $("cv-filings-list").innerHTML='<tr><td class="cv-empty" colspan="4">Official company filing intelligence unavailable. Imported Form 4 records may still be accessible below.</td></tr>';
  text("cv-status","SEC company facts could not be loaded. Other research endpoints may remain available.");
 }
 if(transactions.status==="fulfilled"){
  const arr=Array.isArray(transactions.value.items)?transactions.value.items:[];
  text("cv-transaction-count",String(arr.length));
  $("cv-transactions-list").innerHTML=arr.length?arr.slice(0,30).map(v=>{
   const kind=v.category==="reported_purchase"?"Reported purchase":v.category==="reported_sale"?"Reported sale":"Other ownership transaction";
   return '<tr><td><div class="ins-person-cell">'+(identity?.portrait(v.owner_name,t,"sm")||"")+'<span class="ins-person-cell__name">'+esc(v.owner_name||"Reporting person")+'</span></div></td><td>'+esc(kind)+'</td><td>'+esc(date(v.transaction_date))+'</td><td>'+esc(date(v.published_at))+'</td><td>'+esc(money(v.estimated_value))+'</td></tr>';
  }).join(""):'<tr><td colspan="5" class="cv-empty">No imported Form 4 transactions for this stock in the current dataset.</td></tr>';
  identity?.hydrate($("cv-transactions-list"));
 }else $("cv-transactions-list").innerHTML='<tr><td colspan="5" class="cv-empty">'+esc(transactions.reason.message)+'</td></tr>';
 if(intel.status!=="fulfilled"&&imported.status==="fulfilled"){
  const fs=Array.isArray(imported.value.items)?imported.value.items:[];
  $("cv-filings-list").innerHTML=fs.length?fs.slice(0,30).map(f=>'<tr><td>'+esc(f.form_type||"4")+'</td><td>'+esc(f.issuer_name||t)+'</td><td>'+esc(date(f.published_at))+'</td><td>'+link(f.source_url,"SEC source")+'</td></tr>').join(""):'<tr><td colspan="4" class="cv-empty">No imported filings for this symbol.</td></tr>';
  text("cv-filing-count",String(fs.length));
 }
}
document.addEventListener("DOMContentLoaded",()=>{
 const initial=symbol(new URLSearchParams(location.search).get("ticker"));
 const form=$("cv-search"),input=$("cv-ticker");
 if(initial){input.value=initial;void load(initial);}
 form.addEventListener("submit",e=>{e.preventDefault();const t=symbol(input.value.trim());if(!t){input.setCustomValidity("Enter a valid ticker");input.reportValidity();return;}input.setCustomValidity("");void load(t);});
 input.addEventListener("input",()=>input.setCustomValidity(""));
 $("cv-follow").addEventListener("click",async()=>{
  if(!current)return;
  const b=$("cv-follow");b.disabled=true;
  try{await get("/v1/me/watchlist",{method:"POST",body:JSON.stringify({ticker:current})});b.textContent="Saved to watchlist ✓";}
  catch(e){b.textContent=e.status===401?"Sign in to save":"Could not save — try again";if(e.status===401)b.onclick=()=>location.href="signin.html";}
  finally{b.disabled=false;}
 });
});
})();
