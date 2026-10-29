"use client";
/* The home hero's one button, "Check your bet →" (counted as the funnel's CTA click, lib/analytics.ts), and a quiet
 * link to the trackers under it. */
import Link from "next/link";
import { beacon } from "@/components/app/beacon";

export function HeroCta() {
  return (
    <>
      <Link className="btn btn--primary btn--big hero3__cta" href="/check" data-cta="hero" onClick={() => beacon("hero_cta_click", "hero")}>
        Check your bet <span className="arrow" aria-hidden="true">→</span>
      </Link>
      <Link className="hero3__alt" href="/trackers">Explore the trackers <span className="arrow" aria-hidden="true">→</span></Link>
    </>
  );
}
