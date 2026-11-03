"use client";
/* The globe stage background: /brand/globe.mp4 twice, cross-fading at the loop point (its last frame doesn't match its
 * first), never animated otherwise. Reduced motion: holds the first frame. Only rendered when the clip is in
 * public/brand (Stage checks); otherwise the stage shows the hero still. */
import { useEffect, useRef } from "react";

const FADE = 0.9;

export function Globe({ src, poster }: { src: string; poster: string }) {
  const a = useRef<HTMLVideoElement>(null), b = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const A = a.current, B = b.current;
    if (!A || !B) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      A.removeAttribute("autoplay"); A.pause(); B.pause();
      try { A.currentTime = 0; } catch { /* not loaded */ }
      return;
    }
    let cur = A, nxt = B, swapping = false, timer: ReturnType<typeof setTimeout> | undefined;
    const play = (v: HTMLVideoElement) => { const p = v.play(); if (p && typeof p.catch === "function") p.catch(() => undefined); };
    play(A);
    const tick = () => {
      if (swapping || !cur.duration) return;
      if (cur.duration - cur.currentTime > FADE) return;
      swapping = true;
      const out = cur;
      nxt.currentTime = 0; play(nxt);
      nxt.classList.add("is-active"); out.classList.remove("is-active");
      cur = nxt; nxt = out;
      timer = setTimeout(() => { out.pause(); out.currentTime = 0; swapping = false; }, FADE * 1000 + 100);
    };
    A.addEventListener("timeupdate", tick); B.addEventListener("timeupdate", tick);
    return () => { clearTimeout(timer); A.removeEventListener("timeupdate", tick); B.removeEventListener("timeupdate", tick); };
  }, []);
  return (
    <div className="b-globe">
      <video ref={a} className="is-active" autoPlay muted loop playsInline preload="auto" disablePictureInPicture aria-hidden="true" poster={poster}><source src={src} type="video/mp4" /></video>
      <video ref={b} muted loop playsInline preload="auto" disablePictureInPicture aria-hidden="true" poster={poster}><source src={src} type="video/mp4" /></video>
    </div>
  );
}
