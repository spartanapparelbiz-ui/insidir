/* The landing page's nav: the link of the section you are reading is marked (aria-current), and the example stocks
   under the search box are remembered like a typed one. */
(()=>{"use strict";
const links=[...document.querySelectorAll(".snav [data-spy]")];
const sections=links.map(a=>document.getElementById(a.dataset.spy)).filter(Boolean);
if(sections.length&&"IntersectionObserver" in window){
 const seen=new Map();
 const mark=id=>{for(const a of links){if(a.dataset.spy===id)a.setAttribute("aria-current","true");else a.removeAttribute("aria-current");}};
 // The section crossing the upper third of the screen is the one being read.
 const io=new IntersectionObserver(es=>{for(const e of es)seen.set(e.target.id,e.isIntersecting);
  const on=sections.filter(s=>seen.get(s.id));mark(on.length?on[on.length-1].id:"");},{rootMargin:"-30% 0px -60% 0px"});
 sections.forEach(s=>io.observe(s));
}
for(const c of document.querySelectorAll("[data-chip]"))c.addEventListener("click",()=>{
 try{localStorage.setItem("insidir:first-ticker",c.dataset.chip)}catch{}
 try{window.posthog?.capture?.("ticker_searched",{ticker:c.dataset.chip,via:"example"})}catch{}
});
})();
