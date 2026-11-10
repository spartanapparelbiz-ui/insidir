"use client";
/* Phones: once the hero is off screen, a bar pinned to the bottom with the one next step (start onboarding), until the
 * page's own last call to action is on screen. Desktop has the nav's Start button in view at all times. */
import { useEffect, useState } from "react";
import { START } from "@/lib/brand/copy";

export function StickyStart() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('[data-testid="hero"]'), last = document.querySelector('[data-testid="final-cta"]');
    if (!hero) return;
    let heroOn = true, lastOn = false;
    const set = () => setShow(!heroOn && !lastOn);
    const io = new IntersectionObserver(es => {
      for (const e of es) { if (e.target === hero) heroOn = e.isIntersecting; else lastOn = e.isIntersecting; }
      set();
    }, { threshold: 0 });
    io.observe(hero);
    if (last) io.observe(last);
    return () => io.disconnect();
  }, []);
  return (
    <div className="b-sticky" data-on={show ? "" : undefined} aria-hidden={!show} data-testid="sticky-start">
      <span className="b-sticky__t"><b>$1 for 3 days</b><span>Every millionaire bet, live</span></span>
      <a className="b-btn b-sticky__go" href="/go?step=checkout" tabIndex={show ? 0 : -1} data-checkout="sticky" data-unlock="sticky">{START}<svg viewBox="0 0 12 12" aria-hidden="true" width="12" height="12"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></a>
    </div>
  );
}
