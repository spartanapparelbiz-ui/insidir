"use client";
/* The page's scroll motion, one small client component for the whole site (mounted once in app/layout.tsx).
 *   .rv           rises 24px as it enters the screen, once (app/motion.css); section headers, rows and cards get it
 *                 here (RISE); items stagger 80 ms by their --i (set in markup).
 *   [data-reveal=group]  each direct child gets .rv, staggered 60 ms (components/motion/Reveal.tsx).
 *   [data-zoom]   a photo zooms 1.12 → 1 as it enters.
 *   [data-draw]   a chart: its lines draw left to right and its bars grow from 0 as it enters.
 *   .nav          gains .nav--scrolled after 24px of scroll (it shrinks slightly and blurs what's under it).
 *                 Hidden only when JS runs (html.js, set by an inline script before first paint), so without JS, or
 *                 under prefers-reduced-motion, everything is simply there.
 *   [data-count]  counts up once from 0 to its value the first time it enters view, over 900 ms, easing out: every
 *                 number in its text, in its own format (data-count=""), or data-count="<n>" in data-fmt. Its
 *                 server-rendered text is always the final value.
 *   [data-par]    parallax fallback for browsers without CSS scroll-driven animations (app/v2.css does it in CSS
 *                 where animation-timeline is supported): the photo drifts ±7% as it crosses the screen.
 *   .nav__prog    the reading-progress line under the nav, same fallback.
 * Only transform and opacity change; one passive scroll listener, work done in requestAnimationFrame. Elements added
 * later (the live feed's new cards) are picked up by a MutationObserver. */
import { useEffect } from "react";
import { dollars, signedShort } from "@/lib/moves/copy";

/** Section headers, rows and cards: each rises in as it scrolls into view (app/motion.css). */
const RISE = ".sec3__h, .sec2__h, .dsec__h, .tsec__h, .tgroup__h, .pghead__main, .trow, .tfeat, .ttile, .tcard, .move, .srow, .cleg, .tile, .proof__item, .board__row, .rec__row, .anlz__card, .steps__item, .faq2__item, .rtable tbody tr, .dtable tbody tr, .ptable tbody tr, .block__h, .phead, .trader__id, .lchart, .plan3, .wk__item";

const FORMAT: Record<string, (v: number) => string> = {
  dollars, signed: signedShort,
  int: v => Math.round(v).toLocaleString("en-US"),
  pct: v => `${Math.round(v)}%`,
};

const NUM = /(\d[\d,]*(?:\.\d+)?)/;

/** The text of a counting figure at progress k (0–1, clamped): every number in `final` scaled by the eased progress,
 *  in its own format ("+$3,200", "+12.4%", "14–6"); at 1 it is exactly `final`. Pure, so it can be tested. */
export function countText(final: string, k: number): string {
  const p = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 1));
  if (p >= 1) return final;
  const e = 1 - Math.pow(1 - p, 3);
  return final.split(NUM).map((part, i) => {
    if (i % 2 === 0) return part;
    const dec = /\.(\d+)$/.exec(part)?.[1]?.length ?? 0;
    return (Number(part.replace(/,/g, "")) * e).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: part.includes(",") });
  }).join("");
}

/** Counts every number in the element up from 0 the first time it's seen, keeping its own format; with
 *  data-count="<n>" and data-fmt it counts that value in that format. Held at its final width while it counts
 *  (tabular figures, app/motion.css), so nothing shifts. The text is the final value before and after. Not for
 *  automated or hidden pages (a crawler's snapshot must read the real numbers). */
function countUp(el: HTMLElement) {
  if (navigator.webdriver || document.visibilityState !== "visible") return;
  const final = el.dataset.final ?? el.textContent ?? "";
  const explicit = el.dataset.count ? Number(el.dataset.count) : NaN;
  if (!Number.isFinite(explicit) && final.split(NUM).length < 2) return;
  const fmt = FORMAT[el.dataset.fmt ?? "int"] ?? FORMAT.int!;
  el.style.minWidth = `${el.getBoundingClientRect().width}px`;
  // The clock starts at the first frame's own timestamp (rAF and performance.now() can disagree), and progress is
  // clamped to 0–1, so the text only ever shows a value between 0 and the real one.
  let t0 = -1, done = false;
  const dur = 900;
  const finish = () => { done = true; el.textContent = final; el.style.minWidth = ""; };
  // Whatever happens to the frames (a renderer or background tab that stops them after the first), the real value is
  // back in place once the count's time is up.
  setTimeout(finish, dur + 250);
  const step = (t: number) => {
    if (done) return;
    if (t0 < 0) t0 = t;
    const k = Math.min(1, Math.max(0, (t - t0) / dur));
    el.textContent = k >= 1 ? final : Number.isFinite(explicit) ? fmt(explicit * (1 - Math.pow(1 - k, 3))) : countText(final, k);
    if (k < 1) requestAnimationFrame(step); else finish();
  };
  requestAnimationFrame(step);
}

