"use client";
/* The paywall, said once: a headline built from what they care about, three bullets, the trial timeline (Today $1 →
 * Day 2 we remind you → <date> $39/month), "Remind me before I'm charged" (on by default), 18+, the full price right
 * above the button, Apple Pay listed first, and the trust line. Used by /go's paywall step and the pop-up sheet. */
import { useState } from "react";
import { PLANS, TRIAL } from "@/lib/plans";

const DAY = 86_400_000;
const ET = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export function chargeDate(now: number): string { return ET.format(new Date(now + TRIAL.days * DAY)); }

export const PAY_BULLETS = [
  "Every millionaire bet, live, with the side they took",
  "Millionaire and Pro money on any market you paste",
  "A ping the moment a wallet you follow bets",
] as const;

export function Paywall({ headline, bullets = PAY_BULLETS, now, href, onStart, testid = "paywall", cta = `Start for $${TRIAL.fee}` }: {
  headline: React.ReactNode; bullets?: readonly string[]; now: number; href: string; onStart?: (remind: boolean) => void; testid?: string; cta?: string;
}) {
  const [remind, setRemind] = useState(true);
  const date = chargeDate(now);
  const go = `${href}${href.includes("?") ? "&" : "?"}remind=${remind ? 1 : 0}`;
  return (
    <div style={{ display: "grid", gap: 16 }} data-testid={testid}>
      <h2 className="b-sheet__h" data-testid="paywall-headline">{headline}</h2>
      <ul className="b-bullets">{bullets.map(b => <li key={b}>{b}</li>)}</ul>
      <ol className="b-timeline" aria-label="How the trial works" data-testid="paywall-timeline">
        <li><span className="b-label">Today</span><b>${TRIAL.fee}</b><span className="b-small">{TRIAL.days} days of everything</span></li>
        <li><span className="b-label">Day 2</span><b>Reminder</b><span className="b-small">we remind you</span></li>
        <li><span className="b-label">{date}</span><b>${PLANS.insidir.price}/mo</b><span className="b-small">unless you cancel</span></li>
      </ol>
      <label className="b-toggle"><span>Remind me before I&apos;m charged</span><input type="checkbox" checked={remind} onChange={e => setRemind(e.target.checked)} data-testid="paywall-remind" /></label>
      <p className="b-small" style={{ color: "var(--b-text)" }} data-testid="paywall-price">${TRIAL.fee} today, then ${PLANS.insidir.price}/month from {date}. Cancel anytime. 18+ only.</p>
      <a className="b-btn b-btn--block" href={go} data-testid="paywall-start" data-checkout="paywall" onClick={() => onStart?.(remind)}>{cta} <span aria-hidden="true">→</span></a>
      <p className="b-small" style={{ textAlign: "center" }}>Apple Pay, Google Pay or card · Secure checkout by Whop · Information, not betting advice.</p>
    </div>
  );
}
