/* Insidir landing page: the hero wordmark's fit. This script loads no data.

   Fit: the halftone engine (v13-halftone.js) fits the word to the hero's width and sinks its baseline
   below the hero's bottom edge by a share of its cap height, the crop. Here the crop is chosen so the
   visible band fills exactly the room left under the copy (the hero minus its inner block, whose bottom
   padding is the least gap), between 0.22 and 0.40: on a short first screen more of the word drops below
   the edge instead of below the fold. The engine exposes its options and relayout(); this observer is
   created before the engine's (this file runs first), so on a resize it sets the crop just before the
   engine lays the dots out again, and only lays out itself when the copy alone changed size.

   The scroll reveal that used to live here is now the site's own (v13-motion.js): the landing marks its
   blocks with data-hf-reveal / data-hf-reveal-group and v13-home.css only adds the section rules that
   draw across as each head arrives. */
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

