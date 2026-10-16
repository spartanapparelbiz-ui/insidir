/* Insidir V13 halftone engine.
   A wordmark set enormous and cropped by the bottom edge, printed as a field of
   halftone dots: each dot is sized by how much of the letter covers its cell, so
   the type keeps its edges at any size. The same engine draws the plain dot fields
   (data-halftone-field): the person file's header band, the marketing heroes, the footer strip, the
   sign-in panel, the plans, the 404's numerals and the overview's brief corner.

   Every dot answers the pointer, hard: the pointer anywhere on the page blows a hole
   through any field within reach and sweeps the dots along the way it moves; holding
   the button (or a finger) down widens and deepens the hole; every press or tap sends
   a shock ring out through every field on screen. The dots spring home and settle by
   themselves. Only the dots move: the page's content never does (v13-motion.js), and
   under prefers-reduced-motion the dots hold still too. Always in ink: nothing glows.

   Plain JavaScript port of the Halftone Wordmark Footer React component so it
   runs under the site's no-build, same-origin Content-Security-Policy. The word is
   printed once, in the landing page's first screen (data-halftone-hero). Colours
   come from the --hwf-bg / --hwf-ink custom properties on the root
   element (set by v13-halftone.css), so the theme owns them. */
(() => {
  "use strict";

  const PRESET = { background: "#0c0c0b", ink: "#e9e4da" };
  /* A pointer within a field's radius pushes each dot with up to `push` per frame and drags what it passes with
     `drag` of its own movement; held down it pushes `press` times as hard over `pressReach` times the radius. A spring
     of `spring` pulls home and `damping` keeps what is left each frame (60 fps), so a resting pointer clears a hole
     about 120px across at the default reach (some 210px held down) and a dot thrown out swings back once and settles
     in about a second. A press sends a ring
     out at `ringSpeed` px/ms, `ringBand` px wide, with `ringForce`, for `ringLife` ms; up to `rings` run at once. */
  const PHYSICS = Object.freeze({ push: 4, spring: 0.045, damping: 0.85, drag: 0.14, press: 2.2, pressReach: 1.35, ringSpeed: 1.05, ringBand: 36, ringForce: 4, ringLife: 1300, rings: 6 });
  const SANS_STACK = '"Inter", "Inter Tight", "Helvetica Neue", Arial, system-ui, sans-serif';
  const TAU = Math.PI * 2;
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
      drags the dot along with its movement (mx, my) this frame; `boost` multiplies the push (a held press). */
  function step(x, y, vx, vy, hx, hy, px, py, r, mx, my, boost) {
    const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
    if (r > 0 && d2 < r * r) {
      const d = Math.sqrt(d2) + 0.001;
      const k = 1 - d / r, f = k * PHYSICS.push * (boost || 1);
      vx += (dx / d) * f + (mx || 0) * k * PHYSICS.drag;
      vy += (dy / d) * f + (my || 0) * k * PHYSICS.drag;
    }
    vx = (vx + (hx - x) * PHYSICS.spring) * PHYSICS.damping;
    vy = (vy + (hy - y) * PHYSICS.spring) * PHYSICS.damping;
    return [x + vx, y + vy, vx, vy];
  }

  /** The push a ring started `age` ms ago at distance `d` from a dot gives it this frame (0 outside the ring's band). */
  function ringPush(d, age) {
    if (age < 0 || age >= PHYSICS.ringLife) return 0;
    const band = 1 - Math.min(1, Math.abs(d - age * PHYSICS.ringSpeed) / PHYSICS.ringBand);
    return band > 0 ? band * PHYSICS.ringForce * (1 - age / PHYSICS.ringLife) : 0;
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
      radius: num("radius", field ? 170 : 130),
      // data-scroll-scatter (px): as the element scrolls up out of view its dots drift apart by up to this much.
      scatter: num("scrollScatter", 0),
      crop: num("crop", 0.2),
      grain: num("grain", field ? 0 : 0.5),
      fieldCoverage: num("fieldCoverage", 0.12),
      // Every field answers the pointer; data-interactive="false" turns one into still print.
      interactive: d.interactive !== "false",
      // data-fit-to (a selector inside the element): the word's ink spans exactly that element's width, from its
      // left edge (the landing fits the wordmark to the page grid); without it the word fills the element's width.
      fitTo: d.fitTo || "",
      fontWeight: d.fontWeight || "800",
      fontFamily: d.fontFamily || v("--hwf-font") || SANS_STACK,
      letterSpacing: d.letterSpacing || "-0.045em"
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

    // Reduced motion is followed live: turned on, every dot goes home and the field stops answering.
    const motionQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    let still = motionQ.matches, lastInput = 0;
    let w = 0, h = 0, dpr = 1, px = -1e5, py = -1e5, raf = 0, visible = true, awake = true, alive = true, pressed = false;
    let rings = [];                                   // shock rings: { x, y, t } in the canvas's own coordinates
    let dots = new Float32Array(0), count = 0, grainTile = null;
    let dirs = new Float32Array(0), spread = 0;   // scroll scatter: each dot's drift direction, and how far along it is
    let mdx = 0, mdy = 0, lastCX = NaN, lastCY = NaN; // pointer movement since the last frame

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

    // A fixed 60 fps physics clock: identical feel at 60, 120 or 144 Hz.
    const FRAME = 1000 / 60;
    let last = 0, acc = 0;
    const draw = now => {
      acc = last ? Math.min(acc + (now - last), 4 * FRAME) : FRAME;
      last = now;
      const steps = Math.floor(acc / FRAME);
      acc -= steps * FRAME;
      // The pointer's movement since the last frame, spread over this frame's steps.
      const mx = steps ? mdx / steps : 0, my = steps ? mdy / steps : 0;
      if (steps) mdx = mdy = 0;
      const S = o.scatter * spread;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = o.colors.background;
      ctx.fillRect(0, 0, w, h);
      const live = !still && o.interactive;
      const r = live ? Math.max(0, o.radius) * (pressed ? PHYSICS.pressReach : 1) : 0, r2 = r * r;
      const boost = pressed ? PHYSICS.press : 1;
      if (rings.length) rings = rings.filter(g => now - g.t < PHYSICS.ringLife);
      const nr = live && visible ? rings.length : 0;
      // The pointer (and any press) has been still for a while: a dot it holds that only creeps round the rim of
      // its hole counts as settled, so a resting pointer lets the field sleep.
      const quiet = now - lastInput > 700;
      let moving = false;
      // Every dot goes into one path and is filled once.
      ctx.fillStyle = o.colors.ink;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const j = i * 7, rad = dots[j + 6];
        let x = dots[j], y = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3];
        const hx = dots[j + 4] + dirs[i * 2] * S, hy = dots[j + 5] + dirs[i * 2 + 1] * S;
        if (live && steps) {
          // A dot at rest, out of the pointer's reach and clear of every ring's band, stays exactly where it is.
          let act = vx !== 0 || vy !== 0 || x !== hx || y !== hy || (x - px) * (x - px) + (y - py) * (y - py) < r2;
          for (let g = 0; g < nr && !act; g++) {
            const dx = hx - rings[g].x, dy = hy - rings[g].y;
            act = Math.abs(Math.sqrt(dx * dx + dy * dy) - (now - rings[g].t) * PHYSICS.ringSpeed) < PHYSICS.ringBand + 4;
          }
          if (act) {
            for (let k = 0; k < steps; k++) {
              for (let g = 0; g < nr; g++) {
                const dx = x - rings[g].x, dy = y - rings[g].y, d = Math.sqrt(dx * dx + dy * dy) + 0.001;
                const f = ringPush(d, now - rings[g].t);
                if (f) { vx += (dx / d) * f; vy += (dy / d) * f; }
              }
              const s = step(x, y, vx, vy, hx, hy, px, py, r, mx, my, boost);
              x = s[0]; y = s[1]; vx = s[2]; vy = s[3];
            }
            const sp = Math.abs(vx) + Math.abs(vy), home = Math.abs(x - hx) + Math.abs(y - hy) <= 0.12;
            const held = (x - px) * (x - px) + (y - py) * (y - py) < r2;
            if (sp > 0.04) { if (!(held && quiet && sp < 0.6)) moving = true; }
            else if (home) { x = hx; y = hy; vx = 0; vy = 0; }
            // Off home and slow: still travelling back unless a resting pointer holds it in balance.
            else if (!held) moving = true;
            dots[j] = x; dots[j + 1] = y; dots[j + 2] = vx; dots[j + 3] = vy;
          }
        } else if (!live) { x = hx; y = hy; }
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, TAU);
      }
      ctx.fill();
      if (grainTile && o.grain > 0) {
        ctx.globalAlpha = Math.min(1, o.grain) * 0.09;
        ctx.globalCompositeOperation = "overlay";
        const pattern = ctx.createPattern(grainTile, "repeat");
        if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(0, 0, w, h); }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      // Sleep once everything is home (or held by a resting pointer) and no ring is running; the next move wakes it. A
      // frame too early for a physics step (a fast display) decides nothing: the next one does.
      awake = visible && (moving || nr > 0 || (live && !steps));
      if (!awake) { last = 0; acc = 0; }
    };

    const loop = now => {
      raf = 0;
      if (!visible || !alive) return;
      draw(now);
      if (awake) raf = requestAnimationFrame(loop);
    };
    // Only a field on screen runs; one off screen is drawn at rest and picks up again when it scrolls in.
    const wake = () => { if (!visible || !alive) return; awake = true; if (!raf) raf = requestAnimationFrame(loop); };

    /* The pointer is followed across the whole page: a field feels it wherever it is (dots only move within the
       radius) and only wakes when it comes within reach, or has just left it. */
    let cx = NaN, cy = NaN, near = false;
    const locate = () => {
      const b = canvas.getBoundingClientRect(), reach = o.radius * PHYSICS.pressReach + 8;
      px = cx - b.left; py = cy - b.top;
      const was = near;
      near = px > -reach && px < b.width + reach && py > -reach && py < b.height + reach;
      if (!near) { px = py = -1e5; }
      return near || was;
    };
    const onMove = e => {
      if (still) return;
      lastInput = performance.now();
      if (lastCX === lastCX) { mdx += e.clientX - lastCX; mdy += e.clientY - lastCY; }
      lastCX = cx = e.clientX; lastCY = cy = e.clientY;
      if (visible && locate()) wake(); else mdx = mdy = 0;
    };
    const onLeave = () => { px = py = -1e5; cx = cy = lastCX = lastCY = NaN; mdx = mdy = 0; near = false; pressed = false; lastInput = performance.now(); wake(); };
    // The page scrolled under a resting pointer: the field slid beneath it.
    const onScroll = () => { if (!still && cx === cx && visible && locate()) { lastInput = performance.now(); wake(); } };
    const onDown = e => {
      if (still || e.button > 0) return;
      lastCX = cx = e.clientX; lastCY = cy = e.clientY;
      pressed = true; lastInput = performance.now();
      // A field off screen takes no ring: it is at rest when it scrolls in.
      if (!visible) return;
      const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      // A ring runs through every field it can reach before it fades.
      const far = PHYSICS.ringSpeed * PHYSICS.ringLife;
      const ox = Math.max(0, -x, x - b.width), oy = Math.max(0, -y, y - b.height);
      if (ox * ox + oy * oy < far * far) {
        rings.push({ x, y, t: performance.now() });
        if (rings.length > PHYSICS.rings) rings.shift();
      }
      locate();
      wake();
    };
    // A finger lifted leaves nothing behind; a mouse stays where it is, now unpressed.
    const onUp = e => { pressed = false; lastInput = performance.now(); if (e.pointerType && e.pointerType !== "mouse") onLeave(); else wake(); };
    const onOut = e => { if (!e.relatedTarget) onLeave(); };

    layout();
    draw(performance.now());

    // Scroll scatter: how far the element has scrolled up out of view, 0 at rest to 1 once it is gone.
    const onScatter = () => {
      if (still) return;
      const b = root.getBoundingClientRect();
      const p = b.height > 0 ? Math.max(0, Math.min(1, -b.top / b.height)) : 0;
      if (p !== spread) { spread = p; wake(); }
    };
    if (o.scatter > 0) { window.addEventListener("scroll", onScatter, { passive: true }); onScatter(); }

    // Every dot home, nothing pressed, no ring running.
    const rest = () => {
      const S = o.scatter * spread;
      for (let i = 0; i < count; i++) { const j = i * 7; dots[j] = dots[j + 4] + dirs[i * 2] * S; dots[j + 1] = dots[j + 5] + dirs[i * 2 + 1] * S; dots[j + 2] = dots[j + 3] = 0; }
      rings = []; last = 0; acc = 0; mdx = mdy = 0; px = py = -1e5; near = false;
    };
    const onMotionPref = () => { still = motionQ.matches; pressed = false; rest(); draw(performance.now()); awake = false; wake(); };
    const on = (t, type, fn) => t.addEventListener(type, fn, { passive: true });
    const off = (t, type, fn) => t.removeEventListener(type, fn, { passive: true });
    if (motionQ.addEventListener) motionQ.addEventListener("change", onMotionPref);
    // Listened to whenever the field is interactive; under reduced motion every handler returns at once.
    if (o.interactive) {
      on(document, "pointermove", onMove);
      on(document, "pointerdown", onDown);
      on(document, "pointerup", onUp);
      on(document, "pointercancel", onUp);
      on(document, "pointerout", onOut);
      on(window, "blur", onLeave);
      on(window, "scroll", onScroll);
    }
    // A layout clears the canvas (it is resized): draw at once, on screen or not, so a field off screen is never left
    // blank until it scrolls into view.
    const ro = new ResizeObserver(() => { layout(); draw(performance.now()); wake(); });
    ro.observe(root);
    // Scrolled out of view: put every dot home, so the field is at rest when it comes back.
    const io = new IntersectionObserver(entries => {
      visible = entries[0] ? entries[0].isIntersecting : true;
      if (visible) { if (cx === cx && !still) locate(); wake(); return; }
      rest();
      draw(performance.now());
      awake = false;
    });
    io.observe(root);
    // The wordmark is set in the page's web font once it has landed.
    if (document.fonts && document.fonts.load) {
      document.fonts.load(o.fontWeight + " 100px " + o.fontFamily).catch(() => {}).then(() => { if (alive) { layout(); draw(performance.now()); wake(); } });
    }

    const api = {
      root, canvas, options: o,
      relayout() { layout(); draw(performance.now()); wake(); },
      /* A ring at (clientX, clientY), viewport coordinates, as a press there would send. */
      ring(clientX, clientY) {
        if (!o.interactive || still || !visible) return;
        const b = canvas.getBoundingClientRect();
        rings.push({ x: clientX - b.left, y: clientY - b.top, t: performance.now() });
        if (rings.length > PHYSICS.rings) rings.shift();
        wake();
      },
      /* True while any dot is away from home or a ring is running. */
      get moving() { return awake; },
      destroy() {
        alive = false;
        if (o.scatter > 0) window.removeEventListener("scroll", onScatter);
        cancelAnimationFrame(raf);
        ro.disconnect(); io.disconnect();
        if (motionQ.removeEventListener) motionQ.removeEventListener("change", onMotionPref);
        if (o.interactive) {
          off(document, "pointermove", onMove);
          off(document, "pointerdown", onDown);
          off(document, "pointerup", onUp);
          off(document, "pointercancel", onUp);
          off(document, "pointerout", onOut);
          off(window, "blur", onLeave);
          off(window, "scroll", onScroll);
        }
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

  window.InsidirHalftone = Object.assign(window.InsidirHalftone || {}, { mount, auto, hex, radius, step, ringPush, fitSize, wordFit, PRESET, PHYSICS });
})();
