"use client";
/* Tells the pop-ups the free Read was seen: once the auto-building Read has been on screen long enough to finish
 * building (1.6 s), fires "insidir:aha-done" (components/brand/PayMoments.tsx waits 8 s more, and never fires in the
 * page's first 15 s). */
import { useEffect } from "react";

export function AhaWatch({ selector = "[data-testid=aha-read]" }: { selector?: string }) {
  useEffect(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) t = setTimeout(() => { window.dispatchEvent(new Event("insidir:aha-done")); io.disconnect(); }, 1600);
      else clearTimeout(t);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [selector]);
  return null;
}
