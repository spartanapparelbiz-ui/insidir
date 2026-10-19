/* The Insidir mark as a component (window.InsidirMark): the ten circles of web/assets/icons/favicon.svg, in its
   order and at its coordinates, never rearranged (test/intelligence-instrument.test.mjs compares them). Used at
   every scale on intelligence.html: the instrument in the hero, research progress, loading indicators, section
   markers and empty states. Dots are filled with the identity's ink token; nothing glows.

   InsidirMark.svg({ size, title, lit, className, interactive, ids })
     size: CSS height in px (width follows the mark's proportions); lit: ids to draw at full ink, others dimmed
     (omit for a plain mark); interactive: dots become keyboard-focusable buttons with data-dot ids.
   InsidirMark.loader(size, label)  a mark whose dots light in their own order: a loading state.
   InsidirMark.progress(el, n)      light the first n dots of a mark rendered with progress:true. */
(() => {
  "use strict";
  if (window.InsidirMark) return;
  // [cx, cy, r] exactly as in favicon.svg, and the layer of intelligence each dot opens.
  const DOTS = Object.freeze([
    { id: "companies", c: [416, 390, 53] },
    { id: "filings", c: [512, 390, 53] },
    { id: "insiders", c: [608, 390, 53] },
    { id: "purchases", c: [512, 486, 53] },
    { id: "sales", c: [512, 582, 53] },
    { id: "changes", c: [512, 678, 53] },
    { id: "watchlist", c: [416, 774, 53] },
    { id: "people", c: [512, 774, 53] },
    { id: "holdings", c: [608, 774, 53] },
    { id: "findings", c: [512, 194, 67] }
  ]);
  // Reading order for sequences (loaders, progress): the tittle first, then down the letter.
  const ORDER = Object.freeze([9, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const VIEW = "343 107 338 740";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function svg({ size = 24, title = "", lit = null, className = "", interactive = false, labels = {}, progress = false } = {}) {
    const w = Math.round(size * 338 / 740 * 100) / 100;
    const dots = DOTS.map((d, i) => {
      const [cx, cy, r] = d.c, step = ORDER.indexOf(i);
      const on = !lit || lit.includes(d.id);
      const a = interactive ? ' role="button" tabindex="0" aria-label="' + esc(labels[d.id] || d.id) + '"' : "";
      return '<g class="im-dot' + (on ? " is-lit" : "") + '" data-dot="' + d.id + '" style="--s:' + step + '"' + a + ">" +
        (interactive ? '<circle class="im-ring" cx="' + cx + '" cy="' + cy + '" r="' + (r + 22) + '"/>' : "") +
        '<circle class="im-core" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/></g>';
    }).join("");
    return '<svg class="im ' + esc(className) + (progress ? " im--progress" : "") + '" viewBox="' + VIEW + '" width="' + w + '" height="' + size + '"' +
      (title ? ' role="img" aria-label="' + esc(title) + '"' : ' aria-hidden="true" focusable="false"') + ">" + dots + "</svg>";
  }
  const loader = (size = 28, label = "Loading") => '<span class="im-loader" role="status">' + svg({ size, className: "im--loader" }) + '<span class="sr-only">' + esc(label) + "</span></span>";
  function progress(el, n) {
    const root = el && (el.matches(".im") ? el : el.querySelector(".im"));
    if (!root) return;
    root.querySelectorAll(".im-dot").forEach(g => g.classList.toggle("is-lit", Number(g.style.getPropertyValue("--s")) < n));
  }
  window.InsidirMark = Object.freeze({ DOTS, ORDER, VIEW, svg, loader, progress });
})();
