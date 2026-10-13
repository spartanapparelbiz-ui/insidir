/* Insidir public experience: fast, accessible navigation and real imported SEC records. */
(() => {"use strict";
const menu=document.getElementById("v6-menu"),button=document.getElementById("v6-menu-button");
function setMenu(open){if(!button||!menu)return;menu.hidden=!open;button.setAttribute("aria-expanded",String(open));button.setAttribute("aria-label",open?"Close navigation":"Open navigation");}
button?.addEventListener("click",()=>setMenu(menu.hidden));
menu?.addEventListener("click",e=>{if(e.target.closest("a"))setMenu(false);});
document.addEventListener("keydown",e=>{if(e.key==="Escape")setMenu(false);});
document.addEventListener("click",e=>{if(menu&&!menu.hidden&&!menu.contains(e.target)&&!button.contains(e.target))setMenu(false);});
const host=document.getElementById("v6-live-records");
if(!host)return;
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ticker=x=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(x||"").toUpperCase())?String(x).toUpperCase():"";
const when=x=>{const d=new Date(x);return x&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(d):"Not reported"};
fetch("/v1/filings?limit=6",{credentials:"same-origin",headers:{Accept:"application/json"}})
.then(async r=>{if(!r.ok)throw Error("Feed unavailable");return r.json()})
.then(data=>{
 const items=Array.isArray(data.items)?data.items.slice(0,6):[];
 if(!items.length){host.innerHTML='<p class="v6-live__empty">No recent imported records available yet. <a href="filings.html">Explore the filing library ↗</a></p>';return;}
 host.innerHTML=items.map(item=>{const t=ticker(item.ticker),href=t?"research.html?ticker="+encodeURIComponent(t):"filings.html";
  return '<a class="v6-live__row" href="'+esc(href)+'"><span class="v6-live__form">'+esc(item.form_type||"SEC")+'</span><span class="v6-live__issuer">'+(window.InsidirMedia?.logo(t,"sm")||"")+'<span class="v10-live-name"><strong>'+esc(item.issuer_name||t||"Reported issuer")+'</strong><small>'+esc(t||"SEC disclosure")+'</small></span></span><span class="v6-live__date-label">Published</span><span class="v6-live__date">'+esc(when(item.published_at))+'</span><span class="v6-live__arrow">↗</span></a>';
 }).join("");
 window.InsidirMedia?.hydrate(host);
}).catch(()=>{host.innerHTML='<p class="v6-live__empty">Recent filings are temporarily unavailable. <a href="filings.html">Open the filing library ↗</a></p>';});
})();