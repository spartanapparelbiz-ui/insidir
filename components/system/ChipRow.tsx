"use client";
/* One row of category chips that scrolls sideways (never wraps, never wider than the page), with soft edge fades that
 * show only where there is more to scroll, and the active chip (aria-pressed) kept in view. */
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ChipRow({ children, label = "Category", as: Tag = "nav" }: { children: ReactNode; label?: string; as?: "nav" | "div" }) {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (on) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
    const read = () => setEdges({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    read();
    el.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => { el.removeEventListener("scroll", read); window.removeEventListener("resize", read); };
  }, []);
  return (
    <Tag ref={ref as never} className={`s-chips${edges.l ? " s-chips--l" : ""}${edges.r ? " s-chips--r" : ""}`} aria-label={label} role={Tag === "div" ? "group" : undefined}>
      {children}
    </Tag>
  );
}
