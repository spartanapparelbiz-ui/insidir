/* Insidir V13 halftone engine.
   A wordmark set enormous and cropped by the bottom edge, printed as a field of
   halftone dots: each dot is sized by how much of the letter covers its cell, so
   the type keeps its edges at any size. Move across it and the dots part around
   the pointer on springs, warming toward the accent as they are pushed off their
   place; click and a shock ring runs through the word. The same engine draws a
   plain dot field (data-halftone-field) behind the landing hero.

   Plain JavaScript port of the Halftone Wordmark Footer React component so it
   runs under the site's no-build, same-origin Content-Security-Policy. The word is
   printed once, in the landing page's first screen (data-halftone-hero). Colours
   come from the --hwf-bg / --hwf-ink / --hwf-warm custom properties on the root
   element (set by v13-halftone.css), so the theme owns them. */
(() => {
  "use strict";

  const PRESET = { background: "#0c0c0b", ink: "#e9e4da", warm: "#e9762b" };
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

  /** One step of a dot's spring back to home plus the push from a pointer at (px, py) within r. */
  function step(x, y, vx, vy, hx, hy, px, py, r) {
    const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
    if (r > 0 && d2 < r * r) {
      const d = Math.sqrt(d2) + 0.001;
      const f = (1 - d / r) * 2.6;
      vx += (dx / d) * f;
      vy += (dy / d) * f;
    }
    vx = (vx + (hx - x) * 0.05) * 0.84;
    vy = (vy + (hy - y) * 0.05) * 0.84;
    return [x + vx, y + vy, vx, vy];
  }

  /** How warm a dot is drawn: 0 at home, 1 once it is `span` px or more away. */
  function warmth(x, y, hx, hy, span) {
    const d = Math.hypot(x - hx, y - hy);
    return span > 0 ? Math.min(1, d / span) : 0;
  }

  /** Font size that sets `measured` (width at 100px) to fill `width` exactly. */
  function fitSize(measured, width) {
    return measured > 0 ? (width / measured) * 100 : 0;
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
        ink: v("--hwf-ink") || PRESET.ink,
        warm: v("--hwf-warm") || PRESET.warm
      },
      dotGap: num("dotGap", field ? 11 : 6),
      radius: num("radius", field ? 110 : 80),
      crop: num("crop", 0.2),
      grain: num("grain", field ? 0 : 0.5),
      fieldCoverage: num("fieldCoverage", 0.12),
      interactive: d.interactive !== "false",
      fontWeight: d.fontWeight || "800",
      fontFamily: d.fontFamily || v("--hwf-font") || SANS_STACK,
      letterSpacing: d.letterSpacing || "-0.045em",
      // The field sits behind content that receives the pointer, so listen on its parent.
      pointerHost: field ? root.parentElement : root
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
    const ink = hex(o.colors.ink) || hex(PRESET.ink);
    const warm = hex(o.colors.warm) || hex(PRESET.warm);

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
        if ("letterSpacing" in m) m.letterSpacing = o.letterSpacing;
        m.font = o.fontWeight + " 100px " + o.fontFamily;
        const word = o.wordmark || " ";
        const fit = fitSize(m.measureText(word).width, w * 1.02);
        m.font = o.fontWeight + " " + fit + "px " + o.fontFamily;
        const box = m.measureText(word);
        const cap = box.actualBoundingBoxAscent || fit * 0.72;
        const c = Math.max(0, Math.min(0.6, o.crop));
        m.fillStyle = "#000";
        m.textBaseline = "alphabetic";
        m.fillText(word, (w - box.width) / 2, h + cap * c);
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

    const draw = now => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = o.colors.background;
      ctx.fillRect(0, 0, w, h);
      const r = o.interactive && !still ? Math.max(0, o.radius) : 0;
      const ringAge = ring.t < 0 ? 1e9 : now - ring.t;
      const ringR = ringAge * 0.9;
      let moving = false;
      for (let i = 0; i < count; i++) {
        const j = i * 7;
        let x = dots[j], y = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3];
        const hx = dots[j + 4], hy = dots[j + 5];
        if (!still) {
          if (ringAge < 900) {
            const dx = hx - ring.x, dy = hy - ring.y;
            const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
            const band = 1 - Math.min(1, Math.abs(d - ringR) / 26);
            if (band > 0) {
              const f = band * 3.2 * (1 - ringAge / 900);
              vx += (dx / d) * f; vy += (dy / d) * f;
            }
          }
          const s = step(x, y, vx, vy, hx, hy, px, py, r);
          x = s[0]; y = s[1]; vx = s[2]; vy = s[3];
          if (Math.abs(vx) + Math.abs(vy) > 0.02 || Math.abs(x - hx) + Math.abs(y - hy) > 0.05) moving = true;
          else { x = hx; y = hy; vx = 0; vy = 0; }
          dots[j] = x; dots[j + 1] = y; dots[j + 2] = vx; dots[j + 3] = vy;
        }
        const k = warmth(x, y, hx, hy, 28);
        ctx.fillStyle = k > 0.02
          ? "rgb(" + Math.round(ink[0] + (warm[0] - ink[0]) * k) + "," + Math.round(ink[1] + (warm[1] - ink[1]) * k) + "," + Math.round(ink[2] + (warm[2] - ink[2]) * k) + ")"
          : o.colors.ink;
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
      // Sleep once everything is home and nothing is pushing.
      awake = moving || ringAge < 900 || px > -1e4;
    };

    const loop = now => {
      raf = 0;
      if (!visible || !alive) return;
      draw(now);
      if (awake) raf = requestAnimationFrame(loop);
    };
    const wake = () => { awake = true; if (!raf && visible && alive) raf = requestAnimationFrame(loop); };

    const toLocal = e => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const onMove = e => { if (!o.interactive) return; const p = toLocal(e); px = p[0]; py = p[1]; wake(); };
    const onLeave = () => { px = -1e5; py = -1e5; wake(); };
    const onDown = e => {
      if (!o.interactive || still) return;
      if (e.target && e.target.closest && e.target.closest("a,button,input,select,textarea")) return;
      const p = toLocal(e);
      ring = { x: p[0], y: p[1], t: performance.now() };
      wake();
    };

    layout();
    draw(performance.now());
    wake();

    const host = o.pointerHost || root;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);
    const ro = new ResizeObserver(() => { layout(); wake(); });
    ro.observe(root);
    const io = new IntersectionObserver(entries => { visible = entries[0] ? entries[0].isIntersecting : true; if (visible) wake(); });
    io.observe(root);
    // The wordmark is set in the page's web font once it has landed.
    if (document.fonts && document.fonts.load) {
      document.fonts.load(o.fontWeight + " 100px " + o.fontFamily).catch(() => {}).then(() => { if (alive) { layout(); wake(); } });
    }

    const api = {
      root, canvas, options: o,
      relayout() { layout(); wake(); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        ro.disconnect(); io.disconnect();
        host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerleave", onLeave);
        host.removeEventListener("pointerdown", onDown);
        delete root.__halftone;
      }
    };
    root.__halftone = api;
    return api;
  }

  /* ---------- auto-mount ---------- */

  function auto() {
    document.querySelectorAll("[data-halftone-hero],[data-halftone-footer],[data-halftone-field]").forEach(el => mount(el));
    document.querySelectorAll(".hwf-up").forEach(btn => {
      if (btn.__bound) return;
      btn.__bound = true;
      btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }));
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();

  window.InsidirHalftone = Object.assign(window.InsidirHalftone || {}, { mount, auto, hex, radius, step, warmth, fitSize, PRESET });
})();
