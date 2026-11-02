"use client";
/* The brand's motion (framer-motion), all scroll-linked and calm: photos zoom slowly as they pass, sections rise into
 * place from a visible resting state (never from invisible, so nothing is hidden without JavaScript), numbers tick when
 * they change. Nothing bounces. prefers-reduced-motion turns all of it off. */
import { animate, motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Scales its photo from 1.12 to 1 as it crosses the screen; the hero from 1 to 1.12 as the page scrolls away. */
export function ScrollZoom({ children, hero = false }: { children: ReactNode; hero?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: hero ? ["start start", "end start"] : ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], hero ? [1, 1.12] : [1.12, 1]);
  return <motion.div ref={ref} className="b-photo__zoom" style={reduce ? undefined : { scale }}>{children}</motion.div>;
}

/** Rises 28px into place as it enters, starting at 60% opacity (its resting state is visible). */
export function Rise({ children, className, as = "div", delay = 0, ...rest }: { children: ReactNode; className?: string; as?: "div" | "section" | "li" | "header"; delay?: number; "data-testid"?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 1", "start 0.62"] });
  const y = useTransform(scrollYProgress, [0, 1], [28 + delay * 12, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0.6, 1]);
  const M = motion[as] as typeof motion.div;
  return <M ref={ref} className={`b-rise${className ? ` ${className}` : ""}`} style={reduce ? undefined : { y, opacity }} {...rest}>{children}</M>;
}

/** A number that ticks from its old value to the new one when it changes (not on first paint). */
export function Tick({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (from.current === value) return;
    if (reduce) { setShown(value); from.current = value; return; }
    const c = animate(from.current, value, { duration: 0.9, ease: [0.22, 0.61, 0.36, 1], onUpdate: setShown });
    from.current = value;
    return () => c.stop();
  }, [value, reduce]);
  return <span className="b-num">{format(shown)}</span>;
}

/** True once the element has been on screen (for steps that advance on scroll). */
export function useSeen<T extends HTMLElement>(margin = "-45% 0px -45% 0px") {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { margin: margin as `${number}px` });
  return [ref, seen] as const;
}
