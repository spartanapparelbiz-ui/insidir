/* Landing scroll effects (end): Built on official records · Pricing · FAQ · Final CTA, plus the landing cursor.
   The scroll scrubbing itself is CSS on motion.js's --p / --vel (fx-end.css). This file only:
   - switches the effects on (html.fxe-on, html.fxe-desk) when motion is allowed,
   - sizes each scene's progress span so it always completes before the page runs out of scroll,
   - drives the outlined records marquee (scroll position, running faster the faster you scroll),
   - marks the pricing scene as landed (badge drop + sheen),
   - keeps keyboard-focused content at rest,
   - runs the cursor follower (fine pointers only).
   One rAF loop for all of it; it stops as soon as nothing is moving. No layout reads while scrolling. */
(() => {
  const root = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const deskQuery = matchMedia("(min-width: 900px) and (min-height: 560px)");
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const records = document.querySelector(".records");
  const pricing = document.querySelector(".pricing");
  const cta = document.querySelector(".cta");
  const scenes = [records, pricing, cta].filter(Boolean);
  const track = records && records.querySelector(".records__track");

  root.classList.add("fxe-on");
  const setDeskMode = () => root.classList.toggle("fxe-desk", deskQuery.matches && (finePointer.matches || innerWidth >= 1200));
  setDeskMode();

  /* ---------- one loop ---------- */
  let raf = 0, lastT = 0;
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  function tick(now) {
    raf = 0;
    const dt = lastT ? Math.min(64, Math.max(1, now - lastT)) : 16;
    lastT = now;
    let again = false;
    if (cursor && cursor.step(dt)) again = true;
    if (scrollDirty) { scrollDirty = false; scrolled(); }
    if (again) kick(); else lastT = 0;
  }

  /* ---------- layout metrics (measured on load / resize, never while scrolling) ---------- */
  let vh = innerHeight, recTop = 0, recH = 0, phraseW = 0, lastY = scrollY, boost = 0;
  const docTop = el => el.getBoundingClientRect().top + scrollY;
  function measure() {
    vh = innerHeight;
    const maxScroll = Math.max(0, root.scrollHeight - vh);
    // motion.js "enter": p = (vh - top) / (vh * span). Make p reach 1 a little before the page bottom.
    const fit = (el, want) => {
      const topAtEnd = docTop(el) - maxScroll;
      const room = (vh - topAtEnd - 28) / vh;
      el.dataset.progressSpan = clamp(Math.min(want, room), 0.18, 1.5).toFixed(3);
    };
    if (records) fit(records, 0.76);
    if (pricing) fit(pricing, 0.74);
    if (cta) fit(cta, 9);                               // the portal finishes opening at the bottom of the page
    if (records) { recTop = docTop(records); recH = records.offsetHeight; }
    if (track) {
      const first = track.firstElementChild;
      phraseW = first ? first.offsetWidth : 0;
      // enough copies that the band never runs out at any width
      while (phraseW && track.children.length < 8 && phraseW * (track.children.length - 1) < innerWidth * 1.2) {
        track.appendChild(first.cloneNode(true));
      }
    }
    if (window.Insidir && Insidir.refresh) Insidir.refresh();
    scrollDirty = true;
    kick();
  }
  let measureQueued = 0;
  const queueMeasure = () => { if (!measureQueued) measureQueued = requestAnimationFrame(() => { measureQueued = 0; measure(); }); };

  /* ---------- scroll-driven bits ---------- */
  let scrollDirty = true;
  const velocity = () => parseFloat(root.style.getPropertyValue("--vel")) || 0;
  const progressOf = el => el.classList.contains("fxe-lock") ? 1 : (parseFloat(el.style.getPropertyValue("--p")) || 0);
  function scrolled() {
    const y = scrollY, dy = y - lastY;
    lastY = y;
    // marquee: drifts with scroll progress, and runs ahead the faster the page is moving (--vel)
    if (track && phraseW) {
      boost += dy * 0.42 * 2.6 * Math.abs(velocity());
      if (y + vh > recTop - vh * 0.25 && y < recTop + recH + vh * 0.25) {
        let x = ((y + vh - recTop) * 0.42 + boost) % phraseW;
        if (x < 0) x += phraseW;
        track.style.transform = `translate3d(${(-x).toFixed(1)}px,0,0)`;
      }
    }
    // pricing lands: "Most popular" drops in and a sheen crosses the Pro card (replays after scrolling back up)
    if (pricing) {
      const p = progressOf(pricing);
      if (p >= 0.84) pricing.classList.add("fxe-landed");
      else if (p <= 0.3) pricing.classList.remove("fxe-landed");
    }
    // a scene held at rest for keyboard focus is released once focus has left and its own progress agrees
    scenes.forEach(s => {
      if (!s.classList.contains("fxe-lock") || s.contains(document.activeElement)) return;
      const p = parseFloat(s.style.getPropertyValue("--p")) || 0;
      if (p >= 0.98 || p <= 0.02) s.classList.remove("fxe-lock");
    });
  }
  addEventListener("scroll", () => { scrollDirty = true; kick(); }, { passive: true });

  /* content never sits mid-animation while it has keyboard focus */
  document.addEventListener("focusin", e => {
    const t = e.target;
    let keyboard = true;
    try { keyboard = t.matches(":focus-visible"); } catch (_) { /* old engines: assume keyboard */ }
    if (!keyboard) return;
    scenes.forEach(s => { if (s.contains(t)) s.classList.add("fxe-lock"); });
    scrollDirty = true;
    kick();
  });

  /* ---------- cursor follower ---------- */
  const cursor = finePointer.matches ? createCursor() : null;

  function createCursor() {
    const make = cls => {
      const el = document.createElement("div");
      el.className = "fxe-cursor " + cls;
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
      return el;
    };
    const disc = make("fxe-cursor--disc");
    disc.innerHTML = '<span class="fxe-cursor__in">View</span>';
    const ring = make("fxe-cursor--ring");
    const dot = make("fxe-cursor--dot");
    const all = [disc, ring, dot];

    const HIDE = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]),textarea,select,[contenteditable=""],[contenteditable="true"]';
    const HUG = ".btn,.site-nav__links a,.site-nav__signin,.site-nav__logo,.site-footer a";
    const LINK = "a[href],button,summary,label,[role='button']";
    // Only elements that actually open something get the "View" label (cards here are not links).
    const VIEW = "[data-cursor=view]";
    const PHOTO = ".hero__bg,.dark-band__bg,.cta__bg";

    let px = 0, py = 0, rx = 0, ry = 0, shown = false, mode = "", hug = null, moved = false, settleTimer = 0;

    const show = () => { if (!shown) { shown = true; all.forEach(el => el.classList.add("is-shown")); } };
    const hide = () => { if (shown) { shown = false; all.forEach(el => el.classList.remove("is-shown")); } };

    function setMode(next, target) {
      hug = null;
      if (next === "hug") {
        const r = target.getBoundingClientRect();
        const cs = getComputedStyle(target);
        const text = !target.classList.contains("btn");
        const padX = text ? 16 : 12, padY = text ? 10 : 12;
        const h = r.height + padY;
        const radius = text ? h / 2 : (parseFloat(cs.borderTopLeftRadius) || 0) + padY / 2;
        const strength = target.hasAttribute("data-magnetic") ? parseFloat(target.dataset.magnetic || "0.25") : 0;
        hug = { el: target, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, y0: scrollY,
          pull: strength ? strength / (1 + strength) : 0.08 };
        ring.style.setProperty("--fxw", (r.width + padX).toFixed(1) + "px");
        ring.style.setProperty("--fxh", h.toFixed(1) + "px");
        ring.style.setProperty("--fxr", radius.toFixed(1) + "px");
      } else if (mode === "hug") {
        ring.style.removeProperty("--fxw"); ring.style.removeProperty("--fxh"); ring.style.removeProperty("--fxr");
      }
      if (next === mode && next !== "hug") return;
      mode = next;
      ring.classList.toggle("is-hug", next === "hug");
      ring.classList.toggle("is-link", next === "link");
      ring.classList.toggle("is-view", next === "view");
      ring.classList.toggle("is-photo", next === "photo");
      disc.classList.toggle("is-view", next === "view");
      dot.classList.toggle("is-dim", next === "view");
      ring.style.opacity = dot.style.opacity = next === "text" ? "0" : "";
    }

    function classify(target) {
      if (!target || target.nodeType !== 1) { setMode("", null); return; }
      let el;
      if (target.closest(HIDE)) setMode("text", null);
      else if ((el = target.closest(HUG))) { if (!hug || hug.el !== el) setMode("hug", el); }
      else if (target.closest(LINK)) setMode("link", null);
      else if (target.closest(VIEW)) setMode("view", null);
      else if (target.closest(PHOTO)) setMode("photo", null);
      else setMode("", null);
    }

    addEventListener("pointermove", e => {
      if (e.pointerType && e.pointerType !== "mouse") { hide(); return; }
      px = e.clientX; py = e.clientY;
      if (!shown) { rx = px; ry = py; show(); classify(e.target); }
      moved = true;
      kick();
    }, { passive: true });
    document.addEventListener("pointerover", e => { if (!e.pointerType || e.pointerType === "mouse") classify(e.target); });
    document.addEventListener("mouseout", e => { if (!e.relatedTarget) hide(); });
    document.documentElement.addEventListener("mouseleave", hide);
    addEventListener("blur", hide);
    document.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") ring.classList.add("is-press"); });
    addEventListener("pointerup", () => ring.classList.remove("is-press"));

    // while scrolling the page moves under a still pointer: follow a hugged button, then re-check what is beneath
    addEventListener("scroll", () => {
      if (!shown) return;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => classify(document.elementFromPoint(px, py)), 140);
    }, { passive: true });

    return {
      step(dt) {
        if (!shown) return false;
        let tx = px, ty = py;
        if (hug) {
          const cy = hug.cy - (scrollY - hug.y0);
          if (Math.abs(px - hug.cx) > hug.w / 2 + 6 || Math.abs(py - cy) > hug.h / 2 + 6) setMode("", null);
          else { tx = hug.cx + (px - hug.cx) * hug.pull; ty = cy + (py - cy) * hug.pull; }
        }
        const k = 1 - Math.exp(-dt / (hug ? 55 : 85));
        rx += (tx - rx) * k;
        ry += (ty - ry) * k;
        const settled = Math.abs(tx - rx) < 0.1 && Math.abs(ty - ry) < 0.1;
        if (settled) { rx = tx; ry = ty; }
        const t = `translate3d(${rx.toFixed(2)}px,${ry.toFixed(2)}px,0) translate(-50%,-50%)`;
        ring.style.transform = t;
        disc.style.transform = t;
        if (moved) { dot.style.transform = `translate3d(${px}px,${py}px,0) translate(-50%,-50%)`; moved = false; }
        return !settled;
      }
    };
  }

  /* ---------- start ---------- */
  const onModeChange = () => { setDeskMode(); queueMeasure(); };
  [deskQuery, finePointer].forEach(q => q.addEventListener ? q.addEventListener("change", onModeChange) : q.addListener(onModeChange));
  addEventListener("resize", queueMeasure);
  addEventListener("load", queueMeasure);
  if ("ResizeObserver" in window) new ResizeObserver(queueMeasure).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueMeasure);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", queueMeasure);
  else queueMeasure();
})();
