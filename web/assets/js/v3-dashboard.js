/* Insidir dashboard V3 — current SEC disclosures + user-owned research. No synthetic records or market metrics. */
(() => {"use strict";
const $=id=>document.getElementById(id);
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const tick=x=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(x||"").toUpperCase())?String(x).toUpperCase():"";
const date=x=>{const d=new Date(x);return x&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported"};
const money=x=>x===undefined||x===null||x===""||!Number.isFinite(Number(x))?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(x));
const source=v=>{try{const u=new URL(String(v));return u.protocol==="https:"&&["www.sec.gov","sec.gov"].includes(u.hostname)&&!u.username&&!u.password?u.toString():"";}catch{return ""}};
const research=t=>tick(t)?"research.html?ticker="+encodeURIComponent(tick(t)):"research.html";
const srcLink=v=>{const u=source(v);return u?'<a href="'+E(u)+'" target="_blank" rel="noopener noreferrer">SEC source ↗</a>':"Not available"};
async function api(path){const r=await fetch(path,{credentials:"same-origin",headers:{Accept:"application/json"}});let j;try{j=await r.json()}catch{throw Error("Research service unavailable")};if(!r.ok){let e=Error(j?.error||"Request failed");e.status=r.status;throw e;}return j;}
let trades=[],filter="all";
const formatCategory=c=>c==="reported_purchase"?"Purchase":c==="reported_sale"?"Sale":"Other Form 4";
function renderTrades(){
 const items=trades.filter(x=>filter==="all"||x.category===filter).slice(0,14);
 $("v3-trades").innerHTML=items.length?items.map(x=>{const t=tick(x.ticker);return '<tr><td>'+E(x.owner_name||"Reporting person")+'</td><td>'+(t?'<a href="'+E(research(t))+'">'+E(t)+'</a>':"—")+'</td><td>'+E(date(x.transaction_date))+'</td><td><span class="v3-category'+(x.category==="reported_purchase"?" v3-category--buy":x.category==="reported_sale"?" v3-category--sell":"")+'">'+formatCategory(x.category)+'</span></td><td>'+E(money(x.estimated_value))+'</td></tr>'}).join(""):'<tr><td colspan="5" class="v3-empty">No matching imported Form 4 transactions. This is not a statement about all market activity.</td></tr>';
}
async function loadTrades(){try{const j=await api("/v1/transactions?limit=60");trades=Array.isArray(j.items)?j.items:[];renderTrades();}catch(e){$("v3-trades").innerHTML='<tr><td colspan="5" class="v3-empty">'+E(e.message)+'</td></tr>';}}
async function loadFilings(){
 try{const j=await api("/v1/filings?limit=15");const arr=Array.isArray(j.items)?j.items:[];
 $("v3-filings").innerHTML=arr.length?arr.slice(0,10).map(x=>{const t=tick(x.ticker);return '<tr><td><a href="'+E(research(t))+'">'+E(x.issuer_name||t||"Issuer")+'</a><span class="v3-table__sub">'+E(t)+'</span></td><td>'+E(x.form_type||"4")+'</td><td>'+E(date(x.published_at))+'</td><td>'+srcLink(x.source_url)+'</td></tr>'}).join(""):'<tr><td colspan="4" class="v3-empty">No imported SEC filings are available yet. Browse company research for other disclosures.</td></tr>';
 $("v3-coverage").textContent=arr.length+" recently imported filing"+(arr.length===1?"":"s")+" loaded. This is not the full SEC dataset.";
 }catch(e){$("v3-filings").innerHTML='<tr><td colspan="4" class="v3-empty">'+E(e.message)+'</td></tr>';}
}
async function loadWatchlist(){
 try{const j=await api("/v1/me/watchlist");const arr=Array.isArray(j.items)?j.items:[];
 $("v3-watchlist").innerHTML=arr.length?arr.slice(0,9).map(x=>'<a class="v3-row" href="'+E(research(x.ticker))+'"><strong>'+E(x.ticker)+'</strong><span>Explore disclosures</span><b>↗</b></a>').join(""):'<p class="v3-empty">No saved tickers. <a href="watchlist.html">Add the companies you follow →</a></p>';
 }catch(e){$("v3-watchlist").innerHTML=e.status===401?'<p class="v3-empty">Your watchlist appears here after sign-in. <a href="signin.html">Sign in →</a></p>':'<p class="v3-empty">'+E(e.message)+'</p>';}
}
async function loadNotes(){
 try{const j=await api("/v1/me/research-decisions");const arr=Array.isArray(j.items)?j.items:[];
 $("v3-notes").innerHTML=arr.length?arr.slice(0,6).map(x=>'<a class="v3-row" href="'+E(research(x.ticker))+'"><strong>'+E(x.ticker)+'</strong><span>'+E(x.review_status||"Research")+' · '+E(date(x.updated_at))+'</span><b>↗</b></a>').join(""):'<p class="v3-empty">Your private research notes will appear here. <a href="research.html">Investigate a ticker →</a></p>';
 }catch(e){$("v3-notes").innerHTML=e.status===401?'<p class="v3-empty">Sign in to view your private notes.</p>':'<p class="v3-empty">'+E(e.message)+'</p>';}
}
document.addEventListener("DOMContentLoaded",()=>{
 const h=new Date().getHours(),g=document.querySelector("[data-greeting]");if(g)g.textContent=h<12&&h>=5?"Good morning.":h>=12&&h<18?"Good afternoon.":"Good evening.";
 $("v3-current-date").textContent=new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date())+" · SOURCE-LINKED DATA";
 const form=$("v3-search"),input=$("v3-ticker");
 form?.addEventListener("submit",e=>{let t=tick(input.value.trim());if(!t){e.preventDefault();input.setCustomValidity("Enter a valid stock ticker");input.reportValidity();return;}input.value=t;});
 input?.addEventListener("input",()=>input.setCustomValidity(""));
 document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderTrades();}));
 void Promise.allSettled([loadTrades(),loadFilings(),loadWatchlist(),loadNotes()]);
});
})();
