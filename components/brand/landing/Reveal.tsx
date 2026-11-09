"use client";
/* The landing's scroll motion (no library): blocks rise into place as they scroll in ([data-reveal], staggered by
 * --i), numbers count up once ([data-count]: "$805K", "186", "14–6"), the brand glow drifts with the scroll, and the
 * top bar's Start for $1 appears once the hero's button has scrolled away ([data-cta-out] on the landing root).
 * Without JavaScript, or with reduced motion, everything is simply there: the hidden starting state only applies under
 * html.js-reveal, which this sets. */
import { useEffect } from "react";

const DURATION = 900;

/** "$805K" → { pre: "$", n: 805, dec: 0, post: "K" }; null when there's no number to count. Pure. */
export function countParts(text: string): { pre: string; n: number; dec: number; post: string } | null {
  const m = /^([^\d−-]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(text.trim());
  if (!m) return null;
  const raw = m[2]!.replace(/,/g, "");
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return { pre: m[1]!, n, dec: raw.includes(".") ? raw.split(".")[1]!.length : 0, post: m[3]! };
}

function countUp(el: HTMLElement) {
  const text = el.dataset.count ?? el.textContent ?? "";
  // A range like "14–6" counts both sides.
  const parts = text.split(/(–)/);
  const nums = parts.map(p => (p === "–" ? null : countParts(p)));
  if (nums.every(x => x === null)) return;
  const t0 = performance.now();
  const fmt = (p: { pre: string; n: number; dec: number; post: string }, k: number) =>
    `${p.pre}${(p.n * k).toLocaleString("en-US", { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec })}${p.post}`;
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / DURATION), e = 1 - Math.pow(1 - k, 3);
    el.textContent = parts.map((p, i) => (nums[i] ? fmt(nums[i]!, e) : p)).join("");
    if (k < 1) requestAnimationFrame(step); else el.textContent = text;
  };
  requestAnimationFrame(step);
}

export function Reveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".t-landing");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The top bar's Start for $1, once the hero's button is off screen.
    const hero = document.querySelector('[data-testid="hero-start"]');
    const ioCta = hero ? new IntersectionObserver(([e]) => { if (e) root.toggleAttribute("data-cta-out", !e.isIntersecting && e.boundingClientRect.top < 0); }) : null;
    if (hero) ioCta!.observe(hero);
    if (reduce) return () => ioCta?.disconnect();

    document.documentElement.classList.add("js-reveal");
    const io = new IntersectionObserver(es => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.dataset.in = "1";
        for (const c of el.matches("[data-count]") ? [el] : [...el.querySelectorAll<HTMLElement>("[data-count]")]) if (!c.dataset.counted) { c.dataset.counted = "1"; countUp(c); }
        io.unobserve(el);
      }
    }, { rootMargin: "0px 0px -4% 0px", threshold: 0.02 });
    root.querySelectorAll("[data-reveal]").forEach(el => io.observe(el));

    // The brand glow drifts a little slower than the page.
    const glows = [...root.querySelectorAll<HTMLElement>("[data-drift]")];
    let raf = 0;
    const drift = () => { raf = 0; for (const g of glows) { const r = g.getBoundingClientRect(); g.style.setProperty("--drift", `${Math.round((r.top + r.height / 2 - innerHeight / 2) * -0.12)}px`); } };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(drift); };
    drift();
    addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); ioCta?.disconnect(); removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
