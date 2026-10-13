/* Tiny progressive reveal: never blocks content if JS, motion, or observer are unavailable. */
(() => {
 "use strict";
 if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
 const nodes = [...document.querySelectorAll("[data-v9-reveal]")];
 const observer = new IntersectionObserver((entries) => {
   for (const item of entries) if (item.isIntersecting) {
     item.target.classList.remove("v9-reveal-pending");
     observer.unobserve(item.target);
   }
 },{rootMargin:"0px 0px 35px 0px",threshold:.02});
 for(const node of nodes){
   if(node.getBoundingClientRect().top > innerHeight*.9){
     node.classList.add("v9-reveal-pending");
     document.body.classList.add("v9-motion-on");
     observer.observe(node);
   }
 }
})();
