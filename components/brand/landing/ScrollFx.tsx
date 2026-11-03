"use client";
/* The landing's scroll layer, progressive enhancement only: the page is complete without it.
 *   Always: the sticky phone (What members get) shows the screen of the step the reader is on (an IntersectionObserver;
 *     without JS it shows the first).
 *   With motion allowed (html.bm: no reduced motion, IntersectionObserver present), on the reader's first move to scroll
 *     (wheel, touch, a scroll key, a scroll), GSAP + ScrollTrigger + Lenis load (a separate chunk, never in the first
 *     load) and, for what is still below the viewport at that moment only:
 *       numbers [data-count] count up from 0 to their real value as they enter;
 *       bars [data-bar] fill from 0 to their real length;
 *       rows in [data-stagger] come in one after another;
 *       the Pulse's cards [data-slot] slide into their grid slots while the dashboard sticks (desktop; on phones
 *         they come in as it enters);
 *       the markets row scrolls sideways while its stage sticks (desktop; a swipe on phones), photos parallax;
 *       the disagreement stage keeps its headline pinned and scrubs through its markets (desktop);
 *     Pinned stages are sticky with their height reserved in CSS from first paint: the layout never moves.
 *       stage backgrounds darken at the boundaries between stages (a cross-fade) and their scenery drifts 0 → −8% while
 *       settling from 1.06 to 1; a thin progress line runs along the top.
 *     Transform and opacity only. Anything that entered and isn't finished within 1.2 s snaps to its final state.
 *   Reduced motion: none of the motion is loaded. */
import { useEffect } from "react";

const SNAP_MS = 1200;

export function ScrollFx() {
  // The sticky phone follows the step in view.
  useEffect(() => {
    const story = document.querySelector("[data-story]");
    const phone = story?.querySelector<HTMLElement>(".b-phone[data-active]");
    if (!story || !phone || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) phone.dataset.active = (e.target as HTMLElement).dataset.step ?? "0";
    }, { rootMargin: "-45% 0px -45% 0px" });
    for (const s of story.querySelectorAll("[data-step]")) io.observe(s);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("bm")) return;
    let cleanup: (() => void) | null = null, cancelled = false;
    const EVENTS = ["wheel", "touchstart", "keydown", "scroll"] as const;
    const arm = () => {
      for (const e of EVENTS) window.removeEventListener(e, arm);
      void start().then(c => { if (cancelled) c(); else cleanup = c; });
    };
    for (const e of EVENTS) window.addEventListener(e, arm, { passive: true });
    return () => { cancelled = true; for (const e of EVENTS) window.removeEventListener(e, arm); cleanup?.(); };
  }, []);
  return null;
}

