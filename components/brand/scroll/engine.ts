"use client";
/* The scroll engine: Lenis smooth scrolling driven by GSAP's ticker (one shared requestAnimationFrame loop), with
 * ScrollTrigger reading Lenis' scroll. Every animation is transform and opacity only; will-change is set while a
 * tween runs and cleared after. Easing is expo.out or power3.out, nothing bounces or spins.
 * Reduced motion: no Lenis, no pinning, everything shown at rest. Phones (< 768px): shorter pins, native swipe for
 * the horizontal row, parallax halved. */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { dollars } from "@/lib/money";

let registered = false;
export function register(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, SplitText);
  gsap.defaults({ ease: "expo.out", duration: 0.9 });
  registered = true;
}

export const reduced = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const phone = (): boolean => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

/** will-change only while it moves. */
export const animating = { onStart(this: gsap.core.Tween) { for (const t of this.targets() as HTMLElement[]) t.classList?.add("is-anim"); },
  onComplete(this: gsap.core.Tween) { for (const t of this.targets() as HTMLElement[]) t.classList?.remove("is-anim"); } };

/** Starts Lenis on GSAP's ticker; returns the stop function. Nothing under reduced motion. */
export function startSmooth(): () => void {
  register();
  if (reduced()) return () => undefined;
  const lenis = new Lenis({ duration: 1.1, easing: t => 1 - Math.pow(1 - t, 4), smoothWheel: true });
  const tick = (time: number) => lenis.raf(time * 1000);
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
  return () => { gsap.ticker.remove(tick); lenis.destroy(); delete (window as unknown as { __lenis?: Lenis }).__lenis; };
}

/** "$1,234,567" / "+$9,301" / "1,000": how a ticking number is written (data-format on the element). */
export function formatNumber(v: number, format: string | undefined): string {
  const r = Math.round(v), a = Math.abs(r).toLocaleString("en-US");
  switch (format) {
    case "usd": return `$${a}`;
    case "usd-signed": return `${r >= 0 ? "+" : "−"}$${a}`;
    case "usd-short": return dollars(v);
    case "cents": return `${r}¢`;
    case "pct": return `${r}%`;
    default: return a;
  }
}

/** Counts an element's number from `from` to its data-value, writing it with its data-format. */
export function countUp(el: HTMLElement, opts: { from?: number; duration?: number; delay?: number } = {}): gsap.core.Tween | null {
  const to = Number(el.dataset.value);
  if (!Number.isFinite(to)) return null;
  const fmt = el.dataset.format;
  if (reduced()) { el.textContent = formatNumber(to, fmt); return null; }
  const o = { v: opts.from ?? 0 };
  el.textContent = formatNumber(o.v, fmt);
  return gsap.to(o, { v: to, duration: opts.duration ?? 1.4, delay: opts.delay ?? 0, ease: "power3.out", onUpdate: () => { el.textContent = formatNumber(o.v, fmt); } });
}

export { gsap, ScrollTrigger, SplitText };
