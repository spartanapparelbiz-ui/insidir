/* Landing page extras on top of motion.js:
   - marks image cards as "settled" once their reveal zoom finishes so hover zooms respond instantly
   - a gentle pointer drift on the hero photograph (desktop pointers only) */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* lazily loaded photographs fade in once decoded instead of popping in */
  document.documentElement.classList.add("lp-img-fade");
  document.querySelectorAll(".band__layer img, .dark-band__layer img, .cta__img, .media img").forEach(img => {
    const done = () => img.classList.add("is-loaded");
    if (img.complete && img.naturalWidth) done();
    else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
  });

  document.addEventListener("transitionend", e => {
    if (e.propertyName !== "transform" || !e.target.matches || !e.target.matches(".media img")) return;
    const host = e.target.closest("[data-reveal]");
    if (host && host.classList.contains("is-in")) host.classList.add("is-settled");
  });

  /* keyboard focus can jump to a card that has not scrolled into view yet: show it at once */
  document.addEventListener("focusin", e => {
    for (let n = e.target; n && n !== document.body; n = n.parentElement) {
      if (n.matches("[data-reveal]:not(.is-in),[data-split]:not(.is-in)")) n.classList.add("is-in");
    }
  });

  const hero = document.querySelector(".hero");
  const drift = hero && hero.querySelector(".hero__drift");
  if (!hero || !drift || reduce || !finePointer) return;

  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const step = () => {
    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;
    drift.style.transform = `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0) scale(1.03)`;
    raf = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ? requestAnimationFrame(step) : 0;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
  drift.style.transition = "none";
  drift.style.transform = "scale(1.03)";
  hero.addEventListener("pointermove", e => {
    const r = hero.getBoundingClientRect();
    tx = -((e.clientX - r.left) / r.width - 0.5) * 22;
    ty = -((e.clientY - r.top) / r.height - 0.5) * 14;
    kick();
  });
  hero.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
})();
