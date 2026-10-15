/* Insidir landing page: the hero wordmark's fit. This script loads no data.

   Fit: the halftone engine (v13-halftone.js) sets the word so its ink spans the page grid exactly (data-fit-to on
   the hero: from the logo's left edge to the container's right edge) and sinks its baseline below the hero's bottom
   edge by a share of its cap height, the crop. Here the crop is chosen so the visible band fills exactly the room
   left under the copy (the hero minus its inner block, whose bottom padding is the least gap), between 0.22 and
   0.40: on a short first screen more of the word drops below the edge instead of below the fold. The cap height is
   measured with the engine's own InsidirHalftone.wordFit, so this sum and the drawing always agree.

   Dot density: a phone-width hero (600px or less) prints the word on a 4px grid instead of 6px, so its small
   letters keep enough rows of dots to read (the 's' stays an 's'). The engine reads options.dotGap at every
   layout, so this survives rotation and resizing.

   The engine exposes its options and relayout(); this observer is created before the engine's (this file runs
   first), so on a resize it sets the crop and the dot gap just before the engine lays the dots out again, and only
   lays out itself when the copy alone changed size.

   The scroll reveal that used to live here is now the site's own (v13-motion.js): the landing marks its blocks with
   data-hf-reveal / data-hf-reveal-group. */
(() => {
  "use strict";
  const hero = document.querySelector("[data-halftone-hero]");
  const inner = hero && hero.querySelector(".v13-hero__inner");
  if (!hero || !inner || !("ResizeObserver" in window)) return;
  const MIN = 0.22, MAX = 0.4, PHONE = 600;
  const measure = document.createElement("canvas").getContext("2d");

  // The word's cap height at the hero's width, measured the way the engine sets it.
  const capHeight = (o, width) => {
    const engine = window.InsidirHalftone;
    if (!measure || !engine || typeof engine.wordFit !== "function") return 0;
    let ref = null;
    if (o.fitTo) { try { ref = hero.querySelector(o.fitTo); } catch (e) { ref = null; } }
    const grid = ref ? ref.getBoundingClientRect().width : 0;
    return grid > 0 ? engine.wordFit(o, measure, grid).cap : engine.wordFit(Object.assign({}, o, { fitTo: "" }), measure, width * 1.02).cap;
  };

  const fit = layout => {
    const api = hero.__halftone;
    if (!api || !api.options || typeof api.relayout !== "function") return;
    const box = hero.getBoundingClientRect();
    let changed = false;
    const gap = box.width <= PHONE ? 4 : 6;
    if (api.options.dotGap !== gap) { api.options.dotGap = gap; changed = true; }
    const room = box.bottom - inner.getBoundingClientRect().bottom;
    const cap = capHeight(api.options, Math.max(1, Math.round(box.width)));
    if (cap > 0) {
      const crop = Math.round(Math.min(MAX, Math.max(MIN, 1 - room / cap)) * 1000) / 1000;
      if (Math.abs(crop - api.options.crop) >= 0.002) { api.options.crop = crop; changed = true; }
    }
    if (changed && layout) api.relayout();
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
