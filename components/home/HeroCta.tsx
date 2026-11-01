"use client";
/* The home hero's action: one black button, "Start for $1" (counted as the funnel's CTA click, lib/analytics.ts), with
 * the price and who handles payment under it. */
import { TRIAL_LINE } from "@/lib/copy";
import Link from "next/link";
import { beacon } from "@/components/app/beacon";

export function HeroCta({ trialHref = "/start" }: { trialHref?: string }) {
  return (
    <>
      <Link className="btn btn--primary btn--big hero3__cta" href={trialHref} data-cta="hero" onClick={() => beacon("hero_cta_click", "hero")}>
        Start for $1
      </Link>
      <p className="hero3__fine">{TRIAL_LINE}, then $39 a month. Cancel anytime. Secure sign-in and payments by Whop.</p>
    </>
  );
}
