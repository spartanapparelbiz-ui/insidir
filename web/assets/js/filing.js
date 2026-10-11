/* Filing viewer (filing.html): outline navigation that glides the document
   pane (not the window), a scrollspy with a sliding active background,
   collapsible outline, reading progress, ?q= notice, and the mobile chip
   bar where the document uses page scroll. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileMQ = matchMedia("(max-width: 899.98px)");
  const toc = document.querySelector("[data-toc]");
  const pane = document.querySelector("[data-doc-scroll]");
  if (!toc || !pane) return;

  const nav = toc.querySelector(".toc__nav");
  const body = toc.querySelector(".toc__body");
  const indicator = toc.querySelector(".toc__indicator");
  const toggle = toc.querySelector("[data-toc-toggle]");
  const tocProgress = toc.querySelector(".toc__progress");
  const frameProgress = document.querySelector(".doc-frame__progress");
  const cover = document.getElementById("cover");
  const coverInner = cover && cover.querySelector(".doc-cover__inner");

  // On phones the document is one very tall block in the page flow; revealing it
  // as a single card would keep it hidden until 12% of it is on screen, so the
  // cover lines (which reveal individually) carry the entrance instead.
  const isMobile = () => mobileMQ.matches;
  const frame = document.querySelector(".doc-frame");
  if (frame && isMobile()) frame.removeAttribute("data-reveal");
  // Chips that start off-screen in the horizontal bar would otherwise wait for
  // their own (staggered) reveal; the bar animates in as one piece instead.
  if (isMobile()) toc.querySelectorAll(".toc__list > li[data-reveal]").forEach(li => li.removeAttribute("data-reveal"));

  const allLinks = [...toc.querySelectorAll('a[href^="#"]')];
  const spyLinks = allLinks.filter(a => a.classList.contains("toc__link"));
  const parts = allLinks.filter(a => a.classList.contains("toc__part"));
  const targetOf = a => document.getElementById(decodeURIComponent(a.hash.slice(1)));
  const spy = spyLinks.map(a => ({ link: a, el: targetOf(a), group: a.dataset.group || "" })).filter(s => s.el);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const appHeaderH = () => {
    const h = document.querySelector(".app-header");
    return h ? h.offsetHeight : 64;
  };

  /* ---------- geometry: where a section sits in the active scroller ---------- */
  function scroller() {
    if (isMobile()) {
      return {
        top: () => window.scrollY,
        height: () => window.innerHeight,
        max: () => document.documentElement.scrollHeight - window.innerHeight,
        offset: () => appHeaderH() + (toc.offsetHeight || 0) + 12,
        pos: el => el.getBoundingClientRect().top + window.scrollY,
        set: y => window.scrollTo(0, y)
      };
    }
    return {
      top: () => pane.scrollTop,
      height: () => pane.clientHeight,
      max: () => pane.scrollHeight - pane.clientHeight,
      offset: () => 0,
      pos: el => el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop,
      set: y => { pane.scrollTop = y; }
    };
  }

  /* ---------- active indicator ---------- */
  let active = null;
  // Layout offset of el inside ancestor, ignoring transforms (reveal animations
  // put transforms on the list items, which makes each item an offsetParent).
  function offsetWithin(el, ancestor) {
    let x = 0, y = 0, n = el;
    while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x, y };
  }
  function placeIndicator(link, instant) {
    if (!link || !indicator) return;
    const o = offsetWithin(link, nav);
    if (instant) indicator.style.transition = "none";
    indicator.style.width = link.offsetWidth + "px";
    indicator.style.height = link.offsetHeight + "px";
    indicator.style.transform = `translate3d(${o.x}px,${o.y}px,0)`;
    indicator.classList.add("is-placed");
    if (instant) { void indicator.offsetWidth; indicator.style.transition = ""; }
  }
  function keepChipVisible(link) {
    if (!isMobile()) return;
    const pad = 24;
    const l = offsetWithin(link, nav).x + nav.offsetLeft, r = l + link.offsetWidth;
    const view = body.scrollLeft, w = body.clientWidth;
    let to = null;
    if (l < view + pad) to = l - pad;
    else if (r > view + w - pad) to = r - w + pad;
    if (to !== null) body.scrollTo({ left: Math.max(0, to), behavior: reduce ? "auto" : "smooth" });
  }
  function setActive(link, instant) {
    if (!link) return;
    if (link !== active) {
      spyLinks.forEach(a => {
        const on = a === link;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
      active = link;
      keepChipVisible(link);
    }
    placeIndicator(link, instant);
  }

  /* ---------- scrollspy ---------- */
  let spyLocked = false;
  // After an outline jump the chosen item stays active (even if the document
  // cannot scroll it all the way up) until the reader scrolls on their own.
  let hold = null, holdTop = 0;
  const release = () => { if (hold) { hold = null; requestSpy(); } };
  function runSpy() {
    const s = scroller();
    const top = s.top(), h = s.height(), max = s.max();
    const viewTop = top + s.offset();
    const line = viewTop + Math.max(72, (h - s.offset()) * 0.28);
    const tops = spy.map(x => s.pos(x.el));
    let idx = 0;
    tops.forEach((t, i) => { if (t <= line) idx = i; });
    if (max > 0 && top >= max - 2) idx = spy.length - 1;
    if (hold && Math.abs(top - holdTop) > 40) hold = null; // moved on (find-in-page, focus, scrollbar...)
    if (hold) idx = Math.max(0, spy.findIndex(x => x.link === hold));

    // The section after the current one is tinted ("up next"), and the part label
    // of the current section (or, on the cover, of the next one) turns navy.
    const cur = spyLocked ? Math.max(0, spy.findIndex(x => x.link === active)) : idx;
    spy.forEach((x, i) => x.link.classList.toggle("is-next", i === cur + 1));
    const group = spy[cur].group || (spy[cur + 1] ? spy[cur + 1].group : "");
    parts.forEach(p => p.classList.toggle("is-current", p.dataset.group === group));
    if (!spyLocked) setActive(spy[idx].link);

    // reading progress + cover drift
    const p = max > 0 ? clamp(top / max, 0, 1) : 0;
    if (frameProgress) frameProgress.style.setProperty("--p", p.toFixed(4));
    if (tocProgress) {
      const docTop = s.pos(spy[0].el), docEnd = docTop + pane.offsetHeight - h * 0.6;
      const mp = isMobile() ? clamp((top + s.offset() - docTop) / Math.max(1, docEnd - docTop), 0, 1) : p;
      tocProgress.style.setProperty("--p", mp.toFixed(4));
    }
    if (coverInner && !reduce && !isMobile()) {
      const cx = clamp(top / Math.max(1, cover.offsetHeight), 0, 1);
      coverInner.style.setProperty("--cx", cx.toFixed(4));
    }
  }
  let ticking = false;
  const requestSpy = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; runSpy(); }); } };
  pane.addEventListener("scroll", requestSpy, { passive: true });
  window.addEventListener("scroll", () => { if (isMobile()) requestSpy(); }, { passive: true });

  /* ---------- eased scrolling for outline jumps ---------- */
  let anim = null;
  const easeInOutQuart = t => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
  function cancelAnim() {
    if (!anim) return;
    cancelAnimationFrame(anim.raf);
    anim = null;
    spyLocked = false;
    requestSpy();
  }
  function glide(s, to, done) {
    cancelAnim();
    const from = s.top();
    const dist = to - from;
    if (reduce || Math.abs(dist) < 2) { s.set(to); done && done(); return; }
    const dur = clamp(420 + Math.abs(dist) * 0.22, 520, 1150);
    const start = performance.now();
    anim = { raf: 0 };
    const step = now => {
      const t = clamp((now - start) / dur, 0, 1);
      s.set(from + dist * easeInOutQuart(t));
      if (t < 1 && anim) anim.raf = requestAnimationFrame(step);
      else { anim = null; done && done(); }
    };
    anim.raf = requestAnimationFrame(step);
  }
  ["wheel", "touchstart", "keydown"].forEach(type => {
    pane.addEventListener(type, cancelAnim, { passive: true });
    window.addEventListener(type, e => {
      if (isMobile() || !pane.contains(e.target)) cancelAnim();
      if (type !== "keydown" || /^(Arrow|Page|Home|End| )/.test(e.key)) release();
    }, { passive: true });
  });
  pane.addEventListener("pointerdown", release, { passive: true });

  function goTo(target, link, instant) {
    const s = scroller();
    const margin = isMobile() ? 0 : 18;
    const to = clamp(s.pos(target) - s.offset() - margin, 0, Math.max(0, s.max()));
    const spyLink = spyLinks.includes(link) ? link : spyNext(link);
    hold = null;
    if (spyLink) { spyLocked = true; setActive(spyLink); }
    const finish = () => {
      spyLocked = false;
      hold = spyLink;
      holdTop = s.top();
      runSpy();
      target.focus({ preventScroll: true });
    };
    if (instant) { s.set(to); finish(); } else glide(s, to, finish);
  }
  // A part label activates the first item in its group
  function spyNext(partLink) {
    if (!partLink) return null;
    return spyLinks.find(a => a.dataset.group === partLink.dataset.group) || null;
  }

  nav.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const target = targetOf(a);
    if (!target) return;
    e.preventDefault(); // the global anchor handler skips prevented clicks, so the window stays put
    goTo(target, a);
    history.replaceState(null, "", a.hash);
  });

  /* ---------- collapse / expand the outline ---------- */
  if (toggle) {
    toggle.addEventListener("click", () => {
      const collapse = !toc.classList.contains("is-collapsed");
      const from = toc.getBoundingClientRect().height;
      toggle.setAttribute("aria-expanded", String(!collapse));
      if (reduce || !toc.animate) {
        toc.classList.toggle("is-collapsed", collapse);
        if (!collapse) requestAnimationFrame(() => placeIndicator(active, true));
        return;
      }
      toc.getAnimations().forEach(a => a.cancel());
      body.getAnimations().forEach(a => a.cancel());
      if (collapse) {
        const to = toggle.offsetHeight + 2;
        body.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-8px)" }],
          { duration: 260, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" });
        const a = toc.animate([{ height: from + "px" }, { height: to + "px" }], { duration: 560, easing: "cubic-bezier(.65,0,.35,1)" });
        a.onfinish = () => {
          toc.classList.add("is-collapsed");
          body.getAnimations().forEach(x => x.cancel());
        };
      } else {
        toc.classList.remove("is-collapsed");
        const to = toc.getBoundingClientRect().height;
        placeIndicator(active, true);
        toc.animate([{ height: from + "px" }, { height: to + "px" }], { duration: 680, easing: "cubic-bezier(.16,1,.3,1)" });
        body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 80, easing: "ease-out", fill: "backwards" });
        [...toc.querySelectorAll(".toc__list > li")].forEach((li, i) => {
          li.animate([{ opacity: 0, transform: "translate3d(-12px,0,0)" }, { opacity: 1, transform: "none" }],
            { duration: 620, delay: 90 + i * 32, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
        });
      }
    });
  }

  /* ---------- Download PDF (not available in the static preview) ---------- */
  const dl = document.querySelector("[data-download]");
  if (dl) dl.addEventListener("click", () => {
    if (window.Insidir && Insidir.toast) Insidir.toast("PDF download isn't available in the preview.");
  });

  /* ---------- ?q= full-text search notice ---------- */
  const q = (new URLSearchParams(location.search).get("q") || "").trim().slice(0, 200);
  const slot = document.querySelector("[data-q-slot]");
  if (q && slot) {
    const bar = document.createElement("div");
    bar.className = "q-bar";
    bar.setAttribute("role", "status");
    bar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg><p></p>' +
      '<button class="q-bar__close" type="button" aria-label="Dismiss notice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>';
    const p = bar.querySelector("p");
    const strong = document.createElement("strong");
    strong.textContent = q; // user text is only ever inserted as text
    p.append("Full-text search for \u201C", strong, "\u201D is available when connected to the Insidir engine. Showing the latest 10-K.");
    slot.appendChild(bar);
    const input = document.getElementById("app-search-input");
    if (input && !input.value) input.value = q;
    bar.querySelector(".q-bar__close").addEventListener("click", () => {
      const clean = () => {
        bar.remove();
        const params = new URLSearchParams(location.search);
        params.delete("q");
        const qs = params.toString();
        history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
        requestSpy();
      };
      if (reduce || !bar.animate) { clean(); return; }
      const h = bar.offsetHeight;
      const cs = getComputedStyle(bar);
      bar.animate([
        { height: h + "px", opacity: 1, marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom },
        { height: "0px", opacity: 0, marginTop: "0px", marginBottom: "0px", paddingTop: "0px", paddingBottom: "0px" }
      ], { duration: 420, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" }).onfinish = clean;
    });
  }

  /* ---------- layout changes ---------- */
  let lastMobile = isMobile();
  function relayout() {
    const m = isMobile();
    if (m !== lastMobile) {
      lastMobile = m;
      if (coverInner) coverInner.style.removeProperty("--cx");
      cancelAnim();
    }
    placeIndicator(active, true);
    requestSpy();
  }
  window.addEventListener("resize", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeIndicator(active, true));

  /* ---------- initial state ---------- */
  setActive(spyLinks[0], true);
  runSpy();
  requestAnimationFrame(() => placeIndicator(active, true));
  window.addEventListener("load", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    const link = target && allLinks.find(a => targetOf(a) === target);
    if (link) {
      // The browser's own fragment scroll moves the window; on desktop the
      // pane does the scrolling, so put the window back once that has run.
      goTo(target, link, true);
      if (!isMobile()) {
        const reset = () => { window.scrollTo(0, 0); goTo(target, link, true); };
        requestAnimationFrame(() => setTimeout(reset, 30));
      }
    } else {
      placeIndicator(active, true);
      runSpy();
    }
  });
})();
