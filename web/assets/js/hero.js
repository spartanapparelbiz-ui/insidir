/* The landing hero (src/landing.mjs): the live headline and the printer.
   Headline: every 6 seconds the next notable trade is typed in, letter by letter (opacity only; every line is already
   in the page, so nothing moves). Printer: the top receipt prints when the printer comes into view, and every 30 seconds
   a filing newer than the top receipt is printed on top of the pile. A tap lifts a receipt on phones.
   prefers-reduced-motion: the first headline stays and receipts appear without printing. */
(()=>{"use strict";
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

const h=document.querySelector("[data-hx-live]"),lines=h?[...h.querySelectorAll(".hx__line")]:[];
if(!reduce&&lines.length>1){
 const split=el=>{if(el.dataset.split)return;const t=el.textContent;el.textContent="";for(const c of t){const s=document.createElement("span");s.className="hx__ch";s.textContent=c;el.append(s);}el.dataset.split="1";};
 let i=0,typing=0;
 const type=el=>{split(el);const cs=[...el.children];for(const c of cs)c.classList.remove("is-on");let n=0;clearTimeout(typing);
  const step=()=>{if(n<cs.length){cs[n++].classList.add("is-on");typing=setTimeout(step,28);}};step();};
 setInterval(()=>{if(document.hidden)return;const cur=lines[i];i=(i+1)%lines.length;const next=lines[i];
  cur.setAttribute("aria-hidden","true");next.removeAttribute("aria-hidden");type(next);},6000);
}

const feed=document.querySelector("[data-prn]"),prn=feed?.closest(".prn");
if(feed){
 if(reduce||!("IntersectionObserver" in window))prn.classList.add("is-on");
 else{const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){prn.classList.add("is-on");io.disconnect();}},{threshold:.35});io.observe(prn);}
 feed.addEventListener("click",e=>{const rc=e.target.closest(".rc");if(rc&&!e.target.closest("a"))rc.classList.toggle("is-lifted");});
 const poll=async()=>{if(document.hidden)return;try{const r=await fetch("/v1/live",{headers:{Accept:"application/json"}});if(!r.ok)return;
  const d=await r.json(),top=feed.querySelector(".rc")?.dataset.id,item=(d.items||[])[0];
  if(!item||!item.receipt||item.id===top||feed.querySelector(`[data-id="${CSS.escape(item.id)}"]`))return;
  const box=document.createElement("div");box.innerHTML=item.receipt.trim();const rc=box.firstElementChild;
  if(reduce)rc.classList.remove("rc--print");
  for(const old of feed.querySelectorAll(".rc--print"))old.classList.remove("rc--print");
  feed.prepend(rc);while(feed.children.length>3)feed.lastElementChild.remove();}catch{}};
 setInterval(poll,30000);
}
})();
