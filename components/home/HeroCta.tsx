"use client";
/* The home hero's actions: one black button, "Start your 7-day trial" (counted as the funnel's CTA click,
 * lib/analytics.ts), and a text link to the trackers, with the price and who handles payment under them. */
import Link from "next/link";
import { beacon } from "@/components/app/beacon";

export function HeroCta({ trialHref = "/start" }: { trialHref?: string }) {
  return (
    <>
      <Link className="btn btn--primary btn--big hero3__cta" href={trialHref} data-cta="hero" onClick={() => beacon("hero_cta_click", "hero")}>
        Start your 7-day trial
      </Link>
      <Link className="hero3__alt" href="/trackers">Explore trackers <span className="arrow" aria-hidden="true">→</span></Link>
      <p className="hero3__fine">$1 for the first week, then $39 a month. Cancel anytime. Secure sign-in and payments by Whop.</p>
    </>
  );
}
