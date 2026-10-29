"use client";
/* The page's scroll motion, one small client component for the whole site (mounted once in app/layout.tsx).
 *   .rv           fades up 16px as it enters the screen, once; items stagger 80 ms by their --i (set in markup).
 *                 Hidden only when JS runs (html.js, set by an inline script before first paint), so without JS, or
 *                 under prefers-reduced-motion, everything is simply there.
 *   [data-count]  counts up once from 0 to its value when it enters view (its server-rendered text is the final
 *                 value, formatted the same way), over 900 ms, easing out.
 *   [data-par]    parallax fallback for browsers without CSS scroll-driven animations (app/v2.css does it in CSS
 *                 where animation-timeline is supported): the photo drifts at 0.85x scroll speed, with a gentle zoom.
 *   .nav__prog    the reading-progress line under the nav, same fallback.
 * Only transform and opacity change; one passive scroll listener, work done in requestAnimationFrame. Elements added
 * later (the live feed's new cards) are picked up by a MutationObserver. */
import { useEffect } from "react";
import { dollars, signedShort } from "@/lib/moves/copy";

const FORMAT: Record<string, (v: number) => string> = {
  dollars, signed: signedShort,
  int: v => Math.round(v).toLocaleString("en-US"),
  pct: v => `${Math.round(v)}%`,
};

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count), fmt = FORMAT[el.dataset.fmt ?? "int"] ?? FORMAT.int!;
  const final = el.dataset.final ?? el.textContent ?? "";
  if (!Number.isFinite(target)) return;
  const t0 = performance.now(), dur = 900;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = k < 1 ? fmt(target * e) : final;
    if (k < 1) requestAnimationFrame(step);
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
        if (el.classList.contains("rv")) el.classList.add("is-in");
        if (el.dataset.count !== undefined) countUp(el);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });

    const parallax = new Set<HTMLElement>();
    const watch = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>(".rv, [data-count]").forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        // The real value stays in the page until it counts up (from 0, once it enters view): never a placeholder 0,
        // whether or not the animation ever runs (screenshots, a page read without scrolling, a slow observer).
        if (el.dataset.count !== undefined) el.dataset.final = el.textContent ?? "";
        // Only what starts below the screen waits to fade up as it enters: the first screen paints at once.
        if (el.classList.contains("rv") && el.getBoundingClientRect().top > innerHeight) el.classList.add("rv--wait");
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
    const frame = () => {
      raf = 0;
      if (scrollDriven) return;
      const max = root.scrollHeight - innerHeight;
      if (prog) prog.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      for (const el of parallax) {
        const box = (el.parentElement ?? el).getBoundingClientRect();
        if (box.bottom < 0 || box.top > innerHeight) continue;
        const travelled = Math.min(1, Math.max(0, (innerHeight - box.top) / (innerHeight + box.height)));
        el.style.transform = `translate3d(0, ${(-6 + travelled * 12).toFixed(2)}%, 0) scale(${(1.14 + travelled * 0.06).toFixed(3)})`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    if (!scrollDriven) { addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); frame(); }
    return () => { io.disconnect(); mo.disconnect(); removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
