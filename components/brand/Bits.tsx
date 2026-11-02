/* Small shared pieces: tier badges, a side in colour, price then → now, section labels, the arrow buttons. Safe in
 * server and client components. */
import type { ReactNode } from "react";
import type { Tier } from "@/lib/millionaires/watchlist";
import { TIER_NAME } from "@/lib/millionaires/watchlist";

export const TierBadge = ({ tier }: { tier: Tier }) => <span className={`b-tier b-tier--${tier}`} data-tier={tier}>{TIER_NAME[tier]}</span>;

export const cents = (p: number): string => `${Math.round(p * 100)}¢`;

/** "41¢ → 47¢ +6¢": green when the side's price rose since the bet, red when it fell, always with its sign. */
export function PriceMove({ then, now }: { then: number; now: number | null }) {
  if (now === null) return <span className="b-row__price">{cents(then)} then</span>;
  const d = Math.round(now * 100) - Math.round(then * 100);
  return (
    <span className="b-row__price">
      {cents(then)} → {cents(now)}{" "}
      {d === 0 ? <span>±0¢</span> : <span className={d > 0 ? "b-up" : "b-down"}>{d > 0 ? "+" : "−"}{Math.abs(d)}¢</span>}
    </span>
  );
}

/** The outcome they bought; YES / NO coloured (data only), team names plain. */
export function Side({ outcome, side }: { outcome: string; side: "yes" | "no" }) {
  const yn = /^(yes|no)$/i.test(outcome.trim());
  return <span className={yn ? `b-side b-side--${side}` : "b-side"}>{yn ? outcome.toUpperCase() : outcome}</span>;
}

export const SecLabel = ({ children }: { children: ReactNode }) => <span className="b-label b-label--sec">{children}</span>;

export function Btn({ href, children, ghost = false, small = false, block = false, arrow = true, ...rest }: {
  href: string; children: ReactNode; ghost?: boolean; small?: boolean; block?: boolean; arrow?: boolean; "data-testid"?: string; "data-checkout"?: string; prefetch?: boolean;
}) {
  const cls = `b-btn${ghost ? " b-btn--ghost" : ""}${small ? " b-btn--sm" : ""}${block ? " b-btn--block" : ""}`;
  return <a className={cls} href={href} {...rest}>{children}{arrow ? <span className="b-arrow" aria-hidden="true">↗</span> : null}</a>;
}
