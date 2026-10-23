/* Design-system behaviour (web/assets/css/ds.css): the nav's background after scroll, tabs with arrow keys, the
   8px fade-up on entry, numbers that count up once, and the search box that opens a stock's page. Nothing loops;
   prefers-reduced-motion turns the motion off. */
(()=>{"use strict";
document.documentElement.classList.add("ds-js");
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const nav=document.querySelector("[data-ds-nav]");
if(nav){const on=()=>nav.classList.toggle("is-scrolled",scrollY>8);on();addEventListener("scroll",on,{passive:true});}

for(const list of document.querySelectorAll("[data-ds-tabs]")){
 const tabs=[...list.querySelectorAll('[role="tab"]')];
 const pick=(t,focus)=>{for(const x of tabs){const on=x===t;x.setAttribute("aria-selected",String(on));x.tabIndex=on?0:-1;const p=document.getElementById(x.getAttribute("aria-controls"));if(p)p.hidden=!on;}if(focus)t.focus();};
 list.addEventListener("click",e=>{const t=e.target.closest('[role="tab"]');if(t)pick(t);});
 list.addEventListener("keydown",e=>{const i=tabs.indexOf(document.activeElement);if(i<0)return;
  const n=e.key==="ArrowRight"?(i+1)%tabs.length:e.key==="ArrowLeft"?(i-1+tabs.length)%tabs.length:e.key==="Home"?0:e.key==="End"?tabs.length-1:-1;
  if(n>=0){e.preventDefault();pick(tabs[n],true);}});
}

const fmt=new Intl.NumberFormat("en-US");
const count=el=>{const to=Number(el.dataset.dsCount);if(!Number.isFinite(to)||reduce)return;const t0=performance.now(),d=900;
 const step=t=>{const k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,3);el.textContent=fmt.format(Math.round(to*e));if(k<1)requestAnimationFrame(step);};requestAnimationFrame(step);};
const seen=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue;e.target.classList.add("is-in");
 for(const n of e.target.matches("[data-ds-count]")?[e.target]:e.target.querySelectorAll("[data-ds-count]"))count(n);seen.unobserve(e.target);}},{rootMargin:"0px 0px -10% 0px"});
for(const el of document.querySelectorAll("[data-ds-reveal],[data-ds-count]"))reduce?el.classList.add("is-in"):seen.observe(el);

// Search: a ticker opens its page (no account needed). The page is prefetched while the symbol is typed, so it opens
// at once; the symbol is remembered for the first screen after paying.
const TICK=/^[A-Z][A-Z0-9.-]{0,9}$/,prefetched=new Set();
const clean=v=>String(v||"").trim().toUpperCase().replace(/^\$/,"");
const prefetch=t=>{if(!TICK.test(t)||prefetched.has(t)||prefetched.size>8)return;prefetched.add(t);const l=document.createElement("link");l.rel="prefetch";l.href="/"+encodeURIComponent(t);l.as="document";document.head.appendChild(l);};
for(const f of document.querySelectorAll("[data-ds-search]")){
 const input=f.querySelector("input");let timer=0;
 // A narrow phone shows the short placeholder, so the examples are never cut off.
 if(input?.dataset.short&&matchMedia("(max-width: 479px)").matches)input.placeholder=input.dataset.short;
 input?.addEventListener("input",()=>{clearTimeout(timer);const t=clean(input.value);if(t.length>=1&&t.length<=5)timer=setTimeout(()=>prefetch(t),250);});
 f.addEventListener("submit",e=>{const t=clean(input?.value);if(!TICK.test(t)){e.preventDefault();input?.focus();return;}
  e.preventDefault();try{localStorage.setItem("insidir:first-ticker",t)}catch{}try{window.posthog?.capture?.("ticker_searched",{ticker:t})}catch{}
  location.href="/"+encodeURIComponent(t);});
}
})();
