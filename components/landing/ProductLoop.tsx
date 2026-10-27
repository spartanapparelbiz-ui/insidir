"use client";
/* The product loop: 12 seconds of the real Terminal on a phone (recorded from the live app by qa/record-loop.ts):
 * a new deal slides in, gets tapped, the drawer opens. Muted, looping, plays only while on screen, and loads nothing
 * until it's near the viewport (preload="none", sources attached on approach). Reduced motion: the poster frame,
 * with controls to play it by choice. */
import { useEffect, useRef, useState } from "react";

export function ProductLoop() {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (!e) return;
      if (e.isIntersecting) setNear(true);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (e.isIntersecting) void v.play().catch(() => undefined); else v.pause();
      }
    }, { rootMargin: "200px 0px", threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <figure className="lp-loop">
      <video ref={ref} className="lp-loop__video" muted loop playsInline preload="none" poster="/media/terminal-loop-poster.jpg" width={390} height={844}
        controls={still} aria-label="The Terminal on a phone: a new deal slides in at the top, is tapped, and its details open.">
        {near ? <><source src="/media/terminal-loop.webm" type="video/webm" /><source src="/media/terminal-loop.mp4" type="video/mp4" /></> : null}
      </video>
      <figcaption className="lp-loop__cap">A screen recording of the real Terminal, with example deals: a new deal arrives, one tap opens the math.</figcaption>
    </figure>
  );
}
