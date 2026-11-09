"use client";
/* More scroll motion, on top of the stages' own entrances (StageMotion, ScrollFx), progressive enhancement only:
 *   - panels, rows, tiles, questions and section headings below the fold rise in one after another as they enter
 *     (elements already on screen at load are never hidden, so nothing flashes);
 *   - the first stage's words drift up and fade as you scroll past them, its photo slowly zooms;
 *   - every other stage photo drifts a little slower than the page (parallax);
 *   - a thin progress line along the top.
 * Transform and opacity only; nothing under reduced motion. */
import { useEffect } from "react";

const TARGETS = [
  ".b-stage:not([data-first]) .b-glass",
  ".b-stage:not([data-first]) .b-rows > li",
  ".b-stage:not([data-first]) .b-head",
  ".b-stage:not([data-first]) details",
  ".b-stage:not([data-first]) .b-ctas",
  ".s-cards > *",
  ".ai-strip > div",
  ".ai-brief > li",
  ".ai-watch > li",
  ".ai-chips > a",
].join(",");

export function ScrollReveal() {
  // The member home's section bar marks the section in view (works with reduced motion too).
  useEffect(() => {
    const nav = document.querySelector(".hm-nav");
    if (!nav || typeof IntersectionObserver === "undefined") return;
    const links = new Map([...nav.querySelectorAll<HTMLAnchorElement>("a")].map(a => [a.hash.slice(1), a]));
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) {
        links.forEach(a => a.removeAttribute("data-on"));
        const a = links.get(e.target.id);
        if (a) { a.dataset.on = ""; (nav as HTMLElement).scrollLeft = a.offsetLeft - (nav as HTMLElement).clientWidth / 2 + a.clientWidth / 2; }
      }
    }, { rootMargin: "-40% 0px -55% 0px" });
    links.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.classList.add("sr-on");
    // Hide only what is below the fold right now; stagger siblings.
    const els = [...document.querySelectorAll<HTMLElement>(TARGETS)].filter(el => !el.closest("[data-m]") || el.matches(".b-glass"));
    const fold = innerHeight;
    const seen = new Map<Element, number>();
    for (const el of els) {
      if (el.getBoundingClientRect().top < fold * 0.95) continue;
      const p = el.parentElement!;
      const n = seen.get(p) ?? 0;
      seen.set(p, n + 1);
      el.style.setProperty("--sr-d", `${Math.min(n, 8) * 70}ms`);
      el.classList.add("sr");
    }
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { e.target.classList.add("sr-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    document.querySelectorAll(".sr").forEach(el => io.observe(el));
    // Anything that hasn't come in after a long while (a jump, a fast fling) is simply shown.
    const safety = window.setTimeout(() => document.querySelectorAll(".sr:not(.sr-in)").forEach(el => { const r = el.getBoundingClientRect(); if (r.top < innerHeight) el.classList.add("sr-in"); }), 4000);

    // The hero drifts and fades; stage photos parallax; the progress line. The individual translate / scale properties
    // compose with each element's own transform (the hero is centred with one), never replacing it.
    const hero = document.querySelector<HTMLElement>(".b-stage[data-first] .b-hero-inner, .b-stage[data-first] .b-head");
    const heroBg = document.querySelector<HTMLElement>(".b-stage[data-first] .b-stage__bg");
    const bgs = [...document.querySelectorAll<HTMLElement>(".b-stage:not([data-first]) .b-stage__bg img")];
    const bar = document.createElement("div");
    bar.className = "sr-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    let raf = 0;
    const tick = () => {
      raf = 0;
      const y = scrollY, h = innerHeight;
      const max = Math.max(1, document.documentElement.scrollHeight - h);
      bar.style.transform = `scaleX(${Math.min(1, y / max)})`;
      if (hero && y < h * 1.2) {
        const k = Math.min(1, y / (h * 0.8));
        hero.style.translate = `0 ${(-k * 60).toFixed(1)}px`;
        hero.style.opacity = String(1 - k * 0.85);
      }
      if (heroBg && y < h * 1.2) heroBg.style.scale = (1 + Math.min(1, y / h) * 0.08).toFixed(4);
      for (const img of bgs) {
        const r = img.parentElement!.getBoundingClientRect();
        if (r.bottom < 0 || r.top > h) continue;
        const k = (r.top + r.height / 2 - h / 2) / h;
        img.style.translate = `0 ${(k * -40).toFixed(1)}px`; img.style.scale = "1.08";
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      io.disconnect(); clearTimeout(safety); bar.remove();
      removeEventListener("scroll", onScroll); removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      root.classList.remove("sr-on");
    };
  }, []);
  return null;
}
