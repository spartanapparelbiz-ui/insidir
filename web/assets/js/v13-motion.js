/* Insidir V13 site motion: the way the dotted "insidir" moves, given to the rest of the site.

   The landing wordmark is a field of dots that part around the pointer, spring back home and ripple
   when you click. This file gives the page itself the same physics, with the very same numbers
   (window.InsidirHalftone.PHYSICS):
     - small free-standing elements ("atoms": navigation links, buttons, chips, index numbers,
       arrows, logos and portraits, footer links) part around the pointer like dots and spring home;
       the element under the pointer holds still, so whatever you aim at stays put to be clicked;
     - a click on empty page sends one shock ring out from that point, through the atoms and through
       every dot field on the page (the hero wordmark included), exactly like a click on the word;
     - hover transitions elsewhere settle on the same spring (--hf-spring in v13-halftone.css).
   Text, numbers, tables, inputs and anything that forms a ruled grid never move.

   An atom moves only by a few pixels: the dots' push is scaled by ATOM_SCALE so the furthest an atom
   is pushed is about 7px. Offsets are written to --hf-dx / --hf-dy, which v13-halftone.css adds to the
   element's `translate`, so they compose with any transform the page already uses and cost no layout.
   It sleeps when nothing moves, runs only for atoms on screen, and stays completely still under
   prefers-reduced-motion. Touch screens get the click ring but no hover push. */
