/* Legal pages (terms, privacy): table-of-contents scrollspy with a marker that
   glides along the divider, smooth section links, copy-link buttons beside each
   heading, and a collapsible "On this page" bar on small screens.
   The 404 page reuses this file for its pointer-driven skyline drift. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobileQuery = matchMedia("(max-width: 900px)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const ICON_LINK = '<svg class="i-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  const ICON_CHECK = '<svg class="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  const headerHeight = () => {
    const h = document.querySelector(".app-header");
    return h ? h.getBoundingClientRect().height : 0;
  };

  /* ---------- table of contents ---------- */
  function initToc() {
    const toc = document.querySelector("[data-legal-toc]");
    if (!toc) return;
    const summary = toc.querySelector("summary");
    const marker = toc.querySelector(".legal-toc__marker");
    const currentLabel = toc.querySelector(".legal-toc__current");
    const pairs = [...toc.querySelectorAll('.legal-toc__list a[href^="#"]')]
      .map(a => ({ a, section: document.getElementById(decodeURIComponent(a.hash.slice(1))) }))
      .filter(p => p.section);
    if (!pairs.length) return;
    const links = pairs.map(p => p.a);
    const sections = pairs.map(p => p.section);
    const heads = sections.map(s => s.querySelector(".legal-section__head") || s);

    let active = -1;
    let locked = false;        // set while a contents click is gliding the page
    let glideDone = false;

    const barHeight = () => (mobileQuery.matches && summary ? summary.getBoundingClientRect().height : 0);
    const stickyOffset = () => headerHeight() + barHeight();
    // same gap the CSS uses for the sticky contents and heading scroll-margin
    const landingGap = () => parseFloat(getComputedStyle(document.body).getPropertyValue("--legal-land")) || (mobileQuery.matches ? 20 : 28);
    const spyLine = () => Math.round(stickyOffset() + landingGap() + Math.min(innerHeight * 0.12, 90));

    function placeMarker(instant) {
      if (!marker || active < 0 || mobileQuery.matches) return;
      // measure the <li>: revealed items carry will-change, which makes them the
      // links' offsetParent, and their reveal transform would skew a rect.
      const item = links[active].closest("li") || links[active];
      if (instant) marker.style.transition = "none";
      const h = Math.max(18, Math.round(item.offsetHeight * 0.66));
      marker.style.setProperty("--y", item.offsetTop + (item.offsetHeight - h) / 2 + "px");
      marker.style.height = h + "px";
      if (instant) { void marker.offsetWidth; marker.style.transition = ""; }
    }

    function swapLabel(text) {
      if (!currentLabel || currentLabel.textContent === text) return;
      if (reduce) { currentLabel.textContent = text; return; }
      currentLabel.classList.add("is-swapping");
      requestAnimationFrame(() => {
        currentLabel.textContent = text;
        requestAnimationFrame(() => currentLabel.classList.remove("is-swapping"));
      });
    }

    function setActive(i, instant) {
      if (i < 0 || i >= links.length || i === active) return;
      active = i;
      links.forEach((a, j) => (j === i ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
      placeMarker(instant);
      swapLabel(links[i].querySelector(".t") ? links[i].querySelector(".t").textContent : links[i].textContent);
    }

    const atBottom = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 4;

    /* Fallback / resync: last section whose top has passed the spy line. */
    function syncFromLayout(instant) {
      if (atBottom()) { setActive(sections.length - 1, instant); return; }
      const line = spyLine();
      let idx = 0;
      sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) idx = i; });
      setActive(idx, instant);
    }

    /* IntersectionObserver over a 1px band at the spy line: sections tile the
       column (padding, not margin), so exactly one intersects it at a time. */
    let io = null;
    function buildObserver() {
      if (!("IntersectionObserver" in window)) return;
      if (io) io.disconnect();
      const line = spyLine();
      const bottom = Math.max(0, innerHeight - line - 1);
      io = new IntersectionObserver(entries => {
        if (locked) return;
        const hit = entries.filter(e => e.isIntersecting).pop();
        if (hit && !atBottom()) setActive(sections.indexOf(hit.target));
      }, { rootMargin: `-${line}px 0px -${bottom}px 0px`, threshold: 0 });
      sections.forEach(s => io.observe(s));
    }

    /* Page edges (above the first section / bottom of the page) and lock release. */
    let wasBottom = false, ticking = false;
    function onScrollFrame() {
      ticking = false;
      if (locked) {
        if (glideDone) { locked = false; syncFromLayout(); }
        return;
      }
      const bottom = atBottom();
      if (bottom) setActive(sections.length - 1);
      else if (wasBottom) syncFromLayout();
      else if (sections[0].getBoundingClientRect().top > spyLine()) setActive(0);
      wasBottom = bottom;
    }
    addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
    }, { passive: true });

    /* A contents click glides there; the clicked entry stays active until the
       reader scrolls again (so short final sections can still be selected). */
    let settleTimer = 0;
    const markGlideDone = () => { if (locked) setTimeout(() => { glideDone = true; }, 60); };
    if ("onscrollend" in window) addEventListener("scrollend", markGlideDone);
    const releaseOnInput = () => { if (locked) { locked = false; syncFromLayout(); } };
    addEventListener("wheel", releaseOnInput, { passive: true });
    addEventListener("touchstart", releaseOnInput, { passive: true });
    addEventListener("keydown", e => { if (/^(Arrow|Page|Home|End| )/.test(e.key) && !e.target.closest("[data-legal-toc]")) releaseOnInput(); });

    function scrollToSection(i, { instant = false } = {}) {
      const head = heads[i];
      // the first entry returns to the very top so the page title shows again
      const offset = i === 0 ? head.getBoundingClientRect().top + scrollY : stickyOffset() + landingGap();
      head.dataset.scrollOffset = String(offset);
      if (instant || !window.Insidir || !window.Insidir.scrollTo) {
        const y = head.getBoundingClientRect().top + scrollY - offset;
        scrollTo({ top: y, behavior: instant || reduce ? "auto" : "smooth" });
      } else {
        window.Insidir.scrollTo(head);
      }
    }

    links.forEach((a, i) => a.addEventListener("click", e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
      e.preventDefault(); // motion.js leaves default-prevented anchor clicks alone
      if (mobileQuery.matches && toc.open) toc.open = false;
      locked = true;
      glideDone = false;
      setActive(i);
      scrollToSection(i);
      clearTimeout(settleTimer);
      if (!("onscrollend" in window)) settleTimer = setTimeout(() => { glideDone = true; }, 1200);
      history.replaceState(null, "", "#" + sections[i].id);
      const h2 = sections[i].querySelector("h2");
      if (h2) h2.focus({ preventScroll: true });
    }));

    /* Desktop keeps the contents open; small screens collapse them into a bar. */
    function applyMode() {
      toc.open = !mobileQuery.matches;
      buildObserver();
      placeMarker(true);
    }
    if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", applyMode);
    else if (mobileQuery.addListener) mobileQuery.addListener(applyMode);
    document.addEventListener("click", e => {
      if (mobileQuery.matches && toc.open && !toc.contains(e.target)) toc.open = false;
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && mobileQuery.matches && toc.open) { toc.open = false; summary && summary.focus(); }
    });

    let resizeTimer = 0;
    addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { buildObserver(); placeMarker(true); }, 150);
    });

    applyMode();
    syncFromLayout(true);

    /* Deep links: land on the heading below the sticky header once fonts settle. */
    const hashIndex = () => sections.findIndex(s => "#" + s.id === decodeURIComponent(location.hash));
    const settle = () => {
      const i = hashIndex();
      if (i >= 0) { scrollToSection(i, { instant: true }); setActive(i, true); }
      placeMarker(true);
      if (marker) setTimeout(() => marker.classList.add("is-on"), reduce || i >= 0 ? 0 : 950);
    };
    const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise(r => setTimeout(r, 900))]).then(() => requestAnimationFrame(settle));
    addEventListener("hashchange", () => {
      const i = hashIndex();
      if (i >= 0) { locked = true; glideDone = false; setActive(i); scrollToSection(i); setTimeout(() => { glideDone = true; }, 1200); }
    });
  }

  /* ---------- copy a link to a section ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (_) { /* fall through to the legacy path */ }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }

  function initCopyLinks() {
    document.querySelectorAll(".legal-section[id]").forEach(section => {
      const head = section.querySelector(".legal-section__head");
      const h2 = head && head.querySelector("h2");
      if (!h2) return;
      const title = h2.textContent.replace(/^\s*\d+\.\s*/, "").trim();
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "legal-copy";
      btn.setAttribute("aria-label", `Copy link to “${title}”`);
      btn.title = "Copy link to this section";
      btn.innerHTML = ICON_LINK + ICON_CHECK;
      let timer = 0;
      btn.addEventListener("click", async () => {
        const url = location.href.split("#")[0] + "#" + section.id;
        const ok = await copyText(url);
        btn.focus({ preventScroll: true });
        history.replaceState(null, "", "#" + section.id);
        btn.classList.add("is-copied");
        clearTimeout(timer);
        timer = setTimeout(() => btn.classList.remove("is-copied"), 1800);
        if (window.Insidir && window.Insidir.toast) {
          window.Insidir.toast(ok ? "Link to “" + title + "” copied" : "Couldn’t copy automatically. The link is in the address bar.");
        }
      });
      head.appendChild(btn);
    });
  }

  /* ---------- 404: the skyline drifts gently with the pointer ---------- */
  function initNotFound() {
    const layer = document.querySelector(".nf-sky__pointer");
    if (!layer || reduce || !finePointer) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const step = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      layer.style.transform = `translate3d(${(-x * 22).toFixed(2)}px,${(-y * 10).toFixed(2)}px,0)`;
      raf = Math.abs(tx - x) > 0.0005 || Math.abs(ty - y) > 0.0005 ? requestAnimationFrame(step) : 0;
    };
    addEventListener("pointermove", e => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: true });
  }

  /* Sections already on screen at load cascade top to bottom after the title,
     instead of all starting together (motion.js reads data-delay on DOMContentLoaded). */
  function cascadeFirstScreen() {
    if (reduce) return;
    document.querySelectorAll(".legal-section").forEach((section, i) => {
      if (i === 0 || section.getBoundingClientRect().top > innerHeight) return;
      const offset = 200 + i * 110;
      section.querySelectorAll("[data-reveal],[data-split]").forEach(el => {
        el.dataset.delay = String(offset + parseFloat(el.dataset.delay || "0"));
      });
    });
  }

  /* The document-wide anchor glide in motion.js cancels the skip link's native
     jump, which also cancels the focus move; keep the native behaviour here. */
  function keepSkipLinkNative() {
    document.querySelectorAll(".skip-link").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
  }

  keepSkipLinkNative();
  cascadeFirstScreen();
  initCopyLinks();
  initToc();
  initNotFound();
})();
