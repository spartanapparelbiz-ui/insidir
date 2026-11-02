"use client";
/* The landing's motion, in one place, over server-rendered markup (components/brand/landing/Landing.tsx data-* hooks).
 * Lenis + GSAP ScrollTrigger + SplitText on one ticker (scroll/engine.ts). Transform and opacity only.
 *   progress line and glass nav · first screen: intro, the free Read builds itself, the photo pushes in as you leave ·
 *   the mark: pinned, two brackets lock together in the beam, one line · Markets: pinned horizontal row on desktop
 *   (native swipe on phones), each photo parallaxing inside its card · How it works: pinned, three steps (typing, the
 *   Read building, Open + a ping) · Proof counts up · Features rise in a stagger · Pricing fades up · the final mark
 *   draws itself · headlines reveal line by line · photos move 10% slower than their frames and push in.
 * Reduced motion: none of it (no Lenis, no pins), everything at rest, and the free Read counts as seen at once. */
import { useEffect } from "react";
import { animating, countUp, gsap, phone, reduced, register, ScrollTrigger, SplitText, startSmooth } from "../scroll/engine";

const EXPO = "expo.out";

/** The free Read building itself: the bar fills, numbers tick from zero, wallet rows slide in. */
export function buildRead(card: HTMLElement | null, onDone?: () => void, delay = 0.3): gsap.core.Timeline | null {
  if (!card) { onDone?.(); return null; }
  const tl = gsap.timeline({ delay, onComplete: onDone });
  tl.set(card.querySelectorAll(".b-tierblock, .b-wrows"), { opacity: 1 }, 0);
  const bars = card.querySelectorAll<HTMLElement>("[data-share]");
  bars.forEach(b => tl.fromTo(b, { scaleX: 0 }, { scaleX: Number(b.dataset.share), duration: 1.2, ease: EXPO, ...animating }, 0));
  card.querySelectorAll<HTMLElement>("[data-value]").forEach((n, i) => { const t = countUp(n, { duration: 1.3 }); if (t) tl.add(t, 0.05 * i); });
  const rows = card.querySelectorAll<HTMLElement>("[data-wrow]");
  if (rows.length) tl.from(rows, { y: 14, opacity: 0, duration: 0.8, ease: EXPO, stagger: 0.12, clearProps: "transform,opacity" }, 0.5);
  return tl;
}

