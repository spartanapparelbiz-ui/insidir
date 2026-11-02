"use client";
/* Scroll reveals that never hide anything: every .sk-reveal is visible at rest, and gets .is-in (a short rise, app/sky.css)
 * the first time it enters the screen. Nothing at all under prefers-reduced-motion. */
import { useEffect } from "react";

export function Reveal() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }, { threshold: 0.12 });
    // Only what starts below the first screen rises in; what's already in view stays put.
    for (const el of document.querySelectorAll(".sk-reveal")) if (el.getBoundingClientRect().top > innerHeight) io.observe(el);
    return () => io.disconnect();
  }, []);
  return null;
}
