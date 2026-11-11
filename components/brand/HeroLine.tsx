"use client";
/* The hero's live line: "Wallets up $100K+ bet $4.2M today. Which side were you on?" The amount is the real total of
 * every watched wallet's bets (up $100K+) since midnight ET (under $100K: the last 24 hours, said so), re-read every minute.
 * It shows the real total from first paint (never a count from $0) and ticks to each new total. Reduced motion: no tick. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { heroTotalAll, type Pulse } from "@/lib/millionaires/pulse-shape";
import { dollars } from "@/lib/money";

export function HeroLine({ initial }: { initial: Pulse }) {
  const [t, setT] = useState(() => heroTotalAll(initial));
  const [shown, setShown] = useState(t.amount);
  const from = useRef<number | null>(t.amount);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try { const r = await fetch("/api/millionaires/live?n=1", { cache: "no-store" }); if (r.ok) setT(heroTotalAll((await r.json()).pulse)); } catch { /* keep */ }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Tick from the last value to each new one (the first value is already shown as rendered).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(t.amount); from.current = t.amount; return; }
    const start = from.current ?? 0, to = t.amount, delay = from.current === null ? 600 : 0, dur = 1400;
    from.current = to;
    if (start === to) { setShown(to); return; }
    let raf = 0, t0 = 0;
    const step = (ts: number) => {
      if (!t0) t0 = ts;
      const k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      setShown(start + (to - start) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    setShown(start);
    const timer = setTimeout(() => { raf = requestAnimationFrame(step); }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [t.amount]);

  return (
    <p className="b-sub" data-m="lift" style={{ "--d": ".58s" } as CSSProperties} data-testid="hero-line" aria-live="polite">
      Wallets up $100K+ trade <span className="b-num" style={{ fontWeight: 500, color: "#fff" }} data-testid="hero-total" data-amount={Math.round(t.amount)}>{dollars(shown)}</span> {t.window === "today" ? "today" : "in the last 24 hours"}.<br />{" "}Which side were you on?
    </p>
  );
}
