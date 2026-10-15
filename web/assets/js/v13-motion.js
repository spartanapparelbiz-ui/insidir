/* Insidir V13 site motion: the way the dotted "insidir" moves, given to the rest of the site.

   The landing wordmark is a field of dots that part around the pointer, spring back home and ripple
   when you click. This file gives the page itself the same physics, with the very same numbers
   (window.InsidirHalftone.PHYSICS):
     - small free-standing elements ("atoms": navigation links, buttons, chips, index numbers,
       arrows, logos and portraits, footer links) part around the pointer like dots and spring home;
       the element under the pointer holds still, so whatever you aim at stays put to be clicked;
     - a click on empty page sends one shock ring out from that point, through the atoms and through
       every dot field on the page (the hero wordmark included), exactly like a click on the word;
     - an atom pops a little when the pointer reaches it and gives when it is pressed, on the same spring;
     - scrolling leaves dots (and, on the public pages, atoms) a few pixels behind (PHYSICS.scroll), and they
       spring back when the page stops, so the page itself feels hung on the dots' springs;
     - blocks marked data-hf-reveal (or every child of a data-hf-reveal-group) wait a little low and
       transparent below the fold and rise into place on the spring as they scroll in, a beat apart;
     - hover transitions elsewhere settle on the same spring (--hf-spring in v13-halftone.css).
   Text, numbers, tables, inputs and anything that forms a ruled grid never move under the pointer.

   An atom moves only by a few pixels: the dots' push is scaled by ATOM_SCALE so the furthest an atom
   is pushed is about 9px. Offsets are written to --hf-dx / --hf-dy and the pop to --hf-s, which
   v13-halftone.css adds to the element's `translate` and `scale`, so they compose with any transform the
   page already uses and cost no layout. It sleeps when nothing moves, runs only for atoms on screen, and
   stays completely still under prefers-reduced-motion (nothing waits to be revealed either). Touch
   screens get the click ring, the press and the scroll, but no hover push. */
