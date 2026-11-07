"use client";
/* The /edgar page's motion, progressive enhancement only (the page is complete without it), following the landing's
 * pattern (components/brand/landing/ScrollFx.tsx):
 *   - only with motion allowed (html.bm, set before first paint when the reader doesn't ask for reduced motion);
 *   - GSAP + ScrollTrigger (+ Lenis on desktop pointers) load on the first sign of scrolling or after 2 s idle, in their
 *     own chunk, never in the first load;
 *   - the hero dashboard settles from its 3D tilt to flat as it scrolls up the page; the feature cards turn to face
 *     the reader; the alert cards fan apart; sections fade up as they enter. Anything already in view at that moment
 *     is shown at once (nothing that was readable is hidden again). Transform and opacity only;
 *   - the pointer gives the hero dashboard a slight turn (±2.5°).
 * Reduced motion: none of this runs and the CSS draws everything flat. */
import { useEffect } from "react";

export function LandingMotion() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("bm")) return;
    let cleanup: (() => void) | null = null, cancelled = false, armed = false;

    // Pointer turn on the hero dashboard (no library needed).
    const stage = document.querySelector<HTMLElement>("[data-stage]"), win = stage?.querySelector<HTMLElement>("[data-window]");
    const move = (e: PointerEvent) => {
      if (!stage || !win || e.pointerType !== "mouse") return;
      const r = stage.getBoundingClientRect();
      win.style.setProperty("--turn", `${(((e.clientX - r.left) / r.width) - 0.5) * 5}deg`);
    };
    const leave = () => win?.style.setProperty("--turn", "0deg");
    stage?.addEventListener("pointermove", move);
    stage?.addEventListener("pointerleave", leave);

    const EVENTS = ["wheel", "touchstart", "keydown", "scroll", "pointerdown"] as const;
    const arm = () => {
      if (armed) return;
      armed = true;
      for (const e of EVENTS) window.removeEventListener(e, arm);
      void start().then(c => { if (cancelled) c(); else cleanup = c; }).catch(() => {
        // The motion chunk didn't load: draw everything flat and visible.
        document.querySelectorAll("[data-window], .lp-float").forEach(el => el.classList.add("is-flat"));
      });
    };
    for (const e of EVENTS) window.addEventListener(e, arm, { passive: true });
    const idle = setTimeout(arm, 2000);
    return () => {
      cancelled = true; clearTimeout(idle);
      for (const e of EVENTS) window.removeEventListener(e, arm);
      stage?.removeEventListener("pointermove", move); stage?.removeEventListener("pointerleave", leave);
      cleanup?.();
    };
  }, []);
  return null;
}

async function start(): Promise<() => void> {
  const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("lenis")]);
  gsap.registerPlugin(ScrollTrigger);
  const html = document.documentElement, vh = window.innerHeight;
  const triggers: ScrollTrigger[] = [];

  // Smooth scrolling on desktop pointers; touch keeps native scrolling.
  let lenis: InstanceType<typeof Lenis> | null = null;
  if (window.matchMedia("(pointer: fine)").matches) {
    lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Reveals: what is already in view stays visible; the rest fades up on entering.
  const reveals = [...document.querySelectorAll<HTMLElement>(".lp [data-reveal]")];
  for (const el of reveals) if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add("is-in");
  html.classList.add("lp-anim");
  for (const el of reveals) {
    if (el.classList.contains("is-in")) continue;
    const delay = Number(el.dataset.reveal) || 0;
    if (delay) el.style.transitionDelay = `${delay * 90}ms`;
    triggers.push(ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => el.classList.add("is-in") }));
  }

  // The hero dashboard: tilted → flat across the first scroll.
  const stage = document.querySelector<HTMLElement>("[data-stage]"), win = stage?.querySelector<HTMLElement>("[data-window]");
  if (stage && win) {
    win.style.transition = "none";
    const tl = gsap.to(win, { "--tilt": "0deg", "--sc": 1, "--lift": "0px", ease: "none",
      scrollTrigger: { trigger: stage, start: "top 75%", end: "top 10%", scrub: 0.6 } });
    if (tl.scrollTrigger) triggers.push(tl.scrollTrigger);
  }

  // Feature cards turn to face the reader; alert cards fan apart.
  for (const el of document.querySelectorAll<HTMLElement>(".lp .lp-float")) {
    el.style.transition = "none";
    const flip = Boolean(el.closest(".lp-feature--flip"));
    const tw = gsap.fromTo(el, { "--ry": `${flip ? 12 : -12}deg`, "--rx": "6deg" }, { "--ry": "0deg", "--rx": "0deg", ease: "none",
      scrollTrigger: { trigger: el, start: "top 95%", end: "center 55%", scrub: 0.6 } });
    if (tw.scrollTrigger) triggers.push(tw.scrollTrigger);
  }
  for (const [i, el] of [...document.querySelectorAll<HTMLElement>(".lp .lp-note")].entries()) {
    const tw = gsap.fromTo(el, { y: i * -22 }, { y: 0, ease: "none", scrollTrigger: { trigger: el, start: "top 100%", end: "center 50%", scrub: 0.6 } });
    if (tw.scrollTrigger) triggers.push(tw.scrollTrigger);
  }
  ScrollTrigger.refresh();

  return () => {
    triggers.forEach(t => t.kill());
    lenis?.destroy();
    html.classList.remove("lp-anim");
  };
}