export function Motion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    if (reduce) { root.classList.remove("js"); return; }
    const scrollDriven = CSS.supports("animation-timeline: view()");

    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        if (el.classList.contains("rv") || el.dataset.zoom !== undefined || el.dataset.draw !== undefined || el.matches(".sec3__h, .sec2__h, .dsec__h, .tsec__h, .tgroup__h")) el.classList.add("is-in");
        if (el.dataset.count !== undefined) countUp(el);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });

    // Once: with view() the reveal is tied to scroll, so it would play backwards when scrolled away. When an element
    // is well inside the screen its reveal has finished: pin it there for good.
    const done = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting || e.boundingClientRect.bottom < 0) { e.target.classList.add("rv--done"); done.unobserve(e.target); }
    }, { rootMargin: "0px 0px -45% 0px", threshold: 0 });

    const parallax = new Set<HTMLElement>();
    const watch = (scope: ParentNode) => {
      // A RevealGroup's children rise one after another, 60ms apart (at most 8 steps, so long lists don't lag).
      scope.querySelectorAll<HTMLElement>("[data-reveal=group]").forEach(g => {
        Array.from(g.children).forEach((c, i) => { const el = c as HTMLElement; el.classList.add("rv"); if (!el.style.getPropertyValue("--i")) el.style.setProperty("--i", String(Math.min(i, 8))); });
      });
      scope.querySelectorAll<HTMLElement>(`.rv, [data-count], [data-zoom], [data-draw], ${RISE}`).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        if (el.matches(RISE) && !el.classList.contains("rise")) el.classList.add("rv");
        // Photos below the screen wait at 1.18 and zoom to 1 as they enter.
        if (el.dataset.zoom !== undefined && el.getBoundingClientRect().top > innerHeight) el.classList.add("zoom--wait");
        // The real value stays in the page until it counts up (from 0, once it enters view): never a placeholder 0,
        // whether or not the animation ever runs (screenshots, a page read without scrolling, a slow observer).
        if (el.dataset.count !== undefined) el.dataset.final = el.textContent ?? "";
        // Only what starts below the screen waits to fade up as it enters: the first screen paints at once.
        if (el.classList.contains("rv") && el.getBoundingClientRect().top > innerHeight) { el.classList.add("rv--wait"); if (scrollDriven) done.observe(el); }
        // Charts below the screen wait undrawn: lines draw left to right, bars grow from 0.
        if (el.dataset.draw !== undefined && el.getBoundingClientRect().top > innerHeight) el.classList.add("draw--wait");
        io.observe(el);
      });
      if (!scrollDriven) scope.querySelectorAll<HTMLElement>("[data-par]").forEach(el => parallax.add(el));
    };
    watch(document);
    const mo = new MutationObserver(list => { for (const m of list) m.addedNodes.forEach(n => { if (n instanceof HTMLElement) watch(n.parentNode ?? n); }); });
    mo.observe(document.body, { childList: true, subtree: true });

    // Fallbacks for continuous effects when CSS scroll-driven animations aren't supported.
    let raf = 0;
    const prog = document.querySelector<HTMLElement>(".nav__prog");
    const head = document.querySelector<HTMLElement>(".nav");
    const frame = () => {
      raf = 0;
      head?.classList.toggle("nav--scrolled", scrollY > 24);
      if (scrollDriven) return;
      const max = root.scrollHeight - innerHeight;
      if (prog) prog.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      for (const el of parallax) {
        const box = el.getBoundingClientRect();
        if (box.bottom < 0 || box.top > innerHeight) continue;
        const travelled = Math.min(1, Math.max(0, (innerHeight - box.top) / (innerHeight + box.height)));
        const img = el.querySelector<HTMLElement>("img") ?? el;
        img.style.transform = `translate3d(0, ${(-6 + travelled * 12).toFixed(2)}%, 0) scale(1.14)`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); frame();
    return () => { io.disconnect(); done.disconnect(); mo.disconnect(); removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
