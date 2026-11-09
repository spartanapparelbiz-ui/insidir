"use client";
/* Phones: a thin navy bar holding the orange Start for $1, shown only once the board panel has scrolled past and hidden
 * again when the pricing block is on screen (the page's own last button). Desktop has none. */
import { useEffect, useState } from "react";
import { START } from "@/lib/brand/copy";

export function StickyStart() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const board = document.querySelector('[data-testid="landing-board"]'), last = document.querySelector('[data-testid="pricing"]');
    if (!board) return;
    let past = false, lastOn = false;
    const set = () => setShow(past && !lastOn);
    const io = new IntersectionObserver(es => {
      for (const e of es) {
        if (e.target === board) past = !e.isIntersecting && e.boundingClientRect.top < 0;
        else lastOn = e.isIntersecting;
      }
      set();
    }, { threshold: 0 });
    io.observe(board);
    if (last) io.observe(last);
    return () => io.disconnect();
  }, []);
  return (
    <div className="t-sticky" data-on={show ? "" : undefined} aria-hidden={!show} data-testid="sticky-start">
      <span className="t-sticky__t">$1 · 3 DAYS → $39/MO</span>
      <a className="t-cta" href="/go" tabIndex={show ? 0 : -1} data-checkout="sticky" data-cta="sticky">{START} →</a>
    </div>
  );
}
