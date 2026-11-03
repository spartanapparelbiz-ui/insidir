"use client";
/* The four behaviours as progressive enhancement. Every stage (.b-stage) renders fully visible; this only adds motion.
 *   At rest nothing is hidden: the page as loaded (and a full-page capture that never scrolls) shows every stage. The
 *     landing hero plays its entrance from first paint (html.hero-in, set before paint in app/layout.tsx).
 *   On the reader's first move to scroll (wheel, touch, a scroll key, a scroll), stages still below the viewport get
 *     .b-pre, the hidden starting state, while they're off screen, so each one plays as it arrives.
 *   A .b-pre stage gets .is-in the moment any of it enters the viewport (its lines rise, its subtitle lifts, its cards
 *     settle), then .is-done when the entrance is over, so the static design is left and nothing replays on scroll-back.
 *   Safety: anything that entered the viewport and isn't revealed within 1.2 s, and anything jumped past (an anchor, a
 *     fast scroll, a restored scroll position), snaps to visible with no animation.
 *   Stages added later (a /go step) play when they're inserted on screen; off screen they wait like the rest.
 * No IntersectionObserver or reduced motion: html.bm is never set (app/layout.tsx) and nothing here runs. */
import { useEffect } from "react";

const DONE_MS = 2600, SNAP_MS = 1200;

export function StageMotion() {
  useEffect(() => {
    const root = document.documentElement;
    (window as unknown as { __bmOK?: boolean }).__bmOK = true; // app/layout.tsx drops html.bm if this never runs
    if (!root.classList.contains("bm") || typeof IntersectionObserver === "undefined") return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
    const snap = (el: Element) => { el.classList.remove("b-pre"); el.classList.add("is-done"); };
    const play = (el: Element) => {
      if (el.classList.contains("is-in") || el.classList.contains("is-done")) return;
      el.classList.add("is-in");
      later(() => el.classList.add("is-done"), DONE_MS);
    };
    const io = new IntersectionObserver(es => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        play(e.target);
        const el = e.target;
        later(() => { if (!el.classList.contains("is-in") && !el.classList.contains("is-done")) snap(el); }, SNAP_MS);
      }
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
    const seen = new WeakSet<Element>();
    const below = (el: Element) => el.getBoundingClientRect().top >= window.innerHeight + 40;
    let armed = false;
    const setup = (el: Element, atLoad: boolean) => {
      if (seen.has(el)) return;
      if (el.hasAttribute("data-first")) { seen.add(el); later(() => el.classList.add("is-done"), DONE_MS); return; }
      if (!armed) { if (!atLoad) { seen.add(el); play(el); } return; } // before any scroll: visible as rendered (a new /go step plays)
      seen.add(el);
      if (below(el)) { el.classList.add("b-pre"); io.observe(el); return; }
      // On screen: at load it has already painted visible, so it stays still; inserted later (a new /go step), it
      // plays now, before its first paint.
      if (!atLoad) play(el);
    };
    const arm = () => {
      if (armed) return;
      armed = true;
      for (const e of ["wheel", "touchstart", "keydown", "scroll"] as const) window.removeEventListener(e, arm);
      for (const el of document.querySelectorAll(".b-stage")) setup(el, true);
    };
    for (const e of ["wheel", "touchstart", "keydown", "scroll"] as const) window.addEventListener(e, arm, { passive: true, once: false });
    for (const el of document.querySelectorAll(".b-stage")) if (el.hasAttribute("data-first")) setup(el, true);
    // Jumped past (an anchor, a restored position, a fast fling): anything above the viewport that never played snaps.
    let raf = 0;
    const sweep = () => {
      raf = 0;
      for (const el of document.querySelectorAll(".b-stage.b-pre:not(.is-in):not(.is-done)")) {
        const r = el.getBoundingClientRect();
        if (r.bottom <= 0) snap(el);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sweep); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", sweep);
    sweep();
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue;
        if (n.matches(".b-stage")) setup(n, false);
        for (const el of n.querySelectorAll(".b-stage")) setup(el, false);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      for (const t of timers) clearTimeout(t);
      for (const e of ["wheel", "touchstart", "keydown", "scroll"] as const) window.removeEventListener(e, arm);
      io.disconnect(); mo.disconnect(); cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll); window.removeEventListener("hashchange", sweep);
    };
  }, []);
  return null;
}
