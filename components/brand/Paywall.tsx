"use client";
/* The paywall, said once: a headline from what they care about, three bullets, the pill timeline (Today $1 → Day 2
 * reminder → <date> $39/mo), "Remind me before I'm charged" (on by default), 18+, the full price right above the white
 * Start for $1 pill, Apple Pay listed first, the trust line. Used by /go's paywall step and the pop-up modal. */
import { useState } from "react";
import { PLANS, TRIAL } from "@/lib/plans";
import { Arrow } from "./Bits";

const DAY = 86_400_000;
const ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
export const chargeDate = (now: number): string => ET.format(new Date(now + TRIAL.days * DAY));

export const PAY_BULLETS = ["Every millionaire trade, live, with the side they took", "A ping the moment a wallet you follow trades"] as const;

export function Timeline({ now }: { now: number }) {
  return (
    <ol className="b-timeline" aria-label="How the trial works" data-testid="paywall-timeline">
      <li>Today ${TRIAL.fee}</li><li className="b-sep" aria-hidden="true"><Arrow /></li>
      <li>Day 2 reminder</li><li className="b-sep" aria-hidden="true"><Arrow /></li>
      <li>{chargeDate(now)} ${PLANS.insidir.price}/mo</li>
    </ol>
  );
}

export function Paywall({ headline, bullets = PAY_BULLETS, now, href, testid = "paywall", onStart, record = null }: {
  headline: React.ReactNode; bullets?: readonly string[]; now: number; href: string; testid?: string; onStart?: (remind: boolean) => void;
  /** The leading rule's line (lib/autopilot/lead.ts leadLine), only when one is positive over 100+ settled bets. */
  record?: string | null;
}) {
  const [remind, setRemind] = useState(true);
  const go = `${href}${href.includes("?") ? "&" : "?"}remind=${remind ? 1 : 0}`;
  return (
    <div style={{ display: "grid", gap: 14 }} data-testid={testid}>
      <h2 className="b-modal__h" data-testid="paywall-headline">{headline}</h2>
      <ul className="b-bullets">{bullets.map(b => <li key={b}><Arrow /><span>{b}</span></li>)}</ul>
      {record ? <p className="b-small" data-testid="paywall-record">{record} Past results, not a promise.</p> : null}
      <Timeline now={now} />
      <label className="b-toggle"><span>Remind me before I&apos;m charged</span><input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} data-testid="paywall-remind" /></label>
      <p className="b-small" style={{ color: "var(--ink-muted)" }} data-testid="paywall-price">${TRIAL.fee} today, then ${PLANS.insidir.price}/month from {chargeDate(now)}. Cancel anytime. 18+ only.</p>
      <a className="b-btn b-btn-lg b-primary" style={{ width: "100%" }} href={go} data-testid="paywall-start" data-checkout="paywall" data-unlock="paywall" onClick={() => onStart?.(remind)}>Start for ${TRIAL.fee}<Arrow /></a>
      <p className="b-small" style={{ textAlign: "center" }}>Apple Pay, Google Pay or card · Secure checkout</p>
    </div>
  );
}
