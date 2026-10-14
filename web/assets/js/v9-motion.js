/* Insidir landing page: the hero wordmark's fit, and a quiet scroll reveal. This script loads no data.

   Fit: the halftone engine (v13-halftone.js) fits the word to the hero's width and sinks its baseline
   below the hero's bottom edge by a share of its cap height, the crop. Here the crop is chosen so the
   visible band fills exactly the room left under the copy (the hero minus its inner block, whose bottom
   padding is the least gap), between 0.22 and 0.40: on a short first screen more of the word drops below
   the edge instead of below the fold. The engine exposes its options and relayout(); this observer is
   created before the engine's (this file runs first), so on a resize it sets the crop just before the
   engine lays the dots out again, and only lays out itself when the copy alone changed size.

   Reveal: sections that start below the first screen wait 20px low with their hairline rule undrawn and
   settle as they scroll in (see v13-home.css). Nothing is ever hidden: without JavaScript, without
   IntersectionObserver, or under prefers-reduced-motion nothing is marked pending and the page is simply
   in place. Anything already scrolled past (a jump to the footer, a restored scroll position) is
   released at once. */
(() => {
  "use strict";
  const hero = document.querySelector("[data-halftone-hero]");
  const inner = hero && hero.querySelector(".v13-hero__inner");
  if (!hero || !inner || !("ResizeObserver" in window)) return;
  const MIN = 0.22, MAX = 0.4;

  // The word's cap height at the hero's width, measured the way the engine sets it.
  const capHeight = (o, width) => {
    const engine = window.InsidirHalftone, m = document.createElement("canvas").getContext("2d");
    if (!m || !engine || typeof engine.fitSize !== "function") return 0;
    const word = o.wordmark || " ";
    if ("letterSpacing" in m) m.letterSpacing = o.letterSpacing;
    m.font = o.fontWeight + " 100px " + o.fontFamily;
    const size = engine.fitSize(m.measureText(word).width, width * 1.02);
    m.font = o.fontWeight + " " + size + "px " + o.fontFamily;
    return m.measureText(word).actualBoundingBoxAscent || size * 0.72;
  };

  const fit = layout => {
    const api = hero.__halftone;
    if (!api || !api.options || typeof api.relayout !== "function") return;
    const box = hero.getBoundingClientRect();
    const room = box.bottom - inner.getBoundingClientRect().bottom;
    const cap = capHeight(api.options, Math.max(1, Math.round(box.width)));
    if (!(cap > 0)) return;
    const crop = Math.round(Math.min(MAX, Math.max(MIN, 1 - room / cap)) * 1000) / 1000;
    if (Math.abs(crop - api.options.crop) < 0.002) return;
    api.options.crop = crop;
    if (layout) api.relayout();
  };

  // When the hero itself resized, the engine's own observer (notified after this one) lays out.
  new ResizeObserver(entries => fit(!entries.some(e => e.target === hero))).observe(hero);
  new ResizeObserver(() => fit(true)).observe(inner);
  const start = () => {
    fit(true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fit(true), () => {});
  };
  if (hero.__halftone) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
  window.addEventListener("load", () => fit(true), { once: true });
})();

(() => {
  "use strict";
  const motion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  if (!("IntersectionObserver" in window) || !motion || motion.matches) return;

  const nodes = [...document.querySelectorAll("[data-v9-reveal]")];
  if (!nodes.length) return;

  // Stagger the items inside each section a beat apart.
  for (const node of nodes) {
    node.querySelectorAll(".lp-step,.lp-rule,.lp-source").forEach((item, i) => item.style.setProperty("--lp-i", String(Math.min(i, 6))));
  }

  const pending = new Set();
  const release = node => { if (pending.delete(node)) node.classList.remove("lp-pending"); };
  const releaseAll = () => { for (const node of [...pending]) release(node); };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { release(entry.target); observer.unobserve(entry.target); }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });

  for (const node of nodes) {
    if (node.getBoundingClientRect().top > window.innerHeight * 0.94) {
      node.classList.add("lp-pending");
      pending.add(node);
      observer.observe(node);
    }
  }

  // A jump past a section never intersects it, so release everything at or above the viewport's bottom.
  let queued = false;
  const sweep = () => {
    queued = false;
    const limit = window.innerHeight * 0.94;
    for (const node of [...pending]) if (node.getBoundingClientRect().top < limit) { release(node); observer.unobserve(node); }
    if (!pending.size) window.removeEventListener("scroll", onScroll);
  };
  const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(sweep); } };
  window.addEventListener("scroll", onScroll, { passive: true });

  // Turning on reduced motion mid-visit, or printing, puts everything in place.
  const settle = () => { releaseAll(); observer.disconnect(); window.removeEventListener("scroll", onScroll); };
  if (motion.addEventListener) motion.addEventListener("change", e => { if (e.matches) settle(); });
  window.addEventListener("beforeprint", settle);
})();
