/* Landing scroll effects (top): hero "doors to the city", ticker-board feature strip,
   "A more informed market" reading scene.

   Wide desktop viewports with motion allowed get html.fx-pin:
   - one tall wrapper (.fx-top, data-progress="pin") drives all three scenes from motion.js's --p;
   - the hero stays pinned while its photograph opens like a pair of doors: the image stack is
     cloned into left / centre / right slices clipped along the photo's own vertical edges;
   - the feature strip docks at the bottom of the first screen, then glides up over the stage
     followed by the informed band, which pins at the bottom of the screen and settles into its
     resting layout while the city stays in view above it.
   Scroll lengths depend on the band's height, measured on resize (never inside scroll handlers).
   Narrower screens and touch-first devices keep reveal-based versions; reduced motion changes nothing. */
(() => {
  const root = document.documentElement;
  const top = document.querySelector(".fx-top");
  if (!top || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const hero = top.querySelector(".hero");
  const strip = top.querySelector(".strip");
  const informed = top.querySelector(".informed");
  const stage = informed && informed.querySelector(".informed__stage");

  /* ---------- feature strip: titles roll up letter by letter like a ticker board ---------- */
  function tickerTitles() {
    strip && strip.querySelectorAll(".strip__title").forEach(title => {
      if (title.dataset.fxTicker) return;
      const text = title.textContent.trim();
      title.dataset.fxTicker = "1";
      const board = document.createElement("span");
      board.className = "fx-tk";
      board.setAttribute("aria-hidden", "true");
      let c = 0;
      text.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { board.appendChild(document.createTextNode(" ")); return; }
        const word = document.createElement("span");
        word.className = "fx-tk__w";
        [...part].forEach(ch => {
          const cell = document.createElement("span");
          cell.className = "fx-tk__c";
          cell.textContent = ch;
          cell.style.setProperty("--c", c++);
          word.appendChild(cell);
        });
        board.appendChild(word);
      });
      const label = document.createElement("span");
      label.className = "fx-sr";
      label.textContent = text;
      title.textContent = "";
      title.append(board, label);
      title.style.setProperty("--cn", c);
    });
    if (!strip) return;
    /* once the board has settled, the plain text comes back so the resting type is untouched */
    const items = [...strip.querySelectorAll(".strip__item")];
    const settle = item => {
      if (item.dataset.fxSettled) return;
      item.dataset.fxSettled = "1";
      const delay = parseFloat(getComputedStyle(item).getPropertyValue("--delay")) || 0;
      setTimeout(() => {
        item.querySelectorAll(".strip__title[data-fx-ticker]").forEach(title => {
          const label = title.querySelector(".fx-sr");
          if (label) title.textContent = label.textContent;
        });
        item.classList.add("fx-settled");
      }, delay * 1000 + 1700);
    };
    const mo = new MutationObserver(() => items.forEach(item => { if (item.classList.contains("is-in")) settle(item); }));
    items.forEach(item => mo.observe(item, { attributes: true, attributeFilter: ["class"] }));
  }
  tickerTitles();

  /* ---------- pinned desktop scenes ---------- */
  const pinQuery = matchMedia(
    "(min-width: 901px) and (min-height: 640px) and (hover: hover) and (pointer: fine)," +
    " (min-width: 1200px) and (min-height: 640px)"
  );
  if (!hero || !strip || !informed || !stage) return;

  let built = false;
  function buildSlices() {
    if (built) return;
    const frame = hero.querySelector(".hero__frame");
    const zoom = frame && frame.querySelector(".hero__zoom");
    if (!zoom) return;
    built = true;
    const layer = (cls, child) => {
      const el = document.createElement("div");
      el.className = "fx-slice " + cls;
      if (child) el.appendChild(child);
      return el;
    };
    const centre = layer("fx-slice--c");
    zoom.replaceWith(centre);
    centre.appendChild(zoom);
    const door = side => layer("fx-slice--" + side, zoom.cloneNode(true));
    const bloom = document.createElement("div");
    bloom.className = "fx-bloom";
    const left = door("l"), right = door("r");
    centre.appendChild(bloom);
    frame.append(left, right);
    /* clones join the load-in zoom exactly where the original is */
    try {
      const run = zoom.getAnimations()[0];
      if (run) [left, right].forEach(d => d.querySelector(".hero__zoom").getAnimations().forEach(a => { a.currentTime = run.currentTime; }));
    } catch (_) { /* Web Animations unavailable: clones simply start with the page */ }
  }

  /* the eyebrow spreads apart letter by letter (animating letter-spacing would reflow every frame).
     The original text stays in place for p = 0 and for assistive tech; an aria-hidden copy split
     into letters takes over as soon as the page scrolls. */
  function splitEyebrow() {
    const eyebrow = hero.querySelector(".hero__eyebrow");
    if (!eyebrow || eyebrow.dataset.fxSplit) return;
    eyebrow.dataset.fxSplit = "1";
    const text = eyebrow.textContent.trim();
    const src = document.createElement("span");
    src.className = "fx-ew-src";
    src.textContent = eyebrow.textContent;
    const chars = [...text];
    const mid = (chars.length - 1) / 2;
    const row = document.createElement("span");
    row.className = "fx-ew";
    row.setAttribute("aria-hidden", "true");
    let i = 0;
    text.split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) { row.appendChild(document.createTextNode(" ")); i += part.length; return; }
      const word = document.createElement("span");
      word.className = "fx-ew__w";
      [...part].forEach(ch => {
        const l = document.createElement("span");
        l.className = "fx-ew__l";
        l.textContent = ch;
        l.style.setProperty("--c", (i++ - mid).toFixed(1));
        word.appendChild(l);
      });
      row.appendChild(word);
    });
    eyebrow.textContent = "";
    eyebrow.append(src, row);
  }

  /* where "scroll to content" lands: the informed band at rest under the city */
  let mark = null;
  function ensureMark() {
    if (mark) return;
    mark = document.createElement("span");
    mark.className = "fx-top__mark";
    mark.setAttribute("aria-hidden", "true");
    mark.dataset.scrollOffset = "0";
    top.appendChild(mark);
  }

  let pinned = false, measuring = 0;
  function measure() {
    measuring = 0;
    const V = window.innerHeight;
    const S = strip.offsetHeight;
    const B = pinned ? stage.offsetHeight : informed.offsetHeight;
    // a band taller than most of the screen cannot rest under the city: keep the light version
    const fits = B + S <= V * 0.84;
    setPinned(pinQuery.matches && fits);
    if (!pinned) return;
    const Dh = Math.round(V * 1.05);       // doors
    const Di = Math.round(V * 0.74);       // informed pin
    const L = Dh + B + Di;                 // total scroll of the wrapper (its height minus one screen)
    const s = top.style;
    s.setProperty("--fx-b", B + "px");
    s.setProperty("--fx-dh", Dh + "px");
    s.setProperty("--fx-di", Di + "px");
    s.setProperty("--fx-a1", (Dh / L).toFixed(5));
    s.setProperty("--fx-a2", ((Dh + B) / L).toFixed(5));
    s.setProperty("--fx-ar", ((Dh + B + Di * 0.86) / L).toFixed(5));
    doorGeometry();
    if (window.Insidir && Insidir.refresh) Insidir.refresh();
  }

  /* The doors finish as dark panels framing the city at the same place on every screen shape:
     perspective scales with the photograph, and each door's slide is solved so its far edge lands
     at a fixed fraction of the stage (projection of a door of width w turned 60° away). */
  const TURN = 60 * Math.PI / 180, GROW = 1.45;
  function doorGeometry() {
    const frame = hero.querySelector(".hero__frame");
    if (!frame) return;
    const h = hero.getBoundingClientRect(), f = frame.getBoundingClientRect();
    const hw = h.width, fw = f.width, fl = f.left - h.left;
    if (!hw || !fw) return;
    const P = fw * 0.68, O = hw / 2;
    const solve = (hinge, w, dir, target) => {
      const z = -w * Math.sin(TURN), cx = dir * w * Math.cos(TURN);
      return (target - O) * (P - z) / P - cx - hinge + O;
    };
    const left = solve(fl, 0.252 * fw * GROW, 1, hw * 0.115);
    const right = solve(fl + fw, (1 - 0.719) * fw * GROW, -1, hw * 0.885);
    const s = frame.style;
    s.setProperty("--fx-persp", P.toFixed(1) + "px");
    s.setProperty("--fx-pox", (O - fl).toFixed(1) + "px");
    s.setProperty("--fx-dlx", left.toFixed(1) + "px");
    s.setProperty("--fx-drx", right.toFixed(1) + "px");
  }
  function setPinned(on) {
    if (on === pinned) return;
    pinned = on;
    if (on) { buildSlices(); splitEyebrow(); ensureMark(); }
    root.classList.toggle("fx-pin", on);
    updateLive();
  }
  const requestMeasure = () => { if (!measuring) measuring = requestAnimationFrame(measure); };

  /* At p = 0 the hero renders exactly as without effects; depth layers for the copy switch on
     once the page leaves the top (a class flip at that threshold only, no layout reads). */
  let live = null;
  function updateLive() {
    const on = pinned && window.scrollY > 1;
    if (on !== live) { live = on; top.classList.toggle("fx-live", on); }
  }
  window.addEventListener("scroll", updateLive, { passive: true });

  measure();
  window.addEventListener("resize", requestMeasure);
  if (pinQuery.addEventListener) pinQuery.addEventListener("change", requestMeasure);
  if ("ResizeObserver" in window) new ResizeObserver(requestMeasure).observe(stage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestMeasure);
  window.addEventListener("load", requestMeasure);

  /* the scroll cue plays the whole opening and lands on the first content */
  document.addEventListener("click", e => {
    if (!pinned || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const cue = e.target.closest && e.target.closest(".hero__cue");
    if (!cue || !mark || !window.Insidir) return;
    e.preventDefault();
    Insidir.scrollTo(mark);
    if (!strip.hasAttribute("tabindex")) strip.setAttribute("tabindex", "-1");
    strip.focus({ preventScroll: true });
  }, true);
})();
