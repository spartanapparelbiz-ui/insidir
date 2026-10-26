"use client";
/* The device frames around the real Terminal rows (CSS only, no images): a phone on every screen, plus a laptop on
 * desktop. The phone's list scrolls slowly, only while it's on screen, and never under reduced motion (the CSS
 * checks it). The list is drawn twice for a seamless loop; the copy is hidden from screen readers and keyboards. */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function Devices({ phone, laptop, loop }: { phone: ReactNode; laptop: ReactNode; loop: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || !loop || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOn(Boolean(e?.isIntersecting)), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [loop]);
  return (
    <div ref={box} className={`devices${on ? " devices--on" : ""}`}>
      <div className="device device--phone" aria-label="The Terminal on a phone">
        <div className="device__screen">
          <div className="device__scroll">
            {phone}
            {loop ? <div aria-hidden="true" inert>{phone}</div> : null}
          </div>
        </div>
      </div>
      <div className="device device--laptop" aria-hidden="true">
        <div className="device__screen"><div className="device__canvas" inert>{laptop}</div></div>
        <div className="device__base" />
      </div>
    </div>
  );
}
