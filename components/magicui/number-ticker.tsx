"use client";
/* NumberTicker from Magic UI (https://magicui.design, MIT License, Copyright (c) Magic UI; see ./LICENSE.md),
 * adapted: plain CSS classes instead of Tailwind, an optional prefix/suffix and compact formatting, and the final
 * value at once under reduced motion. The number it counts to is always the real one passed in. */
import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number;
  startValue?: number;
  direction?: "up" | "down";
  delay?: number;
  decimalPlaces?: number;
  /** "$" before, "K" after, and so on. */
  prefix?: string;
  suffix?: string;
}

export function NumberTicker({ value, startValue = 0, direction = "up", delay = 0, className, decimalPlaces = 0, prefix = "", suffix = "", ...props }: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(direction === "down" ? value : startValue);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const fmt = (v: number) => `${prefix}${Intl.NumberFormat("en-US", { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(Number(v.toFixed(decimalPlaces)))}${suffix}`;

  useEffect(() => {
    if (reduce) { if (ref.current) ref.current.textContent = fmt(value); return; }
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isInView) timer = setTimeout(() => { motionValue.set(direction === "down" ? startValue : value); }, delay * 1000);
    return () => { if (timer !== null) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionValue, isInView, delay, value, direction, startValue, reduce]);

  useEffect(() => springValue.on("change", latest => { if (ref.current) ref.current.textContent = fmt(latest); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [springValue, decimalPlaces, prefix, suffix]);

  // The real value is in the server-rendered HTML (no JS, crawlers, screen readers); it ticks up from startValue once
  // in view.
  return <span ref={ref} className={["mu-ticker", className].filter(Boolean).join(" ")} {...props} suppressHydrationWarning>{fmt(value)}</span>;
}