(() => {
  "use strict";

  const P = (window.InsidirHalftone && window.InsidirHalftone.PHYSICS) ||
    { push: 2.6, spring: 0.05, damping: 0.84, ringSpeed: 0.9, ringBand: 26, ringForce: 3.2, ringLife: 900, drag: 0.05, scroll: 0.03 };
  const RADIUS = 150;        // px around the pointer that atoms feel
  const ATOM_SCALE = 0.18;   // dots are pushed up to ~52px; atoms up to ~9px
  const RING_SCALE = 0.42;   // a ring nudges an atom by about 6px as it passes
  const SCROLL_SCALE = 0.5;  // atoms lag a scroll by half as much as dots: ~6px at a brisk scroll
  const POP = 0.0045, PRESS = -0.009; // scale impulses when the pointer reaches an atom and when it presses it
  const KICK_MAX = 48;       // px of scroll per frame that count
  const FRAME = 1000 / 60;   // the physics is defined per 60 fps frame

  /* What moves by default. Pages can opt in with [data-hf-atom] and out with [data-hf-still]. */
  const ATOMS = [
    "[data-hf-atom]",
    // brand and navigation
    ".v6-logo", ".v13-logo", ".app-header .logo", ".v6-nav__links a", ".v6-signin", ".app-nav a", ".user-menu__btn", ".app-header__bell",
    // buttons and chips
    ".v9-btn", ".btn", ".auth-btn", ".cx-btn", ".rd-toggle", ".rd-filters button", ".v10-follow-btn", ".v3-account__button", ".cl-more", ".hwf-up",
    // links that stand alone, arrows and markers
    ".rd-link", ".v13-link", ".mk-link", ".pw-link", ".auth-switch a", ".rd-shortcuts__name b", ".rd-row > b", ".mk-index a span:last-child",
    ".v12-secondary-link", ".cl-result__head > a", ".cl-finish a", ".research-text-link", ".portfolio-small-link", ".v3-account__links a",
    ".cx-link", ".cx-arrow", ".cx-crumbs a", ".v10-jump", ".v10-known__grid b", ".v10-people-topline a", ".v10-follows__head > a", ".v10-person-card__actions > a", ".alert-src",
    // index numbers and step markers
    ".rd-index", ".mk-num", ".lp-step__num", ".lp-tool__num", ".lp-tool__icon", ".lp-rule__num", ".lp-folio", ".auth-index li > span", ".pw-list li > span",
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

  let atoms = [];            // { el, l, t, r, b, cx, cy, fixed, x, y, vx, vy, s, vs, over, lag }
  const known = new WeakMap();
  let made = 0;              // atoms created so far (seeds each atom's scroll lag)
  let px = -1e5, py = -1e5, pcx = -1e5, pcy = -1e5, inside = false;
  let mdx = 0, mdy = 0, lastCX = NaN, lastCY = NaN;   // pointer movement since the last frame
  let lastSY = NaN, lastSX = NaN;                    // scroll position at the last frame
  let rings = [];            // { x, y, t } in page coordinates
  let raf = 0, awake = false;

  /* "fixed": inside a position:fixed bar, so its home is a viewport position. "sticky": inside a sticky box,
     which scrolls with the page until it sticks, so its home is re-measured as the page scrolls. */
  function pinned(el) {
    let sticky = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === "fixed") return "fixed";
      if (pos === "sticky") sticky = true;
    }
    return sticky ? "sticky" : "";
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
        // `lag`: how much this atom trails a scroll, fixed per atom (0.7–1.3) so a row of them ripples.
        const n = Math.sin(++made * 12.9898 + 4.1) * 43758.5453;
        a = { el, x: 0, y: 0, vx: 0, vy: 0, s: 0, vs: 0, over: false, lag: 0.7 + 0.6 * (n - Math.floor(n)) }; known.set(el, a);
        // translate does not apply to inline boxes; those become inline-block (v13-halftone.css).
        el.setAttribute("data-hf-atom", getComputedStyle(el).display === "inline" ? "inline" : "");
      }
      found.push(a);
    }
    // Atoms that left the page settle instantly.
    for (const a of atoms) if (!found.includes(a)) { a.x = a.y = a.vx = a.vy = a.s = a.vs = 0; write(a, true); }
    atoms = found;
    measure();
  }

  /* Home positions: the element's box with its own offset taken out, in page coordinates
     (viewport coordinates for atoms in fixed or sticky bars). */
  let repin = false;
  function measure(only) {
    const sx = window.scrollX, sy = window.scrollY;
    for (const a of atoms) {
      if (only && !only(a)) continue;
      const r = a.el.getBoundingClientRect();
      // Whether an atom sits in a fixed or sticky bar is read once (and again on resize): walking every
      // ancestor's computed style on each re-measure is what made re-measures expensive.
      if (a.pin === undefined || repin) { a.pin = pinned(a.el); a.fixed = a.pin === "fixed"; }
      const ox = a.fixed ? 0 : sx, oy = a.fixed ? 0 : sy;
      // A sticky atom whose page position changed on a scroll-only re-measure is stuck to the viewport.
      if (only && a.pin === "sticky") a.stuck = Math.abs(r.top - a.y + oy - a.t) > 0.5;
      a.l = r.left - a.x + ox; a.t = r.top - a.y + oy; a.r = r.right - a.x + ox; a.b = r.bottom - a.y + oy;
      a.cx = (a.l + a.r) / 2; a.cy = (a.t + a.b) / 2;
      a.visible = r.width > 0 && r.height > 0;
    }
  }

  // Offsets are written in quarter pixels and scale in 0.002 steps: a spring's last tiny movements cost no restyle.
  const q = (v, step) => Math.round(v / step) * step;
  // Many things ask for a full re-measure (a block finished rising, a transition or animation moved a
  // container, the page changed size): they are coalesced into one, at most every 150ms.
  let remeasureT = 0;
  function remeasure() { if (!remeasureT) remeasureT = setTimeout(() => { remeasureT = 0; measure(); }, 150); }
  function write(a, force) {
    const x = Math.abs(a.x) < 0.125 ? 0 : q(a.x, 0.25), y = Math.abs(a.y) < 0.125 ? 0 : q(a.y, 0.25), s = Math.abs(a.s) < 0.001 ? 0 : q(a.s, 0.002);
    if (force || x !== a.wx || y !== a.wy) {
      a.wx = x; a.wy = y;
      if (x === 0 && y === 0) { a.el.style.removeProperty("--hf-dx"); a.el.style.removeProperty("--hf-dy"); }
      else { a.el.style.setProperty("--hf-dx", x + "px"); a.el.style.setProperty("--hf-dy", y + "px"); }
    }
    if (force || s !== a.ws) {
      a.ws = s;
      if (s === 0) a.el.style.removeProperty("--hf-s"); else a.el.style.setProperty("--hf-s", String(+(1 + s).toFixed(3)));
    }
  }

  let last = 0, acc = 0, scrolled = false, sweepT = 0, lastSweepY = NaN, stickyAt = 0, stickyT = 0;
  const productPage = !!(document.body && document.body.classList && document.body.classList.contains("app-body"));
  function frame(now) {
    raf = 0;
    if (scrolled) {
      scrolled = false;
      // Sticky homes follow the scroll, but reading layout while blocks are rising forces the browser to
      // restyle first: re-read at most every 100ms while scrolling, and once more when it settles.
      if (now - stickyAt > 100) { stickyAt = now; measure(a => a.pin === "sticky"); }
      clearTimeout(stickyT); stickyT = setTimeout(() => { stickyAt = performance.now(); measure(a => a.pin === "sticky"); wake(); }, 120);
      // Ordinary scrolling reveals through the IntersectionObserver; the sweep is for jumps (a big step
      // in one frame) and runs again once the scroll has settled.
      if (waiting.size) {
        if (Math.abs(window.scrollY - (lastSweepY === lastSweepY ? lastSweepY : window.scrollY)) > window.innerHeight * 0.6) sweepReveal();
        clearTimeout(sweepT); sweepT = setTimeout(sweepReveal, 150);
      }
      lastSweepY = window.scrollY;
    }
    if (reducedQ.matches) { for (const a of atoms) { a.x = a.y = a.vx = a.vy = a.s = a.vs = 0; write(a); } awake = false; return; }
    // A fixed 60 fps clock: the same number of physics steps per second at 60, 120 or 144 Hz.
    acc = last ? Math.min(acc + (now - last), 4 * FRAME) : FRAME;
    last = now;
    const steps = Math.floor(acc / FRAME);
    acc -= steps * FRAME;
    const sx = window.scrollX, sy = window.scrollY, vw = window.innerWidth, vh = window.innerHeight;
    // The scroll trail restyles every visible atom on every scrolling frame: worth it on the landing and
    // marketing pages, not on the product's data pages (dashboard, desk, reports), where it cost ~6 fps and
    // the figures should sit still while you read them. Touch screens never trail.
    const push = inside && fineQ.matches, trail = fineQ.matches && !productPage;
    rings = rings.filter(g => now - g.t < P.ringLife);
    // The pointer's movement and the page's scroll since the last frame.
    const mx = steps ? mdx / steps : 0, my = steps ? mdy / steps : 0;
    const dsy = lastSY === lastSY ? sy - lastSY : 0, dsx = lastSX === lastSX ? sx - lastSX : 0;
    if (steps) { mdx = mdy = 0; lastSY = sy; lastSX = sx; }
    const kick = steps ? Math.max(-KICK_MAX, Math.min(KICK_MAX, dsy)) * P.scroll * SCROLL_SCALE : 0;
    const kickX = steps ? Math.max(-KICK_MAX, Math.min(KICK_MAX, dsx)) * P.scroll * SCROLL_SCALE : 0;
    // The dot fields on screen trail the same scroll (the engine weaves it through the field).
    if (steps && (dsy || dsx)) for (const root of fieldRoots()) root.__halftone.kick(dsx, dsy);
    let moving = false;
    for (const a of atoms) {
      if (!a.visible) continue;
      const ox = a.fixed ? 0 : sx, oy = a.fixed ? 0 : sy;
      // Only atoms on screen are simulated: one that leaves the screen while moving is put home at once
      // (one write), so a long page costs what its visible part costs.
      const onScreen = a.b - oy > -24 && a.t - oy < vh + 24 && a.r - ox > -24 && a.l - ox < vw + 24;
      if (!onScreen) {
        if (a.x || a.y || a.vx || a.vy || a.s || a.vs) { a.x = a.y = a.vx = a.vy = a.s = a.vs = 0; a.over = false; write(a); }
        continue;
      }
      const qx = a.fixed ? pcx : px, qy = a.fixed ? pcy : py;
      // Scroll: an atom that scrolls with the page trails it (one in a fixed or stuck bar does not move).
      // Touch screens skip this: on a phone's CPU restyling every atom each frame costs more than it shows.
      if (trail && a.pin !== "fixed" && !(a.pin === "sticky" && a.stuck)) { a.vy += kick * a.lag; a.vx += kickX * a.lag; }
      // The pointer arriving on an atom makes it pop; leaving lets it go.
      const over = push && qx >= a.l && qx <= a.r && qy >= a.t && qy <= a.b;
      if (over && !a.over) a.vs += POP;
      a.over = over;
      let fx = 0, fy = 0;
      for (let s = 0; s < steps; s++) {
        fx = 0; fy = 0;
        if (push) {
          // Distance from the pointer to the atom's box: zero inside it, so the atom you aim at holds still.
          const ex = Math.max(a.l - qx, 0, qx - a.r), ey = Math.max(a.t - qy, 0, qy - a.b), d = Math.hypot(ex, ey);
          if (d > 0 && d < RADIUS) {
            const ux = a.cx - qx, uy = a.cy - qy, L = Math.hypot(ux, uy) || 1, k = 1 - d / RADIUS, f = k * P.push * ATOM_SCALE;
            fx += (ux / L) * f + mx * k * P.drag * ATOM_SCALE; fy += (uy / L) * f + my * k * P.drag * ATOM_SCALE;
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
        a.vs = (a.vs - a.s * P.spring) * P.damping; a.s += a.vs;
      }
      // At rest: home, or held in balance by a resting pointer (a push that equals the spring's pull).
      const slow = Math.abs(a.vx) + Math.abs(a.vy) < 0.01;
      if (Math.abs(a.vs) < 0.0002 && Math.abs(a.s) < 0.0005) a.s = a.vs = 0; else moving = true;
      if (slow && Math.abs(a.x) + Math.abs(a.y) < 0.05) { a.x = a.y = a.vx = a.vy = 0; }
      else if (!(slow && (fx || fy) && Math.abs(fx - a.x * P.spring) + Math.abs(fy - a.y * P.spring) < 0.003)) moving = true;
      write(a);
    }
    awake = moving || rings.length > 0;
    if (awake) raf = requestAnimationFrame(frame);
    else { last = 0; acc = 0; }
  }
  const fieldRoots = () => [...document.querySelectorAll("[data-halftone-hero],[data-halftone-footer],[data-halftone-field]")]
    .filter(r => r.__halftone && typeof r.__halftone.kick === "function");
  function wake() { if (!raf && !reducedQ.matches) { awake = true; raf = requestAnimationFrame(frame); } }

  /* ---------- input ---------- */
  const CONTROL = "a,button,input,select,textarea,label,summary,[role=button],[role=tab],[tabindex],[contenteditable]";
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (lastCX === lastCX) { mdx += e.clientX - lastCX; mdy += e.clientY - lastCY; }
    lastCX = e.clientX; lastCY = e.clientY;
    pcx = e.clientX; pcy = e.clientY; px = pcx + window.scrollX; py = pcy + window.scrollY; inside = true; wake();
  }
  function onLeave(e) { if (!e.relatedTarget) { inside = false; px = py = pcx = pcy = -1e5; lastCX = lastCY = NaN; mdx = mdy = 0; wake(); } }
  function onDown(e) {
    if (reducedQ.matches || e.button > 0) return;
    // Pressing an atom: it gives a little and springs back.
    const hit = e.target && e.target.closest && e.target.closest("[data-hf-atom]");
    if (hit) { const a = known.get(hit); if (a) { a.vs += PRESS; wake(); } }
    if (e.target && e.target.closest && e.target.closest(CONTROL)) return;
    rings.push({ x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, t: performance.now() });
    if (rings.length > 4) rings.shift();
    // The same ring runs through every dot field on the page; the field that was clicked already started it.
    for (const root of document.querySelectorAll("[data-halftone-hero],[data-halftone-footer],[data-halftone-field]")) {
      if (root.__halftone && !(e.__hfRingFrom && e.__hfRingFrom.has(root)) && typeof root.__halftone.ring === "function") root.__halftone.ring(e.clientX, e.clientY);
    }
    wake();
  }

  /* ---------- scroll reveal ----------
     A block marked data-hf-reveal, or each child of a data-hf-reveal-group, that is still below the fold
     when it appears waits RISE px low and transparent (.hf-pending) and, when it scrolls in, rises into
     place on the dots' spring while it fades up (.hf-revealing, v13-halftone.css); blocks arriving together
     go a beat apart (--hf-i). Content already on screen, or added on screen later, is never hidden; nothing
     is pending under reduced motion, without IntersectionObserver, or when printing; a jump past a block
     (a link to the footer, a restored scroll position) shows it at once. */
  const REVEAL = "[data-hf-reveal],[data-hf-reveal-group]>*,footer .hwf-top>*";
  const REVEAL_MS = 1000;    // the spring's settling time (950ms), after the block's own stagger
  const seen = new WeakSet(), waiting = new Set();
  let revealIO = null, settledAll = false;
  function release(el, i) {
    if (!waiting.delete(el)) return;
    if (revealIO) revealIO.unobserve(el);
    el.style.setProperty("--hf-i", String(Math.min(i || 0, 6)));
    el.classList.add("hf-revealing");
    el.classList.remove("hf-pending");
    setTimeout(() => { el.classList.remove("hf-revealing"); el.style.removeProperty("--hf-i"); remeasure(); }, REVEAL_MS + Math.min(i || 0, 6) * 70);
  }
  // Shown in place at once: the block's own transitions are held off for two frames (an inline !important
  // outranks every stylesheet), so nothing slides or fades in from the waiting state.
  function releaseNow(el) {
    if (!waiting.delete(el)) return;
    if (revealIO) revealIO.unobserve(el);
    el.style.setProperty("transition", "none", "important");
    el.classList.remove("hf-pending", "hf-revealing");
    requestAnimationFrame(() => requestAnimationFrame(() => el.style.removeProperty("transition")));
  }
  function revealAll() { settledAll = true; for (const el of [...waiting]) releaseNow(el); measure(); }
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
  // Blocks jumped right past (now above the viewport) are simply shown; those in view rise a beat apart.
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
  let pending = 0;
  function refresh() { clearTimeout(pending); pending = setTimeout(() => { collect(); scanReveal(); wake(); }, 120); }
  function start() {
    collect();
    scanReveal();
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("resize", () => { repin = true; measure(); repin = false; wake(); }, { passive: true });
    // Sticky boxes move with the page until they stick: follow them, once per frame at most.
    // A scroll only flags work: the next frame reads positions (sticky homes, reveals) before it writes any.
    window.addEventListener("scroll", () => { scrolled = true; wake(); }, { passive: true });
    window.addEventListener("beforeprint", revealAll);
    // Focus that lands inside a waiting block (a script focusing a card it just added) shows it at once.
    document.addEventListener("focusin", e => { const b = e.target && e.target.closest && e.target.closest(".hf-pending"); if (b) release(b, 0); });
    // A reveal or slide that moved a container has moved its atoms' homes too.
    const settled = e => {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute("data-hf-atom")) return; // an atom's own hover nudge
      // Only movement re-measures: a transition of a position property, or a keyframe animation on an
      // element that holds atoms (fades, pops and tile landings move nothing that is measured).
      const moved = e.type === "transitionend" ? /^(translate|transform|inset|top|left|margin)/.test(e.propertyName || "")
        : !!(e.target && e.target.querySelector && e.target.querySelector("[data-hf-atom]"));
      if (moved) remeasure();
    };
    document.addEventListener("transitionend", settled, { passive: true });
    document.addEventListener("animationend", settled, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(() => { remeasure(); }).observe(document.body);
    // Rows rendered after load (dashboard modules, menus) join or leave the set.
    // Tooltips and one-line status messages rewrite themselves constantly and hold no atoms or reveal blocks:
    // their changes do not trigger a rescan. (Live regions that hold rows, like followed people, still do.)
    const QUIET = "[role=tooltip],.sr-only,p[aria-live],p[role=status]";
    const quiet = m => { const n = m.target.nodeType === 1 ? m.target : m.target.parentElement; return !!(n && n.closest && n.closest(QUIET)); };
    if (window.MutationObserver) new MutationObserver(muts => { if (muts.some(m => (m.type === "childList" || m.attributeName === "hidden") && !quiet(m))) refresh(); })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); });
    reducedQ.addEventListener && reducedQ.addEventListener("change", () => {
      for (const a of atoms) { a.x = a.y = a.vx = a.vy = a.s = a.vs = 0; write(a, true); }
      if (reducedQ.matches) revealAll();
      wake();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  /* revealAll(): show every pending block now and stop holding new ones back (printing, tests, tools that
     measure the page). */
  window.InsidirMotion = Object.freeze({ PHYSICS: P, RADIUS, ATOM_SCALE, RING_SCALE, SCROLL_SCALE, refresh, revealAll,
    get count() { return atoms.length; }, get pending() { return waiting.size; } });
})();
