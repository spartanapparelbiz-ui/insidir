"use client";
/* The four behaviours, run once per stage: when a stage (.b-stage) enters the viewport it gets .is-in (its masked lines
 * rise, its subtitle lifts into focus, its pills, cards and rows settle, its small text lifts), and 2.6 s later
 * .is-done, so every entrance rule stops matching and the static design is left. The first stage waits for the
 * fonts (900 ms at most), like the spec's hero. Stages added later (a /go step) are picked up too.
 * Reduced motion: html.bm is never set (app/layout.tsx), so none of it runs. */
import { useEffect } from "react";

export function StageMotion() {
  useEffect(() => {
    const root = document.documentElement;
    (window as unknown as { __bmOK?: boolean }).__bmOK = true; // app/layout.tsx drops html.bm if this never runs
    if (!root.classList.contains("bm")) return;
    const seen = new WeakSet<Element>();
    const play = (el: Element) => {
      if (el.classList.contains("is-in") || el.classList.contains("is-done")) return;
      el.classList.add("is-in");
      setTimeout(() => el.classList.add("is-done"), 2600);
    };
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { play(e.target); io.unobserve(e.target); }
    }, { threshold: 0.18 });
    let fontsReady = false;
    const pending: Element[] = [];
    const ready = () => { if (fontsReady) return; fontsReady = true; for (const el of pending.splice(0)) io.observe(el); };
    const watch = () => {
      for (const el of document.querySelectorAll(".b-stage")) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (fontsReady) io.observe(el); else pending.push(el);
      }
    };
    watch();
    const t = setTimeout(ready, 900);
    void (document.fonts?.ready ?? Promise.resolve()).then(ready, ready);
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { clearTimeout(t); io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}
