/* Landing scroll effects (mid): pointer-driven extras for the desktop scenes in fx-mid.css.
   - See what moves: a small 3D tilt with a glare that follows the pointer on each card
   - Four critical lenses: a circular magnifier that follows the pointer over each photograph
   - Research faster: --fxv scroll velocity for the photographs' skew/stretch
   Scroll-scrubbed motion itself is pure CSS on motion.js's --p.
   Pointer effects need a fine hovering pointer; everything needs motion allowed and the desktop scene; rAF-throttled. */
(() => {
  const root = document.documentElement;
  const DESK = "(prefers-reduced-motion: no-preference) and (min-width: 901px) and (min-height: 560px) and (hover: hover) and (pointer: fine)";
  const mq = matchMedia(DESK);
  const on = () => mq.matches;
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ---------- tilt + glare ---------- */
  const moves = document.querySelector(".fx-moves");
  function bindTilt(card) {
    const inner = card.querySelector(".pcard__inner");
    if (!inner) return;
    let over = false, px = 0, py = 0, raf = 0;
    const cur = { tx: 0, ty: 0, lift: 0, go: 0, gx: 50, gy: 30 };
    const tgt = { ...cur };
    const write = () => {
      inner.style.setProperty("--tx", cur.tx.toFixed(2) + "deg");
      inner.style.setProperty("--ty", cur.ty.toFixed(2) + "deg");
      inner.style.setProperty("--lift", cur.lift.toFixed(2) + "px");
      inner.style.setProperty("--go", cur.go.toFixed(3));
      inner.style.setProperty("--gx", cur.gx.toFixed(1) + "%");
      inner.style.setProperty("--gy", cur.gy.toFixed(1) + "%");
    };
    const step = () => {
      raf = 0;
      if (over) {
        const r = card.getBoundingClientRect();
        const nx = Math.min(1, Math.max(0, (px - r.left) / r.width)), ny = Math.min(1, Math.max(0, (py - r.top) / r.height));
        tgt.tx = (0.5 - ny) * 9; tgt.ty = (nx - 0.5) * 11; tgt.lift = -4; tgt.go = 1;
        tgt.gx = nx * 100; tgt.gy = ny * 100;
      } else { tgt.tx = 0; tgt.ty = 0; tgt.lift = 0; tgt.go = 0; }
      let moving = false;
      for (const k in cur) {
        cur[k] = lerp(cur[k], tgt[k], k === "gx" || k === "gy" ? 0.22 : 0.12);
        if (Math.abs(cur[k] - tgt[k]) > (k === "go" ? 0.002 : 0.02)) moving = true; else cur[k] = tgt[k];
      }
      write();
      if (moving || over) raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    card.addEventListener("pointerenter", e => { if (!on() || e.pointerType === "touch") return; over = true; px = e.clientX; py = e.clientY; kick(); });
    card.addEventListener("pointermove", e => { if (!over) return; px = e.clientX; py = e.clientY; });
    card.addEventListener("pointerleave", () => { if (!over) return; over = false; kick(); });
  }
  if (moves) moves.querySelectorAll(".pcard").forEach(bindTilt);

  /* ---------- magnifier ---------- */
  const SIZE = 150, ZOOM = 1.8;
  function bindLoupe(frame) {
    const img = frame.querySelector("img");
    if (!img) return;
    let loupe = null, over = false, px = 0, py = 0, raf = 0;
    const src = () => img.currentSrc || img.src;
    const make = () => {
      loupe = document.createElement("span");
      loupe.className = "fx-loupe";
      loupe.setAttribute("aria-hidden", "true");
      loupe.style.backgroundImage = `url("${src()}")`;
      frame.appendChild(loupe);
    };
    const step = () => {
      raf = 0;
      if (!over || !loupe) return;
      const r = frame.getBoundingClientRect();
      const W = r.width, H = r.height;
      const nw = img.naturalWidth || W, nh = img.naturalHeight || H;
      const s = Math.max(W / nw, H / nh);                    // object-fit: cover, centred
      const rw = nw * s, rh = nh * s, ox = (W - rw) / 2, oy = (H - rh) / 2;
      const x = Math.min(W, Math.max(0, px - r.left)), y = Math.min(H, Math.max(0, py - r.top));
      loupe.style.translate = `${(x - SIZE / 2).toFixed(1)}px ${(y - SIZE / 2).toFixed(1)}px`;
      loupe.style.backgroundSize = `${(rw * ZOOM).toFixed(1)}px ${(rh * ZOOM).toFixed(1)}px`;
      loupe.style.backgroundPosition = `${(SIZE / 2 - (x - ox) * ZOOM).toFixed(1)}px ${(SIZE / 2 - (y - oy) * ZOOM).toFixed(1)}px`;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    frame.addEventListener("pointerenter", e => {
      if (!on() || e.pointerType === "touch") return;
      if (!loupe) make();
      over = true; px = e.clientX; py = e.clientY;
      step();                                               // place it before it fades in
      frame.classList.add("fx-loupe-on");
      root.classList.add("fxm-loupe");                       // the loupe is the cursor here (see fx-mid.css)
      requestAnimationFrame(() => { if (over) loupe.classList.add("is-on"); });
    });
    frame.addEventListener("pointermove", e => { if (!over) return; px = e.clientX; py = e.clientY; kick(); });
    frame.addEventListener("pointerleave", () => {
      if (!over) return;
      over = false;
      frame.classList.remove("fx-loupe-on");
      root.classList.remove("fxm-loupe");
      if (loupe) loupe.classList.remove("is-on");
    });
    window.addEventListener("scroll", () => { if (over) kick(); }, { passive: true });
    img.addEventListener("load", () => { if (loupe) loupe.style.backgroundImage = `url("${src()}")`; });
  }
  const lenses = document.querySelector(".fx-lenses");
  if (lenses) lenses.querySelectorAll(".lens__media").forEach(bindLoupe);

  /* ---------- scroll velocity for the research photographs ----------
     motion.js's html --vel never leaves ~0 (its settle loop re-baselines the position just before each
     measurement), so the research section gets its own --fxv: scrollY reads only, written on that section
     only, and only while it is on screen and the desktop scene runs. */
  const SCENE = DESK.replace(" and (hover: hover) and (pointer: fine)", "") +
    ", (prefers-reduced-motion: no-preference) and (min-width: 1200px) and (min-height: 560px)";
  const sceneMq = matchMedia(SCENE);
  const research = document.querySelector(".fx-research");
  if (research && "IntersectionObserver" in window) {
    let visible = false, vy = window.scrollY, vt = performance.now(), v = 0, raf = 0, written = "";
    const write = val => { const s = val.toFixed(3); if (s !== written) { written = s; research.style.setProperty("--fxv", s); } };
    const tick = now => {
      const y = window.scrollY, dt = Math.min(100, Math.max(8, now - vt));
      const raw = Math.max(-1, Math.min(1, (y - vy) / dt / 2.2));   // ~2.2px per ms = full strength
      vy = y; vt = now;
      v += (raw - v) * 0.18;
      if (raw === 0 && Math.abs(v) < 0.003) v = 0;
      write(v);
      raf = v !== 0 && visible ? requestAnimationFrame(tick) : 0;
      if (!raf && v !== 0) { v = 0; write(0); }
    };
    window.addEventListener("scroll", () => {
      if (!visible || raf || !sceneMq.matches) { if (!visible) { vy = window.scrollY; vt = performance.now(); } return; }
      raf = requestAnimationFrame(tick);
    }, { passive: true });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; vy = window.scrollY; vt = performance.now(); },
      { rootMargin: "20% 0px" }).observe(research);
  }

  /* the tilt styles only apply while the desktop scene runs */
  const sync = () => { if (moves) moves.classList.toggle("fx-tilt", on()); };
  sync();
  if (mq.addEventListener) mq.addEventListener("change", sync); else if (mq.addListener) mq.addListener(sync);
})();
