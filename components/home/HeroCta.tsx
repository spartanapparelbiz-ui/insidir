"use client";
/* The home hero's one button, "Explore trackers →" (counted as the funnel's CTA click, lib/analytics.ts), and a text
 * link to the public track record under it. */
import Link from "next/link";
import { beacon } from "@/components/app/beacon";

export function HeroCta() {
  return (
    <>
      <Link className="btn btn--primary btn--big hero3__cta" href="/trackers" data-cta="hero" onClick={() => beacon("hero_cta_click", "hero")}>
        Explore trackers <span className="arrow" aria-hidden="true">→</span>
      </Link>
      <Link className="hero3__alt" href="/results">See the track record <span className="arrow" aria-hidden="true">→</span></Link>
    </>
  );
}
