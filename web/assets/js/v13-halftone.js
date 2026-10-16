/* Insidir V13 halftone engine.
   A wordmark set enormous and cropped by the bottom edge, printed as a field of
   halftone dots: each dot is sized by how much of the letter covers its cell, so
   the type keeps its edges at any size. Move across it and the dots part a little
   around the pointer and settle back, always in ink (nothing on the site glows);
   click the word and a soft ring runs through it. It is the only thing on the
   site that answers the pointer. The same engine draws the plain dot fields
   (data-halftone-field) used as quiet print texture elsewhere: those hold still.

   Plain JavaScript port of the Halftone Wordmark Footer React component so it
   runs under the site's no-build, same-origin Content-Security-Policy. The word is
   printed once, in the landing page's first screen (data-halftone-hero). Colours
   come from the --hwf-bg / --hwf-ink custom properties on the root
   element (set by v13-halftone.css), so the theme owns them. */
(() => {
  "use strict";

  const PRESET = { background: "#0c0c0b", ink: "#e9e4da" };
  /* The wordmark's dots: a pointer within the radius pushes with up to `push` per frame and drags what it
     passes along with `drag` of its own movement; a spring of `spring` pulls home and `damping` keeps what is
     left each frame (60 fps), so a dot moves at most push / spring ≈ 12px and settles in about half a second
     without bouncing far; a click on the word sends a ring out at `ringSpeed` px/ms, `ringBand` px wide, with
     `ringForce`, for `ringLife` ms. `scroll` is 0: nothing trails a scroll. */
  const PHYSICS = Object.freeze({ push: 1, spring: 0.08, damping: 0.8, ringSpeed: 0.9, ringBand: 22, ringForce: 1.1, ringLife: 650, drag: 0.015, scroll: 0 });
  const KICK_MAX = 48;  // px of scroll per frame that count; a jump further than that is one hard flick
  const SANS_STACK = '"Inter", "Inter Tight", "Helvetica Neue", Arial, system-ui, sans-serif';
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- pure helpers (shared with test/halftone.test.mjs) ---------- */

  /** Hex → [r, g, b] in 0–255, or null for anything that isn't #rgb / #rrggbb. */
  function hex(h) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h || "").trim());
    if (!m) return null;
    const s = m[1].length === 3 ? m[1].split("").map(c => c + c).join("") : m[1];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  /** Dot radius for a cell coverage in [0, 1]: area-true, so tone stays even. */
  function radius(coverage, gap) {
    const c = coverage < 0 ? 0 : coverage > 1 ? 1 : coverage;
    return Math.sqrt(c) * gap * 0.56;
  }

  /** One step of a dot's spring back to home plus the push from a pointer at (px, py) within r, which also
      drags the dot along with its movement (mx, my) this frame. */
  function step(x, y, vx, vy, hx, hy, px, py, r, mx, my) {
    const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
    if (r > 0 && d2 < r * r) {
      const d = Math.sqrt(d2) + 0.001;
      const k = 1 - d / r, f = k * PHYSICS.push;
      vx += (dx / d) * f + (mx || 0) * k * PHYSICS.drag;
      vy += (dy / d) * f + (my || 0) * k * PHYSICS.drag;
    }
    vx = (vx + (hx - x) * PHYSICS.spring) * PHYSICS.damping;
    vy = (vy + (hy - y) * PHYSICS.spring) * PHYSICS.damping;
    return [x + vx, y + vy, vx, vy];
  }

  /** How strongly a dot at home (hx, hy) takes a scroll kick: an even weave from 0.1 to 1, so a field
      ripples as the page moves instead of sliding as one sheet. */
  function weave(hx, hy) {
    return 0.55 + 0.45 * Math.sin(hx * 0.021 + hy * 0.013);
  }
  /** Font size that sets `measured` (width at 100px) to fill `width` exactly. */
  function fitSize(measured, width) {
    return measured > 0 ? (width / measured) * 100 : 0;
  }
  /** Sets the word's font on `ctx` at the size that fills `availWidth` and returns that size, the word's metrics, its
      cap height and how far its ink sits from the drawing origin. With `options.fitTo` the word's ink (from the left
      edge of the first letter to the right edge of the last) fills the width exactly, so it lines up with a grid;
      without it the advance width does, as it always has. v9-motion.js uses the same sum for the hero's crop. */
  function wordFit(options, ctx, availWidth) {
    const o = options || {}, word = o.wordmark || " ";
    const ink = b => o.fitTo ? (b.actualBoundingBoxLeft || 0) + (b.actualBoundingBoxRight || b.width) : b.width;
    const set = px => { ctx.font = o.fontWeight + " " + px + "px " + o.fontFamily; return ctx.measureText(word); };
    if ("letterSpacing" in ctx) ctx.letterSpacing = o.letterSpacing;
    let size = fitSize(ink(set(100)), availWidth), box = set(size);
    // Ink does not scale exactly with the size (hinting, spacing rounding): one correction lands it on the width.
    const got = ink(box);
    if (o.fitTo && got > 0 && Math.abs(got - availWidth) > 0.25) { size = size * availWidth / got; box = set(size); }
    return { size, box, cap: box.actualBoundingBoxAscent || size * 0.72, left: o.fitTo ? box.actualBoundingBoxLeft || 0 : 0 };
  }

  /* ---------- options ---------- */

  function readOptions(root, overrides) {
    const d = root.dataset, cs = getComputedStyle(root);
    const v = name => cs.getPropertyValue(name).trim();
    const num = (key, fallback) => { const n = parseFloat(d[key]); return Number.isFinite(n) ? n : fallback; };
    const field = root.hasAttribute("data-halftone-field");
    return Object.assign({
      mode: d.mode || (field ? "field" : "word"),
      wordmark: d.wordmark || "insidir",
      colors: {
        background: v("--hwf-bg") || PRESET.background,
        ink: v("--hwf-ink") || PRESET.ink
      },
      dotGap: num("dotGap", field ? 11 : 6),
      radius: num("radius", field ? 140 : 100),
      // data-scroll-scatter (px): as the element scrolls up out of view its dots drift apart by up to this much.
      scatter: num("scrollScatter", 0),
      crop: num("crop", 0.2),
      grain: num("grain", field ? 0 : 0.5),
      fieldCoverage: num("fieldCoverage", 0.12),
      // Only a word answers the pointer (the landing wordmark, the 404's numerals); a plain field is print
      // texture and holds still unless it asks with data-interactive="true".
      interactive: d.interactive ? d.interactive !== "false" : (d.mode || (field ? "field" : "word")) === "word",
      // data-fit-to (a selector inside the element): the word's ink spans exactly that element's width, from its
      // left edge (the landing fits the wordmark to the page grid); without it the word fills the element's width.
      fitTo: d.fitTo || "",
      fontWeight: d.fontWeight || "800",
      fontFamily: d.fontFamily || v("--hwf-font") || SANS_STACK,
      letterSpacing: d.letterSpacing || "-0.045em",
      // The field sits behind content that receives the pointer, so listen on its parent.
      // data-pointer-host="document": the field feels the pointer anywhere on the page (dots still only move
      // within the radius), for fields that sit right under a navigation bar.
      pointerHost: d.pointerHost === "document" ? document : field ? root.parentElement : root
    }, overrides || {});
  }

  /* ---------- engine ---------- */

  function mount(root, overrides) {
    if (!root || root.__halftone) return root && root.__halftone;
    const o = readOptions(root, overrides);
    let canvas = root.querySelector(":scope > canvas");
    if (!canvas) { canvas = document.createElement("canvas"); canvas.setAttribute("aria-hidden", "true"); root.prepend(canvas); }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const still = reduced();
    let w = 0, h = 0, dpr = 1, px = -1e5, py = -1e5, raf = 0, visible = true, awake = true, alive = true;
    let ring = { x: 0, y: 0, t: -1 };
    let dots = new Float32Array(0), count = 0, grainTile = null;
    let dirs = new Float32Array(0), spread = 0;   // scroll scatter: each dot's drift direction, and how far along it is
    let mdx = 0, mdy = 0, lastCX = NaN, lastCY = NaN; // pointer movement since the last frame
    let kx = 0, ky = 0;                               // scroll since the last frame

    const layout = () => {
      const rect = root.getBoundingClientRect();
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const gap = Math.max(3, o.dotGap);
      const cols = Math.ceil(w / gap), rows = Math.ceil(h / gap);
      const tmp = [];

      if (o.mode === "field") {
        const r = radius(Math.max(0, Math.min(1, o.fieldCoverage)), gap);
        for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
          const hx = gx * gap + gap / 2, hy = gy * gap + gap / 2;
          tmp.push(hx, hy, 0, 0, hx, hy, r);
        }
      } else {
        // Set the word once, at a size that fills the width, on a 1x mask.
        const mask = document.createElement("canvas");
        mask.width = w; mask.height = h;
        const m = mask.getContext("2d", { willReadFrequently: true });
        if (!m) return;
        const word = o.wordmark || " ";
        let ref = null;
        if (o.fitTo) { try { ref = root.querySelector(o.fitTo); } catch (e) { ref = null; } }
        const refBox = ref && ref.getBoundingClientRect();
        const grid = refBox && refBox.width > 0 ? refBox : null;
        const f = wordFit(grid ? o : Object.assign({}, o, { fitTo: "" }), m, grid ? grid.width : w * 1.02);
        const c = Math.max(0, Math.min(0.6, o.crop));
        m.fillStyle = "#000";
        m.textBaseline = "alphabetic";
        m.fillText(word, grid ? grid.left - rect.left + f.left : (w - f.box.width) / 2, h + f.cap * c);
        const img = m.getImageData(0, 0, w, h).data;
        for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
          // Coverage: average alpha over a 3×3 sample of the cell.
          let sum = 0;
          for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
            const x = Math.min(w - 1, Math.floor(gx * gap + ((sx + 0.5) * gap) / 3));
            const y = Math.min(h - 1, Math.floor(gy * gap + ((sy + 0.5) * gap) / 3));
            sum += img[(y * w + x) * 4 + 3];
          }
          const cov = sum / (9 * 255);
          if (cov < 0.06) continue;
          const hx = gx * gap + gap / 2, hy = gy * gap + gap / 2;
          tmp.push(hx, hy, 0, 0, hx, hy, radius(cov, gap));
        }
      }
      dots = new Float32Array(tmp);
      count = tmp.length / 7;
      // Scatter directions: away from the bottom centre the word stands on, each turned a little and
      // lengthened or shortened by a fixed hash, so the word comes apart as dots rather than as a zoom.
      dirs = new Float32Array(count * 2);
      if (o.scatter > 0) for (let i = 0; i < count; i++) {
        const hx = dots[i * 7 + 4], hy = dots[i * 7 + 5];
        const n = Math.sin(i * 12.9898 + hx * 0.37) * 43758.5453, j = n - Math.floor(n);
        const a = Math.atan2(hy - h * 1.1, hx - w / 2) + (j - 0.5) * 1.1, len = 0.45 + j * 1.1;
        dirs[i * 2] = Math.cos(a) * len; dirs[i * 2 + 1] = Math.sin(a) * len;
      }

      // A fixed tile of print grain, drawn once and laid over every frame.
      grainTile = null;
      if (o.grain > 0) {
        grainTile = document.createElement("canvas");
        grainTile.width = 256; grainTile.height = 256;
        const g = grainTile.getContext("2d");
        if (g) {
          const id = g.createImageData(256, 256);
          for (let i = 0; i < id.data.length; i += 4) {
            const v = Math.random() * 255;
            id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
            id.data[i + 3] = Math.random() < 0.5 ? 0 : 255;
          }
          g.putImageData(id, 0, 0);
        }
      }
      awake = true;
    };

    // A fixed 60 fps physics clock, the same as v13-motion.js: identical feel at 60, 120 or 144 Hz.
    const FRAME = 1000 / 60;
    let last = 0, acc = 0;
    const draw = now => {
      acc = last ? Math.min(acc + (now - last), 4 * FRAME) : FRAME;
      last = now;
      const steps = Math.floor(acc / FRAME);
      acc -= steps * FRAME;
      // The pointer's movement and the page's scroll since the last frame, spread over this frame's steps.
      const mx = steps ? mdx / steps : 0, my = steps ? mdy / steps : 0;
      const kick = steps ? Math.max(-KICK_MAX, Math.min(KICK_MAX, ky)) * PHYSICS.scroll : 0;
      const kickX = steps ? Math.max(-KICK_MAX, Math.min(KICK_MAX, kx)) * PHYSICS.scroll : 0;
      if (steps) { mdx = mdy = 0; kx = ky = 0; }
      const S = o.scatter * spread;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = o.colors.background;
      ctx.fillRect(0, 0, w, h);
      const r = o.interactive && !still ? Math.max(0, o.radius) : 0;
      const ringAge = ring.t < 0 ? 1e9 : now - ring.t;
      const ringR = ringAge * PHYSICS.ringSpeed;
      let moving = false;
      ctx.fillStyle = o.colors.ink;
      for (let i = 0; i < count; i++) {
        const j = i * 7;
        let x = dots[j], y = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3];
        const hx = dots[j + 4] + dirs[i * 2] * S, hy = dots[j + 5] + dirs[i * 2 + 1] * S;
        if (!still) {
          if (kick || kickX) { const f = weave(dots[j + 4], dots[j + 5]); vx += kickX * f; vy += kick * f; }
          for (let k = 0; k < steps; k++) {
            if (ringAge < PHYSICS.ringLife) {
              const dx = hx - ring.x, dy = hy - ring.y;
              const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
              const band = 1 - Math.min(1, Math.abs(d - ringR) / PHYSICS.ringBand);
              if (band > 0) {
                const f = band * PHYSICS.ringForce * (1 - ringAge / PHYSICS.ringLife);
                vx += (dx / d) * f; vy += (dy / d) * f;
              }
            }
            const s = step(x, y, vx, vy, hx, hy, px, py, r, mx, my);
            x = s[0]; y = s[1]; vx = s[2]; vy = s[3];
          }
          const slow = Math.abs(vx) + Math.abs(vy) <= 0.02, home = Math.abs(x - hx) + Math.abs(y - hy) <= 0.05;
          if (!slow) moving = true;
          else if (home) { x = hx; y = hy; vx = 0; vy = 0; }
          // Off home and slow: still travelling back unless it sits inside a resting pointer's reach, held in balance.
          else if (ringAge < PHYSICS.ringLife || (x - px) * (x - px) + (y - py) * (y - py) >= r * r) moving = true;
          dots[j] = x; dots[j + 1] = y; dots[j + 2] = vx; dots[j + 3] = vy;
        }
        ctx.beginPath();
        ctx.arc(x, y, dots[j + 6], 0, 6.2832);
        ctx.fill();
      }
      if (grainTile && o.grain > 0) {
        ctx.globalAlpha = Math.min(1, o.grain) * 0.09;
        ctx.globalCompositeOperation = "overlay";
        const pattern = ctx.createPattern(grainTile, "repeat");
        if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, w, h); }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      // Sleep once everything is home, or held still by a resting pointer; the next pointer move wakes it.
      awake = moving || ringAge < PHYSICS.ringLife;
      if (!awake) { last = 0; acc = 0; }
    };

    const loop = now => {
      raf = 0;
      if (!visible || !alive) return;
      draw(now);
      if (awake) raf = requestAnimationFrame(loop);
    };
    const wake = () => { awake = true; if (!raf && visible && alive) raf = requestAnimationFrame(loop); };

    const toLocal = e => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const onMove = e => {
      if (!o.interactive) return;
      const p = toLocal(e); px = p[0]; py = p[1];
      if (lastCX === lastCX) { mdx += e.clientX - lastCX; mdy += e.clientY - lastCY; }
      lastCX = e.clientX; lastCY = e.clientY;
      wake();
    };
    const onLeave = () => { px = -1e5; py = -1e5; lastCX = lastCY = NaN; mdx = mdy = 0; wake(); };
    const onDown = e => {
      if (!o.interactive || still) return;
      if (e.button > 0 || (e.target && e.target.closest && e.target.closest("a,button,input,select,textarea,label,summary,[role=button],[role=tab],[tabindex],[contenteditable]"))) return;
      const p = toLocal(e);
      ring = { x: p[0], y: p[1], t: performance.now() };
      (e.__hfRingFrom = e.__hfRingFrom || new Set()).add(root); // v13-motion.js sends the same ring through the rest of the page
      wake();
    };

    layout();
    draw(performance.now());
    wake();

    // Scroll scatter: how far the element has scrolled up out of view, 0 at rest to 1 once it is gone.
    const onScatter = () => {
      if (still) return;
      const b = root.getBoundingClientRect();
      const p = b.height > 0 ? Math.max(0, Math.min(1, -b.top / b.height)) : 0;
      if (p !== spread) { spread = p; wake(); }
    };
    if (o.scatter > 0) { window.addEventListener("scroll", onScatter, { passive: true }); onScatter(); }

    const host = o.pointerHost || root;
    host.addEventListener("pointermove", onMove);
    const onOut = e => { if (!e.relatedTarget) onLeave(); };
    if (host === document) document.addEventListener("pointerout", onOut);
    else host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    // A layout clears the canvas (it is resized): draw at once, on screen or not, so a field off screen is never left
    // blank until it scrolls into view.
    const ro = new ResizeObserver(() => { layout(); draw(performance.now()); wake(); });
    ro.observe(root);
    // Scrolled out of view: put every dot home, so the field is at rest when it comes back.
    const io = new IntersectionObserver(entries => {
      visible = entries[0] ? entries[0].isIntersecting : true;
      if (visible) { wake(); return; }
      const S = o.scatter * spread;
      for (let i = 0; i < count; i++) { const j = i * 7; dots[j] = dots[j + 4] + dirs[i * 2] * S; dots[j + 1] = dots[j + 5] + dirs[i * 2 + 1] * S; dots[j + 2] = dots[j + 3] = 0; }
      px = py = -1e5; ring.t = -1; last = 0; acc = 0; mdx = mdy = kx = ky = 0; lastCX = lastCY = NaN;
      draw(performance.now());
    });
    io.observe(root);
    // The wordmark is set in the page's web font once it has landed.
    if (document.fonts && document.fonts.load) {
      document.fonts.load(o.fontWeight + " 100px " + o.fontFamily).catch(() => {}).then(() => { if (alive) { layout(); draw(performance.now()); wake(); } });
    }

    const api = {
      root, canvas, options: o,
      relayout() { layout(); wake(); },
      /* A ring started elsewhere on the page (viewport coordinates) runs through this field too. */
      ring(clientX, clientY) {
        if (!o.interactive || still) return;
        const b = canvas.getBoundingClientRect();
        ring = { x: clientX - b.left, y: clientY - b.top, t: performance.now() };
        wake();
      },
      /* The page scrolled by (dx, dy) px: the dots are left behind a little and spring back (v13-motion.js
         calls this once a frame while the page scrolls). */
      kick(dx, dy) {
        if (!o.interactive || still || !visible) return;
        kx += dx || 0; ky += dy || 0;
        wake();
      },
      destroy() {
        alive = false;
        if (o.scatter > 0) window.removeEventListener("scroll", onScatter);
        cancelAnimationFrame(raf);
        ro.disconnect(); io.disconnect();
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerleave", onLeave);
        document.removeEventListener("pointerout", onOut);
        host.removeEventListener("pointerdown", onDown);
        delete root.__halftone;
      }
    };
    root.__halftone = api;
    return api;
  }

  /* ---------- auto-mount ---------- */

  function auto() {
    // Every page ends on a strip of the same dots: the plain footer gets a field across its top.
    document.querySelectorAll("footer.v13-footer--plain").forEach(f => {
      if (f.querySelector(":scope > .hwf-field")) return;
      const strip = document.createElement("div");
      strip.className = "hwf-field";
      strip.setAttribute("data-halftone-field", "");
      strip.setAttribute("aria-hidden", "true");
      strip.dataset.fieldCoverage = "0.1";
      f.prepend(strip);
    });
    document.querySelectorAll("[data-halftone-hero],[data-halftone-footer],[data-halftone-field]").forEach(el => mount(el));
    document.querySelectorAll(".hwf-up").forEach(btn => {
      if (btn.__bound) return;
      btn.__bound = true;
      btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }));
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();

  window.InsidirHalftone = Object.assign(window.InsidirHalftone || {}, { mount, auto, hex, radius, step, weave, fitSize, wordFit, PRESET, PHYSICS });
})();