export function LandingMotion() {
  useEffect(() => {
    register();
    const stopSmooth = startSmooth();
    const R = reduced(), P = phone();
    const root = document.querySelector<HTMLElement>("[data-testid=landing]");
    if (!root) return stopSmooth;
    const nav = document.querySelector<HTMLElement>("[data-nav]");
    const ctx = gsap.context(() => {
      // Progress line and the nav's glass bar after the first screen.
      gsap.to("[data-progress]", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: true } });
      ScrollTrigger.create({ trigger: "[data-scene=first]", start: "bottom top+=80", onEnter: () => nav?.setAttribute("data-glass", "true"), onLeaveBack: () => nav?.setAttribute("data-glass", "false") });

      const aha = root.querySelector<HTMLElement>("[data-scene=first] [data-build]");
      const ahaDone = () => window.dispatchEvent(new Event("insidir:aha-done"));
      if (R) { ahaDone(); return; }

      // First screen: content rises in; the free Read builds; the photo pushes in as you scroll away.
      gsap.from("[data-scene=first] [data-intro]", { y: 24, opacity: 0, duration: 1, ease: EXPO, stagger: 0.08, clearProps: "transform,opacity" });
      buildRead(aha, ahaDone, 0.6);
      gsap.to("[data-pushbg]", { scale: 1.15, yPercent: -4, ease: "none", scrollTrigger: { trigger: "[data-scene=first]", start: "top top", end: "bottom top", scrub: true, toggleClass: { targets: "[data-pushbg]", className: "is-anim" } } });

      // Headlines, line by line.
      root.querySelectorAll<HTMLElement>("[data-split]").forEach(el => {
        SplitText.create(el, {
          type: "lines", mask: "lines", autoSplit: true, linesClass: "b-split-line",
          onSplit: self => gsap.from(self.lines, { y: 24, opacity: 0, duration: 0.9, ease: EXPO, stagger: 0.06, scrollTrigger: { trigger: el, start: "top 86%", once: true } }),
        });
      });

      // Photos: the image moves 10% slower than its frame (halved on phones) and pushes in while in view.
      const amp = P ? 4 : 8;
      root.querySelectorAll<HTMLElement>("[data-parallax]").forEach(img => {
        if (img.closest("[data-hrow]")) return;
        const frame = img.parentElement!;
        gsap.fromTo(img, { yPercent: -amp, scale: 1 }, { yPercent: amp, scale: 1.08, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: true, toggleClass: { targets: img, className: "is-anim" } } });
      });

      // The mark: pinned; the two brackets come in from opposite corners and lock in the beam; one line; then it all fades.
      const mark = root.querySelector<HTMLElement>("[data-scene=mark]");
      if (mark) {
        const w = window.innerWidth, h = window.innerHeight;
        gsap.timeline({ scrollTrigger: { trigger: mark, start: "top top", end: P ? "+=70%" : "+=120%", pin: true, scrub: 0.6 } })
          .from(mark.querySelector("[data-mark-beam]"), { opacity: 0, scale: 0.85, duration: 1, ease: "power3.out" }, 0)
          .from(mark.querySelector("[data-bracket=a]"), { x: -w * 0.42, y: -h * 0.4, opacity: 0, duration: 1.2, ease: "power3.out" }, 0)
          .from(mark.querySelector("[data-bracket=b]"), { x: w * 0.42, y: h * 0.4, opacity: 0, duration: 1.2, ease: "power3.out" }, 0)
          .from(mark.querySelector("[data-mark-line]"), { y: 24, opacity: 0, duration: 0.8, ease: EXPO }, 1)
          .to(mark.querySelector(".b-mark__in"), { opacity: 0, y: -30, duration: 0.8, ease: "power3.out" }, 2.4)
          .to(mark.querySelector("[data-mark-beam]"), { opacity: 0, duration: 0.8, ease: "power3.out" }, 2.4);
      }

      // Markets: on desktop the row scrolls left while pinned, photos parallaxing inside their cards; phones swipe.
      const scene = root.querySelector<HTMLElement>("[data-scene=markets]");
      const row = root.querySelector<HTMLElement>("[data-hrow]");
      if (scene && row && !P) {
        const dist = () => Math.max(0, row.scrollWidth - window.innerWidth);
        if (dist() > 0) {
          const h = gsap.to(row, { x: () => -dist(), ease: "none", scrollTrigger: { trigger: scene, start: "top top", end: () => `+=${dist()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true } });
          row.querySelectorAll<HTMLElement>("[data-parallax]").forEach(img => {
            gsap.fromTo(img, { xPercent: -6, scale: 1.12 }, { xPercent: 6, scale: 1.12, ease: "none", scrollTrigger: { trigger: img.parentElement!, containerAnimation: h, start: "left right", end: "right left", scrub: true } });
          });
        }
      }

      // How it works: pinned for three steps; each step plays its own short scene when it becomes active.
      const how = root.querySelector<HTMLElement>("[data-scene=how]");
      if (how) {
        const steps = [...how.querySelectorAll<HTMLElement>("[data-step]")];
        const panes = [...how.querySelectorAll<HTMLElement>("[data-pane]")];
        const typed = how.querySelector<HTMLElement>("[data-typed]");
        const open = how.querySelector<HTMLElement>("[data-open]");
        const ping = how.querySelector<HTMLElement>("[data-ping]");
        if (ping) gsap.set(ping, { yPercent: -160, opacity: 0 });
        let current = -1;
        const plays: Array<() => void> = [
          () => {
            if (!typed) return;
            const text = typed.dataset.typed ?? "";
            const o = { n: 0 };
            gsap.to(o, { n: text.length, duration: Math.min(1.6, 0.05 * text.length + 0.3), ease: "none", onUpdate: () => { typed.textContent = text.slice(0, Math.round(o.n)); } });
          },
          () => buildRead(panes[1]?.querySelector("[data-testid=how-read]") ?? null, undefined, 0.1),
          () => {
            if (open) gsap.delayedCall(0.3, () => open.setAttribute("data-hot", "true"));
            if (ping) gsap.to(ping, { yPercent: 0, opacity: 1, duration: 0.9, ease: EXPO, delay: 0.6, ...animating });
          },
        ];
        const show = (i: number) => {
          if (i === current) return;
          current = i;
          steps.forEach((s, j) => s.setAttribute("data-on", j === i ? "true" : "false"));
          panes.forEach((p, j) => {
            if (j === i) { p.hidden = false; gsap.fromTo(p, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, ease: EXPO }); }
            else { p.hidden = true; }
          });
          if (i < 2) { open?.setAttribute("data-hot", "false"); if (ping) gsap.to(ping, { yPercent: -160, opacity: 0, duration: 0.4, ease: "power3.out" }); }
          plays[i]?.();
        };
        ScrollTrigger.create({
          trigger: how, start: "top top", end: P ? "+=160%" : "+=240%", pin: true,
          onUpdate: st => show(Math.min(2, Math.floor(st.progress * 3))),
          onEnter: () => show(0),
        });
      }

      // Proof counts up; Pricing fades up; Features rise in a stagger.
      root.querySelectorAll<HTMLElement>("[data-count]").forEach(el => {
        ScrollTrigger.create({ trigger: el, start: "top 80%", once: true, onEnter: () => { countUp(el, { duration: 1.8 }); } });
      });
      root.querySelectorAll<HTMLElement>("[data-rise]").forEach(el => {
        gsap.from(el, { y: 40, opacity: 0, duration: 1.1, ease: EXPO, scrollTrigger: { trigger: el, start: "top 82%", once: true }, ...animating });
      });
      root.querySelectorAll<HTMLElement>("[data-stagger]").forEach(el => {
        gsap.from(el.children, { y: 36, opacity: 0, duration: 0.9, ease: EXPO, stagger: 0.08, clearProps: "transform,opacity", scrollTrigger: { trigger: el, start: "top 82%", once: true } });
      });

      // The final mark draws itself as a thin orange outline, then the headline and the button.
      const draw = root.querySelector<SVGSVGElement>("[data-draw]");
      if (draw) {
        const rects = [...draw.querySelectorAll<SVGRectElement>("rect")];
        rects.forEach(r => { const len = 2 * (r.width.baseVal.value + r.height.baseVal.value); r.style.strokeDasharray = `${len}`; r.style.strokeDashoffset = `${len}`; });
        const fin = draw.closest<HTMLElement>("[data-scene=final]");
        const btn = fin?.querySelector<HTMLElement>(".b-btn");
        if (btn && fin && fin.getBoundingClientRect().top > window.innerHeight) gsap.set(btn, { y: 20, opacity: 0 });
        ScrollTrigger.create({
          trigger: fin, start: "top 70%", once: true,
          onEnter: () => {
            gsap.to(rects, { strokeDashoffset: 0, duration: 1.6, ease: "power3.out", stagger: 0.15 });
            if (btn) gsap.to(btn, { y: 0, opacity: 1, duration: 0.8, ease: EXPO, delay: 0.9, clearProps: "transform,opacity" });
          },
        });
      }
    }, root);
    // Fonts and images change heights: measure again once everything is in.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    void document.fonts?.ready.then(refresh);
    return () => { window.removeEventListener("load", refresh); ctx.revert(); stopSmooth(); };
  }, []);
  return null;
}
