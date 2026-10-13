/* Insidir public site: real source preview, progressive enhancements, no simulated statistics. */
(() => {
"use strict";
const menu=document.getElementById("is3-mobile"),toggle=document.getElementById("is3-toggle");
if(toggle&&menu){
  const set=open=>{menu.hidden=!open;toggle.setAttribute("aria-expanded",String(open));toggle.setAttribute("aria-label",open?"Close menu":"Open menu");};
  toggle.addEventListener("click",()=>set(menu.hidden));
  menu.addEventListener("click",e=>{if(e.target.closest("a"))set(false);});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!menu.hidden){set(false);toggle.focus();}});
  document.addEventListener("click",e=>{if(!menu.hidden&&!menu.contains(e.target)&&!toggle.contains(e.target))set(false);});
}
const host=document.getElementById("is3-live-filings");
if(host){
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const date=value=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",timeZone:"UTC"}).format(d):"Not reported"};
  const ticker=s=>/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(s||"").toUpperCase())?String(s).toUpperCase():"";
  fetch("/v1/filings?limit=6",{headers:{Accept:"application/json"},credentials:"same-origin"})
    .then(async r=>{if(!r.ok)throw Error("Unavailable");return r.json()})
    .then(data=>{
      const items=Array.isArray(data.items)?data.items.slice(0,6):[];
      const hero=document.getElementById("v5-hero-latest");
      if(hero){
        const first=items[0];
        if(first){
          const t=ticker(first.ticker),label=esc(first.issuer_name||t||"Public issuer");
          hero.innerHTML='<strong>'+label+'</strong><small>'+(t?esc(t)+' · ':'')+'Form '+esc(first.form_type||"4")+' · Published '+esc(date(first.published_at))+'</small>';
        }else hero.textContent="No imported filings available in this window.";
      }
      host.innerHTML=items.length?items.map(x=>{
        const t=ticker(x.ticker),href=t?"research.html?ticker="+encodeURIComponent(t):"filings.html";
        return '<a class="is3-window__row" href="'+esc(href)+'"><span>'+esc(t||x.form_type||"SEC")+'</span><span class="v5-preview-identity">'+(window.InsidirMedia?.logo(t,"sm")||"")+'<strong>'+esc(x.issuer_name||"SEC ownership filing")+'</strong></span><span>'+esc(date(x.published_at))+'</span></a>';
      }).join(""):'<p class="is3-window__loading">No filings have been imported yet. Explore public-company research instead.</p>';
      window.InsidirMedia?.hydrate(host);
    }).catch(()=>{const hero=document.getElementById("v5-hero-latest");if(hero)hero.textContent="Latest filing preview temporarily unavailable.";host.innerHTML='<p class="is3-window__loading">Recent filing feed is temporarily unavailable. <a href="filings.html">Open the filing library →</a></p>';});
}
if("IntersectionObserver" in window&&!matchMedia("(prefers-reduced-motion: reduce)").matches){
  const targets=document.querySelectorAll(".is3-section-head,.is3-capability,.is3-detail__document,.is3-sources__grid,.is3-plan,.is3-faq__items");
  const io=new IntersectionObserver(entries=>{
    entries.forEach(x=>{if(x.isIntersecting){x.target.removeAttribute("data-hidden");io.unobserve(x.target);}});
  },{rootMargin:"0px 0px -8% 0px",threshold:.05});
  targets.forEach(x=>{x.classList.add("is3-reveal");const box=x.getBoundingClientRect();if(box.top>window.innerHeight*.94){x.dataset.hidden="true";io.observe(x);}});
  // Avoid blank content if observers are interrupted by tab changes or back-forward navigation.
  window.addEventListener("pageshow",()=>{for(const el of targets){if(el.getBoundingClientRect().top<innerHeight){el.removeAttribute("data-hidden");}}});
}
})();
