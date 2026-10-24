/* The v2 public pages: the sticky "Start for $1" bar on phones once
   the hero has scrolled away, and the live filing strip (new rows from /v1/live slide in; nothing loops). */
(()=>{"use strict";
// Sticky bar on phones, after the hero.
const bar=document.querySelector("[data-v2-sticky]"),hero=document.querySelector("[data-v2-hero]");
if(bar&&hero&&"IntersectionObserver" in window){new IntersectionObserver(([e])=>bar.classList.toggle("is-on",!e.isIntersecting),{threshold:0}).observe(hero);}
// Live strip: new filings slide in at the top, once a minute while the page is visible.
const strip=document.querySelector("[data-v2-live]");
if(strip){
 const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
 const agoText=iso=>{const m=Math.max(1,Math.round((Date.now()-Date.parse(iso))/60000));if(m<60)return m+" min ago";const h=Math.round(m/60);return h<24?h+(h===1?" hour ago":" hours ago"):Math.round(h/24)+" days ago";};
 const refreshTimes=()=>{for(const t of strip.querySelectorAll("time[datetime]"))t.textContent=agoText(t.getAttribute("datetime"));};
 const poll=async()=>{if(document.hidden)return;try{const r=await fetch("/v1/live",{headers:{Accept:"application/json"}});if(!r.ok)return;const d=await r.json();
  const have=new Set([...strip.querySelectorAll("[data-id]")].map(x=>x.dataset.id));
  for(const row of (d.items||[]).slice().reverse()){if(have.has(row.id))continue;
   const li=document.createElement("li");li.dataset.id=row.id;li.className="v2-live__row"+(reduce?"":" is-new");li.innerHTML=row.html;strip.prepend(li);
   while(strip.children.length>8)strip.lastElementChild.remove();}
  refreshTimes();}catch{}};
 setInterval(poll,60000);setInterval(refreshTimes,30000);
}
})();