(() => {
  "use strict";

  const P = (window.InsidirHalftone && window.InsidirHalftone.PHYSICS) ||
    { push: 2.6, spring: 0.05, damping: 0.84, ringSpeed: 0.9, ringBand: 26, ringForce: 3.2, ringLife: 900 };
  const RADIUS = 120;        // px around the pointer that atoms feel
  const ATOM_SCALE = 0.14;   // dots are pushed up to ~52px; atoms up to ~7px
  const RING_SCALE = 0.3;    // a ring nudges an atom by about 4px as it passes
  const FRAME = 1000 / 60;   // the physics is defined per 60 fps frame

  /* What moves by default. Pages can opt in with [data-hf-atom] and out with [data-hf-still]. */
  const ATOMS = [
    "[data-hf-atom]",
    // brand and navigation
    ".v6-logo", ".v13-logo", ".app-header .logo", ".v6-nav__links a", ".v6-signin", ".app-nav a", ".user-menu__btn", ".app-header__bell",
    // buttons and chips
    ".v9-btn", ".btn", ".auth-btn", ".cx-btn", ".rd-toggle", ".rd-filters button", ".cx-ranges button", ".v10-follow-btn", ".hwf-up",
    // links that stand alone, arrows and markers
    ".rd-link", ".v13-link", ".mk-link", ".pw-link", ".auth-switch a", ".rd-shortcuts__name b", ".rd-row > b", ".mk-index a span:last-child",
    // index numbers and step markers
    ".rd-index", ".mk-num", ".lp-step__num", ".lp-tool__num", ".lp-tool__icon", ".auth-index li > span", ".pw-list li > span",
    // identity tiles outside tables
    ".ins-media", ".cx-logo",
    // footer
    ".hwf-col a"
  ].join(",");
  // Never moved: anything a reader is reading or typing into, and rows of ruled grids.
  const STILL = "[data-hf-still],table,thead,tbody,tr,td,th,input,textarea,select,label,p,h1,h2,h3,h4,.rd-kpis,.rd-status,.rd-co,.rd-largest,.rd-dchart,.rd-tip,[hidden]";

  const mq = q => window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} };
  const reducedQ = mq("(prefers-reduced-motion: reduce)");
  const fineQ = mq("(hover: hover) and (pointer: fine)");

  let atoms = [];            // { el, l, t, r, b, cx, cy, fixed, x, y, vx, vy }
  const known = new WeakMap();
  let px = -1e5, py = -1e5, pcx = -1e5, pcy = -1e5, inside = false;
  let rings = [];            // { x, y, t } in page coordinates
  let raf = 0, awake = false;

  /* An atom inside a fixed or sticky bar keeps its viewport position while the page scrolls. */
  function pinned(el) {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === "fixed" || pos === "sticky") return true;
    }
    return false;
  }
  function stillInside(el) {
    const s = el.parentElement && el.parentElement.closest(STILL);
    return !!s || el.matches("[data-hf-still]");
  }

  function collect() {
    const found = [];
    for (const el of document.querySelectorAll(ATOMS)) {
      if (!el.matches("[data-hf-atom]") && stillInside(el)) continue;
      let a = known.get(el);
      if (!a) {
        a = { el, x: 0, y: 0, vx: 0, vy: 0 }; known.set(el, a);
        // translate does not apply to inline boxes; those become inline-block (v13-halftone.css).
        el.setAttribute("data-hf-atom", getComputedStyle(el).display === "inline" ? "inline" : "");
      }
      found.push(a);
    }
    // Atoms that left the page settle instantly.
    for (const a of atoms) if (!found.includes(a)) { a.x = a.y = a.vx = a.vy = 0; write(a, true); }
    atoms = found;
    measure();
  }

  /* Home positions: the element's box with its own offset taken out, in page coordinates
     (viewport coordinates for atoms in fixed or sticky bars). */
  function measure() {
    const sx = window.scrollX, sy = window.scrollY;
    for (const a of atoms) {
      const r = a.el.getBoundingClientRect();
      a.fixed = pinned(a.el);
      const ox = a.fixed ? 0 : sx, oy = a.fixed ? 0 : sy;
      a.l = r.left - a.x + ox; a.t = r.top - a.y + oy; a.r = r.right - a.x + ox; a.b = r.bottom - a.y + oy;
      a.cx = (a.l + a.r) / 2; a.cy = (a.t + a.b) / 2;
      a.visible = r.width > 0 && r.height > 0;
    }
  }

  function write(a, force) {
    const x = Math.abs(a.x) < 0.05 ? 0 : a.x, y = Math.abs(a.y) < 0.05 ? 0 : a.y;
    if (!force && x === a.wx && y === a.wy) return;
    a.wx = x; a.wy = y;
    if (x === 0 && y === 0) { a.el.style.removeProperty("--hf-dx"); a.el.style.removeProperty("--hf-dy"); }
    else { a.el.style.setProperty("--hf-dx", x.toFixed(2) + "px"); a.el.style.setProperty("--hf-dy", y.toFixed(2) + "px"); }
  }

  let last = 0;
  function frame(now) {
    raf = 0;
    if (reducedQ.matches) { for (const a of atoms) { a.x = a.y = a.vx = a.vy = 0; write(a); } awake = false; return; }
    // Advance in whole 60 fps steps so the feel is the same at any refresh rate.
    const steps = last ? Math.max(1, Math.min(4, Math.round((now - last) / FRAME))) : 1;
    last = now;
    const sx = window.scrollX, sy = window.scrollY, vw = window.innerWidth, vh = window.innerHeight;
    const push = inside && fineQ.matches;
    rings = rings.filter(g => now - g.t < P.ringLife);
    let moving = false;
    for (const a of atoms) {
      if (!a.visible) continue;
      const ox = a.fixed ? 0 : sx, oy = a.fixed ? 0 : sy;
      // Off screen and at rest: skip.
      const onScreen = a.b - oy > -RADIUS && a.t - oy < vh + RADIUS && a.r - ox > -RADIUS && a.l - ox < vw + RADIUS;
      if (!onScreen && a.x === 0 && a.y === 0 && a.vx === 0 && a.vy === 0) continue;
      const qx = a.fixed ? pcx : px, qy = a.fixed ? pcy : py;
      for (let s = 0; s < steps; s++) {
        let fx = 0, fy = 0;
        if (push) {
          // Distance from the pointer to the atom's box: zero inside it, so the atom you aim at holds still.
          const ex = Math.max(a.l - qx, 0, qx - a.r), ey = Math.max(a.t - qy, 0, qy - a.b), d = Math.hypot(ex, ey);
          if (d > 0 && d < RADIUS) {
            const ux = a.cx - qx, uy = a.cy - qy, L = Math.hypot(ux, uy) || 1, f = (1 - d / RADIUS) * P.push * ATOM_SCALE;
            fx += (ux / L) * f; fy += (uy / L) * f;
          }
        }
        for (const g of rings) {
          const age = now - g.t, R = age * P.ringSpeed;
          const gx = a.fixed ? g.x - sx : g.x, gy = a.fixed ? g.y - sy : g.y;
          const dx = a.cx - gx, dy = a.cy - gy, dist = Math.hypot(dx, dy) + 0.001;
          const band = 1 - Math.min(1, Math.abs(dist - R) / P.ringBand);
          if (band > 0) { const f = band * P.ringForce * (1 - age / P.ringLife) * RING_SCALE; fx += (dx / dist) * f; fy += (dy / dist) * f; }
        }
        a.vx = (a.vx + fx - a.x * P.spring) * P.damping;
        a.vy = (a.vy + fy - a.y * P.spring) * P.damping;
        a.x += a.vx; a.y += a.vy;
      }
      if (Math.abs(a.vx) + Math.abs(a.vy) < 0.01 && Math.abs(a.x) + Math.abs(a.y) < 0.05) { a.x = a.y = a.vx = a.vy = 0; }
      else moving = true;
      write(a);
    }
    awake = moving || rings.length > 0;
    if (awake) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function wake() { if (!raf && !reducedQ.matches) { awake = true; raf = requestAnimationFrame(frame); } }

  /* ---------- input ---------- */
  const CONTROL = "a,button,input,select,textarea,label,summary,[role=button],[role=tab],[tabindex],[contenteditable]";
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    pcx = e.clientX; pcy = e.clientY; px = pcx + window.scrollX; py = pcy + window.scrollY; inside = true; wake();
  }
  function onLeave(e) { if (!e.relatedTarget) { inside = false; px = py = pcx = pcy = -1e5; wake(); } }
  function onDown(e) {
    if (reducedQ.matches || e.button > 0) return;
    if (e.target && e.target.closest && e.target.closest(CONTROL)) return;
    rings.push({ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, t: performance.now() });
    if (rings.length > 4) rings.shift();
    // The same ring runs through every dot field on the page; the field that was clicked already started it.
    for (const root of document.querySelectorAll("[data-halftone-hero],[data-halftone-footer],[data-halftone-field]")) {
      if (root.__halftone && root !== e.__hfRingFrom && typeof root.__halftone.ring === "function") root.__halftone.ring(e.clientX, e.clientY);
    }
    wake();
  }

  /* ---------- lifecycle ---------- */
  let pending = 0;
  function refresh() { clearTimeout(pending); pending = setTimeout(() => { collect(); wake(); }, 120); }
  function start() {
    collect();
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("resize", () => { measure(); wake(); }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(() => { measure(); }).observe(document.body);
    // Rows rendered after load (dashboard modules, menus) join or leave the set.
    if (window.MutationObserver) new MutationObserver(muts => { if (muts.some(m => m.type === "childList" || m.attributeName === "hidden")) refresh(); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); });
    reducedQ.addEventListener && reducedQ.addEventListener("change", () => { for (const a of atoms) { a.x = a.y = a.vx = a.vy = 0; write(a, true); } wake(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.InsidirMotion = Object.freeze({ PHYSICS: P, RADIUS, ATOM_SCALE, RING_SCALE, refresh, get count() { return atoms.length; } });
})();