async function start(): Promise<() => void> {
  const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("lenis")]);
  gsap.registerPlugin(ScrollTrigger);
  const vh = window.innerHeight, phone = window.matchMedia("(max-width: 860px)").matches;
  const below = (el: Element) => el.getBoundingClientRect().top >= vh + 20;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const snapLater = (fn: () => void) => timers.push(setTimeout(fn, SNAP_MS));

  // Smooth scrolling on desktop pointers; touch keeps native scrolling.
  const lenis = phone ? null : new Lenis({ lerp: 0.12, smoothWheel: true });
  const raf = (t: number) => lenis?.raf(t * 1000);
  if (lenis) { lenis.on("scroll", ScrollTrigger.update); gsap.ticker.add(raf); gsap.ticker.lagSmoothing(0); }

  const ctx = gsap.context(() => {
    // The progress line.
    const line = document.createElement("div");
    line.className = "b-progress"; line.setAttribute("aria-hidden", "true");
    document.body.appendChild(line);
    gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: true } });

    // Numbers count up (from 0 to the server-rendered value) as they enter.
    for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
      if (!below(el)) continue;
      const to = Number(el.dataset.count), final = el.textContent ?? "";
      if (!Number.isFinite(to) || to <= 0) continue;
      const fmt = (v: number) => el.dataset.fmt === "usd" ? usd(v) : el.dataset.fmt === "cents" ? `${Math.round(v)}¢` : Math.round(v).toLocaleString("en-US");
      const o = { v: 0 };
      el.textContent = fmt(0);
      ScrollTrigger.create({ trigger: el, start: "top 92%", once: true, onEnter: () => {
        gsap.to(o, { v: to, duration: 1.1, ease: "power3.out", onUpdate: () => { el.textContent = fmt(o.v); }, onComplete: () => { el.textContent = final; } });
        snapLater(() => { if (o.v < to * 0.5) { gsap.killTweensOf(o); el.textContent = final; } });
      } });
    }
    // Bars fill from 0 to their real length.
    for (const el of document.querySelectorAll<HTMLElement>("[data-bar]")) {
      if (!below(el)) continue;
      const to = Number(el.dataset.bar);
      gsap.fromTo(el, { scaleX: 0 }, { scaleX: to, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 92%", once: true } });
    }
    // Rows come in one by one.
    for (const list of document.querySelectorAll<HTMLElement>("[data-stagger]")) {
      if (!below(list)) continue;
      const kids = [...list.children] as HTMLElement[];
      gsap.fromTo(kids, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, stagger: 0.07, ease: "power3.out", scrollTrigger: { trigger: list, start: "top 90%", once: true } });
    }
    // The Pulse: its cards slide into their slots while the dashboard sticks (desktop: the stage is two screens tall
    // from first paint, app/brand.css, so nothing moves the layout), or as it enters (phones).
    const dash = document.querySelector<HTMLElement>("[data-pin=pulse]");
    if (dash && below(dash)) {
      const cards = [...dash.querySelectorAll<HTMLElement>("[data-slot]")];
      const from = (i: number) => ({ opacity: 0, x: [-60, 0, 60, -40, 40][i % 5]!, y: 70 + (i % 3) * 20, scale: 0.96 });
      const stage = dash.closest(".b-stage");
      if (!phone && stage) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.6 } });
        cards.forEach((c, i) => tl.fromTo(c, from(i), { opacity: 1, x: 0, y: 0, scale: 1, ease: "power2.out", duration: 1 }, i * 0.45));
      } else {
        gsap.fromTo(cards, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: dash, start: "top 85%", once: true } });
      }
    }
    // Markets: the row scrolls sideways while its stage sticks (desktop; the stage's extra height is reserved in CSS
    // from the card count); a swipe on phones.
    const row = document.querySelector<HTMLElement>("[data-hrow]");
    if (row && !phone && below(row)) {
      const track = row.querySelector<HTMLElement>("[data-htrack]"), stage = row.closest(".b-stage");
      const dist = track ? track.scrollWidth - row.clientWidth : 0;
      if (track && stage && dist > 40) gsap.to(track, { x: -dist, ease: "none", scrollTrigger: { trigger: stage, start: "top top", end: "bottom bottom", scrub: 0.5 } });
    }
    for (const img of document.querySelectorAll<HTMLElement>(".b-ccard__img img")) {
      gsap.fromTo(img, { yPercent: -6, scale: 1.12 }, { yPercent: 6, scale: 1.12, ease: "none", scrollTrigger: { trigger: img.closest(".b-ccard") ?? img, start: "top bottom", end: "bottom top", scrub: true } });
    }
    // "Where they disagree with the price": the headline stays pinned (sticky, its height reserved by the cards in CSS)
    // while the reader scrubs through the markets: each card comes up to full as it reaches the middle of the screen,
    // its meter filling with it, and fades back as the next one arrives. Desktop; phones get the plain stagger.
    if (!phone) {
      for (const card of document.querySelectorAll<HTMLElement>(".s-pinstage .s-pin__card")) {
        const bars = card.querySelectorAll<HTMLElement>(".s-grow");
        const tl = gsap.timeline({ scrollTrigger: { trigger: card, start: "top 85%", end: "bottom 15%", scrub: 0.4 } });
        tl.fromTo(card, { opacity: 0.25, y: 48, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, ease: "power2.out", duration: 1 })
          .fromTo(bars, { scaleX: 0 }, { scaleX: 1, ease: "power2.out", duration: 0.8 }, 0.2)
          .to(card, { opacity: 0.35, ease: "power1.in", duration: 0.6 }, 1.6);
      }
    }
    // Scenery drifts slowly as its stage passes (0 → −8%) and settles from 1.06 to 1: transform only.
    for (const img of document.querySelectorAll<HTMLElement>(".b-stage__bg img")) {
      const stage = img.closest(".b-stage");
      if (!stage) continue;
      gsap.fromTo(img, { yPercent: 0, scale: 1.06 }, { yPercent: -8, scale: 1, ease: "none", scrollTrigger: { trigger: stage, start: "top bottom", end: "bottom top", scrub: true } });
    }
    // Stage backgrounds darken toward the boundaries, so stages hand over to each other.
    for (const bg of document.querySelectorAll<HTMLElement>(".b-stage__bg")) {
      const stage = bg.closest(".b-stage");
      if (!stage || stage.hasAttribute("data-first")) continue;
      gsap.fromTo(bg, { opacity: 0.35 }, { opacity: 1, ease: "none", scrollTrigger: { trigger: stage, start: "top bottom", end: "top 40%", scrub: true } });
    }
  });
  ScrollTrigger.refresh();
  return () => {
    for (const t of timers) clearTimeout(t);
    ctx.revert();
    document.querySelector(".b-progress")?.remove();
    if (lenis) { gsap.ticker.remove(raf); lenis.destroy(); }
  };
}

function usd(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1e3) return `$${Math.round(a / 1e3)}K`;
  return `$${Math.round(a)}`;
}
