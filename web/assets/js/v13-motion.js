/* Insidir site motion: calm content, live dots.

   The page's content holds still. Nothing a reader aims at, reads or compares moves under the pointer, on a
   click or with a scroll: hover states change colour, borders and underlines, never position or size. The
   dots are the exception, and they answer everything: every halftone dot field on the site (the landing
   wordmark, the page bands, the heroes, the footer strip, the 404, the overview's brief corner) parts hard
   around the pointer, sweeps after it, opens wider under a press and rings out on every click or tap
   (v13-halftone.js). Only canvas dots move; this layer moves nothing.

   What remains here is a quiet scroll reveal on the public pages. A block marked data-hf-reveal (or each child
   of a data-hf-reveal-group, and the footer's columns) that is below the fold when the page loads waits
   transparent and a few pixels low (.hf-pending) and fades up into place once as it scrolls in
   (.hf-revealing, v13-halftone.css: opacity and a short ease-out, no spring, no overshoot); blocks arriving
   together go a short beat apart. The product's own pages (body.app-body or body.v6-app: the dashboard,
   reports, research, filings, people, portfolio) never hold anything back: their content is simply there. Content already on screen, or added on
   screen later, is never hidden; nothing waits under prefers-reduced-motion, without IntersectionObserver or
   when printing; a jump past a block (a link to the footer, a restored scroll position) shows it at once. */
(() => {
  "use strict";

  const mq = q => window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} };
  const reducedQ = mq("(prefers-reduced-motion: reduce)");
  // The product's pages carry app-body (dashboard, company, people…) or v6-app (research, portfolio).
  const productPage = !!(document.body && document.body.classList && ["app-body", "v6-app"].some(c => document.body.classList.contains(c)));

  const REVEAL = "[data-hf-reveal],[data-hf-reveal-group]>*,footer .hwf-top>*";
  const REVEAL_MS = 620;     // the fade's own length (v13-halftone.css), after the block's beat
  const BEAT_MS = 60, BEATS = 4;
  const seen = new WeakSet(), waiting = new Set();
  let revealIO = null, settledAll = productPage;

  function release(el, i) {
    if (!waiting.delete(el)) return;
    if (revealIO) revealIO.unobserve(el);
    const beat = Math.min(i || 0, BEATS);
    el.style.setProperty("--hf-i", String(beat));
    el.classList.add("hf-revealing");
    el.classList.remove("hf-pending");
    setTimeout(() => { el.classList.remove("hf-revealing"); el.style.removeProperty("--hf-i"); }, REVEAL_MS + beat * BEAT_MS);
  }
  // Shown in place at once: the block's own transitions are held off for two frames (an inline !important
  // outranks every stylesheet), so nothing fades in from the waiting state.
  function releaseNow(el) {
    if (!waiting.delete(el)) return;
    if (revealIO) revealIO.unobserve(el);
    el.style.setProperty("transition", "none", "important");
    el.classList.remove("hf-pending", "hf-revealing");
    requestAnimationFrame(() => requestAnimationFrame(() => el.style.removeProperty("transition")));
  }
  function revealAll() { settledAll = true; for (const el of [...waiting]) releaseNow(el); }
  function scanReveal() {
    if (settledAll || reducedQ.matches || !("IntersectionObserver" in window)) return;
    if (!revealIO) revealIO = new IntersectionObserver(entries => {
      const inView = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
      inView.forEach((e, i) => release(e.target, i));
    }, { rootMargin: "0px 0px -7% 0px", threshold: 0 });
    const limit = window.innerHeight * 0.92;
    // How far the page can still scroll: a block that could never reach `limit` is never held back.
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    for (const el of document.querySelectorAll(REVEAL)) {
      if (seen.has(el)) continue;
      if (el.matches(".hf-no-reveal,[data-hf-still]")) { seen.add(el); continue; }
      // Inside something hidden, or not laid out yet (a closed tab, an empty panel): looked at again on a
      // later scan, once it is shown.
      if (el.closest("[hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      seen.add(el);
      if (r.top < limit) continue;                  // on screen (or above it): never hidden
      if (r.top + window.scrollY - maxY > window.innerHeight * 0.88) continue; // the page cannot scroll it into view
      el.classList.add("hf-pending");
      waiting.add(el);
      revealIO.observe(el);
    }
  }
  // A jump past pending blocks never intersects them: show everything at or above the viewport's bottom.
  // Blocks jumped right past (now above the viewport) are simply shown; those in view fade up a beat apart.
  function sweepReveal() {
    if (!waiting.size) return;
    const limit = window.innerHeight * 0.93;
    const bottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    const due = [];
    for (const el of [...waiting]) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0) releaseNow(el);
      else if (bottom || r.top < limit) due.push([el, r]);
    }
    due.sort((a, b) => a[1].top - b[1].top || a[1].left - b[1].left).forEach(([el], i) => release(el, i));
  }

  /* ---------- lifecycle ---------- */
  let pending = 0, sweepT = 0, lastY = NaN, ticking = false;
  function refresh() { clearTimeout(pending); pending = setTimeout(scanReveal, 120); }
  function onScroll() {
    if (!waiting.size || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      // Ordinary scrolling reveals through the IntersectionObserver; the sweep is for jumps (most of a
      // screen in one frame) and runs again once the scroll has settled.
      const y = window.scrollY;
      if (lastY === lastY && Math.abs(y - lastY) > window.innerHeight * 0.6) sweepReveal();
      lastY = y;
      clearTimeout(sweepT); sweepT = setTimeout(sweepReveal, 150);
    });
  }
  function start() {
    if (settledAll) return;
    scanReveal();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("beforeprint", revealAll);
    // Focus that lands inside a waiting block (a script focusing a card it just added) shows it at once.
    document.addEventListener("focusin", e => { const b = e.target && e.target.closest && e.target.closest(".hf-pending"); if (b) release(b, 0); });
    // Blocks rendered after load join the set. Tooltips and one-line status messages rewrite themselves
    // constantly and hold no reveal blocks: their changes do not trigger a rescan.
    const QUIET = "[role=tooltip],.sr-only,p[aria-live],p[role=status]";
    const quiet = m => { const n = m.target.nodeType === 1 ? m.target : m.target.parentElement; return !!(n && n.closest && n.closest(QUIET)); };
    if (window.MutationObserver) new MutationObserver(muts => { if (muts.some(m => (m.type === "childList" || m.attributeName === "hidden") && !quiet(m))) refresh(); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    reducedQ.addEventListener && reducedQ.addEventListener("change", () => { if (reducedQ.matches) revealAll(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  /* revealAll(): show every pending block now and stop holding new ones back (printing, tests, tools that
     measure the page). */
  window.InsidirMotion = Object.freeze({ refresh, revealAll, REVEAL_MS,
    get pending() { return waiting.size; } });
})();
