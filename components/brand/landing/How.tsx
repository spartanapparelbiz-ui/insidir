"use client";
/* How it works: three steps on the left, the active one advancing with the section's scroll (a third each); the live
 * Read card on the right. Reduced motion: all three shown as active. */
import { useRef, useState, type ReactNode } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { STEPS } from "@/lib/brand/copy";

export function HowSteps({ stage }: { stage: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(0);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.75", "end 0.6"] });
  useMotionValueEvent(scrollYProgress, "change", v => setOn(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length)))));
  return (
    <div className="b-how" ref={ref}>
      <div className="b-how__steps">
        <ol className="b-steps" data-testid="how-steps">
          {STEPS.map((s, i) => (
            <li key={s.k} className="b-step" data-on={reduce || on === i ? "true" : "false"}>
              <span className="b-label">0{i + 1} · {s.k}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </div>
      {stage}
    </div>
  );
}
