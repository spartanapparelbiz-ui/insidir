"use client";
/* A number that ticks when it changes: on a new value it counts from the old one (600ms) and flashes green going up,
 * red going down. The first render shows the value as is. Instant under prefers-reduced-motion. */
import { useEffect, useRef, useState } from "react";

import { fmt, type TickFormat } from "@/lib/nx/fmt";


export function Tick({ value, format = "usd", className }: { value: number; format?: TickFormat; className?: string }) {
  const [shown, setShown] = useState(value);
  const [dir, setDir] = useState<"" | "is-up" | "is-down">("");
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    setDir(value > from ? "is-up" : "is-down");
    const off = setTimeout(() => setDir(""), 1200);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return () => clearTimeout(off); }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 600); setShown(from + (value - from) * k); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); clearTimeout(off); };
  }, [value]);
  return <span className={`nx-tick${dir ? ` ${dir}` : ""}${className ? ` ${className}` : ""}`}>{fmt(shown, format)}</span>;
}
