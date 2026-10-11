/* Insidir motion engine.
   Declarative scroll animation driven by data attributes:

   data-reveal="up|down|left|right|scale|blur|fade|mask|mask-x|card"  animate in once visible
   data-delay="120"            extra delay (ms) for a reveal / split / draw
   data-stagger="90"           on a parent: children with data-reveal get increasing delays
   data-split                  heading words rise out of a mask
   data-count                  number in the element's text counts up to its final value
   data-draw                   svg path.line strokes draw in (path.area / .area fades in)
   data-rule="x|y"             divider grows in
   data-parallax="0.2"         translateY by speed x distance from viewport centre
   data-parallax-x="-0.1"      same on the X axis
   data-progress="travel|exit|enter|pin"  sets --p (0..1) on the element for CSS-driven scrubbing
                               (pin: 0 when the element's top reaches the viewport top, 1 when its bottom
                                reaches the viewport bottom — use on a tall wrapper around a sticky stage)
   data-words                  splits text into <span class="w" style="--i:n"> words and sets --n on the
                               element, for per-word scrubbing in CSS together with --p
   html --vel                  smoothed scroll velocity, -1..1 (for skew / stretch effects)
   data-magnetic               element follows the pointer a little on hover
   body[data-smooth]           inertial wheel scrolling (desktop pointer only)

   Everything is skipped under prefers-reduced-motion; content is never hidden without JS. */
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const vh = () => window.innerHeight || root.clientHeight;

  /* ---------- page ready curtain ---------- */
  const pending = new Set();
  function ready() {
    if (root.classList.contains("is-ready")) return;
    root.classList.add("is-ready");
    // Reveals that intersected before the page faded in start now, so their stagger is seen.
    setTimeout(() => { pending.forEach(reveal); pending.clear(); }, 80);
  }
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  document.addEventListener("DOMContentLoaded", () => {
    Promise.race([fontsReady, new Promise(r => setTimeout(r, 900))]).then(() => requestAnimationFrame(ready));
  });
  setTimeout(ready, 2000);

  /* ---------- split text into masked words ---------- */
  function splitText(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";
    let index = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            const outer = document.createElement("span");
            outer.className = "split-word";
            const inner = document.createElement("span");
            inner.textContent = part;
            inner.style.setProperty("--wi", index++);
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    walk(el);
  }

  /* ---------- words for scroll-scrubbed reading effects ---------- */
  function splitWords(el) {
    if (el.dataset.wordsDone) return;
    el.dataset.wordsDone = "1";
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span");
            w.className = "w";
            w.textContent = part;
            w.style.setProperty("--i", i++);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "BR") walk(child);
      });
    };
    walk(el);
    el.style.setProperty("--n", i);
  }

  /* ---------- count-up numbers ---------- */
  function prepareCount(el) {
    const final = el.dataset.countFinal || el.textContent.trim();
    el.dataset.countFinal = final;
    const m = final.match(/-?[\d,]*\.?\d+/);
    if (!m) return null;
    const numStr = m[0];
    const decimals = (numStr.split(".")[1] || "").length;
    const value = parseFloat(numStr.replace(/,/g, ""));
    const grouped = numStr.includes(",") || Math.abs(value) >= 10000;
    return { final, prefix: final.slice(0, m.index), suffix: final.slice(m.index + numStr.length), value, decimals, grouped };
  }
  function runCount(el) {
    const c = prepareCount(el);
    if (!c || reduce) return;
    const from = parseFloat(el.dataset.countFrom || "0");
    const dur = parseFloat(el.dataset.countDuration || "1700");
    const delay = parseFloat(el.dataset.delay || "0");
    const fmt = v => {
      const s = Math.abs(v).toFixed(c.decimals);
      const [i, d] = s.split(".");
      const int = c.grouped ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : i;
      return (v < 0 && !c.prefix.includes("-") ? "-" : "") + int + (d ? "." + d : "");
    };
    const start = performance.now() + delay;
    el.textContent = c.prefix + fmt(from) + c.suffix;
    const tick = now => {
      const t = clamp((now - start) / dur);
      const e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = t === 1 ? c.final : c.prefix + fmt(from + (c.value - from) * e) + c.suffix;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- svg line drawing ---------- */
  function prepareDraw(el) {
    el.querySelectorAll("path.line").forEach(p => {
      try {
        // Set the real length without animating from the CSS fallback, which would flash a stray segment.
        p.style.transition = "none";
        p.style.setProperty("--len", Math.ceil(p.getTotalLength()) + 1);
        void p.getBoundingClientRect();
        p.style.transition = "";
      } catch (_) { /* not rendered yet */ }
    });
  }

  /* ---------- reveal observer ---------- */
  function reveal(el) {
    el.classList.add("is-in");
    if (el.hasAttribute("data-count") && !el.dataset.counted) { el.dataset.counted = "1"; runCount(el); }
  }
  // Mask reveals start fully clipped, and a fully clipped element never reports as
  // intersecting, so they are triggered by their parent instead.
  const maskHosts = new Map();
  const io = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const el = entry.target;
      const targets = [...(maskHosts.get(el) || [])];
      if (el.hasAttribute("data-observed")) targets.push(el);
      if (entry.isIntersecting) {
        targets.forEach(t => { if (root.classList.contains("is-ready")) reveal(t); else pending.add(t); });
        if (!el.hasAttribute("data-reveal-repeat")) { io.unobserve(el); maskHosts.delete(el); }
      } else if (el.hasAttribute("data-reveal-repeat")) {
        targets.forEach(t => t.classList.remove("is-in"));
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }) : null;

  /* Elements already on screen but inside the bottom margin of a page that
     cannot scroll would never intersect; reveal them once the page settles. */
  function revealStragglers() {
    const h = vh();
    document.querySelectorAll("[data-observed]:not(.is-in)").forEach(el => {
      if (el.hasAttribute("data-reveal-repeat")) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.top < h && r.bottom > 0) {
        if (io) io.unobserve(el);
        if (root.classList.contains("is-ready")) reveal(el); else pending.add(el);
      }
    });
  }

  function applyDelay(el, ms) {
    if (ms) el.style.setProperty("--delay", (ms / 1000).toFixed(3) + "s");
  }

  function observe(scope = document) {
    scope.querySelectorAll("[data-stagger]").forEach(parent => {
      const step = parseFloat(parent.dataset.stagger) || 90;
      const base = parseFloat(parent.dataset.delay || "0");
      [...parent.querySelectorAll("[data-reveal],[data-split],[data-draw],[data-rule]")]
        .filter(c => c.closest("[data-stagger]") === parent)
        .forEach((child, i) => { if (!child.dataset.delay) applyDelay(child, base + i * step); });
    });
    scope.querySelectorAll("[data-delay]").forEach(el => {
      if (!el.hasAttribute("data-stagger")) applyDelay(el, parseFloat(el.dataset.delay));
    });
    scope.querySelectorAll("[data-split]").forEach(splitText);
    scope.querySelectorAll("[data-words]").forEach(splitWords);
    scope.querySelectorAll("[data-draw]").forEach(prepareDraw);
    const targets = scope.querySelectorAll("[data-reveal],[data-split],[data-draw],[data-rule],[data-count]");
    targets.forEach(el => {
      if (el.dataset.observed) return;
      el.dataset.observed = "1";
      if (reduce || !io) {
        el.classList.add("is-in");
        return;
      }
      if (/^mask/.test(el.getAttribute("data-reveal") || "") && el.parentElement) {
        const host = el.parentElement;
        if (!maskHosts.has(host)) maskHosts.set(host, []);
        maskHosts.get(host).push(el);
        io.observe(host);
        return;
      }
      io.observe(el);
    });
    collectScrollTargets(scope);
  }

  /* ---------- scroll-linked effects ---------- */
  let parallaxEls = [], progressEls = [];
  function collectScrollTargets(scope = document) {
    if (reduce) return;
    scope.querySelectorAll("[data-parallax],[data-parallax-x]").forEach(el => {
      if (!parallaxEls.includes(el)) parallaxEls.push(el);
    });
    scope.querySelectorAll("[data-progress]").forEach(el => {
      if (!progressEls.includes(el)) progressEls.push(el);
    });
  }

  const nav = () => document.querySelector(".site-nav");
  const progressBar = () => document.querySelector(".scroll-progress");
  let lastY = window.scrollY, navEl = null, barEl = null, ticking = false;

  function frame() {
    ticking = false;
    const y = window.scrollY, h = vh();
    navEl = navEl || nav();
    barEl = barEl || progressBar();

    if (navEl) {
      const threshold = parseFloat(navEl.dataset.solidAfter || "24");
      navEl.classList.toggle("is-scrolled", y > threshold);
      if (!navEl.classList.contains("is-open")) {
        const goingDown = y > lastY + 2, goingUp = y < lastY - 2;
        if (goingDown && y > h * 0.9) navEl.classList.add("is-hidden");
        else if (goingUp || y < h * 0.5) navEl.classList.remove("is-hidden");
      }
    }
    if (barEl) {
      const max = root.scrollHeight - h;
      barEl.style.setProperty("--progress", max > 0 ? (y / max).toFixed(4) : 0);
    }
    for (const el of parallaxEls) {
      const r = (el.parentElement || el).getBoundingClientRect();
      if (r.bottom < -h * 0.5 || r.top > h * 1.5) continue;
      const offset = (r.top + r.height / 2) - h / 2;
      const sy = parseFloat(el.dataset.parallax || "0");
      const sx = parseFloat(el.dataset.parallaxX || "0");
      const scale = parseFloat(el.dataset.parallaxScale || "1");
      el.style.transform = `translate3d(${(-offset * sx).toFixed(1)}px,${(-offset * sy).toFixed(1)}px,0)` + (scale !== 1 ? ` scale(${scale})` : "");
    }
    for (const el of progressEls) {
      const r = el.getBoundingClientRect();
      const mode = el.dataset.progress || "travel";
      let p;
      if (mode === "exit") p = -r.top / Math.max(1, r.height);
      else if (mode === "pin") p = -r.top / Math.max(1, r.height - h);
      else if (mode === "enter") p = (h - r.top) / (h * parseFloat(el.dataset.progressSpan || "0.75"));
      else p = (h - r.top) / (h + r.height);
      el.style.setProperty("--p", clamp(p).toFixed(4));
    }
    trackVelocity(y);
    lastY = y;
  }
  let vel = 0, velY = window.scrollY, velT = performance.now(), velRaf = 0;
  function trackVelocity(y) {
    if (reduce) return;
    const now = performance.now(), dt = Math.max(8, now - velT);
    const raw = clamp((y - velY) / dt / 3, -1, 1);   // ~3px per ms of scroll = full strength
    vel += (raw - vel) * 0.25;
    velY = y; velT = now;
    root.style.setProperty("--vel", vel.toFixed(3));
    cancelAnimationFrame(velRaf);
    const settle = () => {                           // ease back to rest once scrolling stops
      vel *= 0.86;
      if (Math.abs(vel) < 0.002) vel = 0;
      root.style.setProperty("--vel", vel.toFixed(3));
      velT = performance.now(); velY = window.scrollY;
      if (vel) velRaf = requestAnimationFrame(settle);
    };
    velRaf = requestAnimationFrame(settle);
  }
  function requestFrame() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }
  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener("resize", requestFrame);

  /* ---------- inertial wheel scrolling ---------- */
  const smooth = {
    enabled: false, target: 0, current: 0, running: false, ease: 0.095,
    max() { return root.scrollHeight - vh(); },
    start() {
      if (this.running) return;
      this.running = true;
      const step = () => {
        this.current += (this.target - this.current) * this.ease;
        if (Math.abs(this.target - this.current) < 0.4) this.current = this.target;
        window.scrollTo(0, this.current);
        if (this.current !== this.target) requestAnimationFrame(step);
        else this.running = false;
      };
      requestAnimationFrame(step);
    },
    to(y) {
      this.target = clamp(y, 0, this.max());
      if (!this.running) this.current = window.scrollY;
      this.start();
    }
  };
  function scrollableAncestor(node, dy) {
    while (node && node !== document.body && node !== root) {
      if (node.nodeType === 1) {
        const s = getComputedStyle(node);
        if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight + 24) {
          if ((dy > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) || (dy < 0 && node.scrollTop > 0)) return node;
        }
      }
      node = node.parentNode;
    }
    return null;
  }
  function enableSmooth() {
    if (reduce || !finePointer || !document.body || !document.body.hasAttribute("data-smooth")) return;
    smooth.enabled = true;
    root.classList.add("has-smooth");
    smooth.target = smooth.current = window.scrollY;
    window.addEventListener("wheel", e => {
      if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (scrollableAncestor(e.target, e.deltaY)) return;
      if (document.querySelector(".site-nav.is-open")) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh() : 1;
      if (!smooth.running) smooth.current = smooth.target = window.scrollY;
      smooth.target = clamp(smooth.target + e.deltaY * unit, 0, smooth.max());
      smooth.start();
    }, { passive: false });
    window.addEventListener("scroll", () => {
      if (!smooth.running) smooth.target = smooth.current = window.scrollY;
    }, { passive: true });
  }

  /* Keyboard focus must never land on something still waiting to animate in. */
  document.addEventListener("focusin", e => {
    let node = e.target;
    while (node && node !== document.body) {
      if (node.nodeType === 1 && node.hasAttribute("data-observed") && !node.classList.contains("is-in")) {
        node.style.setProperty("--delay", "0s");
        if (io) io.unobserve(node);
        pending.delete(node);
        reveal(node);
      }
      node = node.parentNode;
    }
  });

  /* ---------- anchor links glide to their section ---------- */
  function scrollToTarget(target) {
    // Marketing nav auto-hides on scroll, so it only needs a partial offset; the sticky product header always covers the top.
    const site = nav(), app = document.querySelector(".app-header");
    const offset = target.dataset.scrollOffset ? parseFloat(target.dataset.scrollOffset)
      : app ? app.offsetHeight + 24
      : site ? site.offsetHeight * 0.6 : 0;
    const y = target.getBoundingClientRect().top + window.scrollY - offset;
    if (smooth.enabled) smooth.to(y);
    else window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  }
  document.addEventListener("click", e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    scrollToTarget(target);
    history.replaceState(null, "", id);
    // Keep keyboard and screen-reader position in step with the scroll (skip links, contents lists).
    if (!target.matches("a,button,input,select,textarea,[tabindex]")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });

  /* ---------- magnetic hover ---------- */
  function magnetic(scope = document) {
    if (reduce || !finePointer) return;
    scope.querySelectorAll("[data-magnetic]").forEach(el => {
      if (el.dataset.magnetBound) return;
      el.dataset.magnetBound = "1";
      const strength = parseFloat(el.dataset.magnetic || "0.25");
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * strength;
        const y = (e.clientY - r.top - r.height / 2) * strength;
        el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* Runs at DOMContentLoaded so that deferred page scripts (which render
     dynamic markup when they execute) are picked up in the first pass. */
  let started = false;
  function init() {
    if (started) return;
    started = true;
    observe(document);
    magnetic(document);
    enableSmooth();
    frame();
    setTimeout(revealStragglers, 1200);
    window.addEventListener("load", () => setTimeout(revealStragglers, 300));
  }
  if (document.readyState === "complete") init();
  else {
    document.addEventListener("DOMContentLoaded", init);
    window.addEventListener("load", init);
  }

  window.Insidir = Object.assign(window.Insidir || {}, {
    reduceMotion: reduce,
    observe(scope) { observe(scope); magnetic(scope); requestFrame(); },
    countUp: runCount,
    scrollTo(target) { scrollToTarget(typeof target === "string" ? document.querySelector(target) : target); },
    refresh: requestFrame
  });
})();
