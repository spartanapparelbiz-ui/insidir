/* Small shared pieces: tier badges, a side in colour (or locked), price then → now, section labels, pill buttons,
 * numbers the scroll engine can tick (data-value / data-format). Safe in server and client components. */
import type { ReactNode } from "react";
import { TIER_NAME, type Tier } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";

export const TierBadge = ({ tier }: { tier: Tier }) => <span className={`b-tier b-tier--${tier}`} data-tier={tier}>{TIER_NAME[tier]}</span>;

export const cents = (p: number): string => `${Math.round(p * 100)}¢`;
export const signedDollars = (v: number): string => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

/** A number rendered final on the server; the engine can count it up from zero (data-value, data-format). */
export function Num({ value, format = "int", children, className = "", ...rest }: { value: number; format?: "int" | "usd" | "usd-signed" | "usd-short" | "cents" | "pct"; children: ReactNode; className?: string; "data-testid"?: string; "data-count"?: string }) {
  return <span className={`b-num ${className}`} data-value={value} data-format={format} {...rest}>{children}</span>;
}

/** "41¢ → 47¢ +6¢": green when the side's price rose since the bet, red when it fell, always signed. */
export function PriceMove({ then, now }: { then: number | null; now: number | null }) {
  if (then === null) return null;
  if (now === null) return <span className="b-mono b-small">{cents(then)} then</span>;
  const d = Math.round(now * 100) - Math.round(then * 100);
  return (
    <span className="b-mono b-small">
      {cents(then)} → {cents(now)}{" "}
      {d === 0 ? <span>±0¢</span> : <span className={d > 0 ? "b-up" : "b-down"}>{d > 0 ? "+" : "−"}{Math.abs(d)}¢</span>}
    </span>
  );
}

/** The outcome they bought; YES / NO coloured (data only), team names plain. Null (a visitor): the side is locked. */
export function Side({ outcome, side, pnl }: { outcome: string | null; side: "yes" | "no" | null; pnl?: number | null }) {
  if (side === null || outcome === null) {
    return (
      <button type="button" className="b-locked" data-locked="side" data-pnl={pnl ?? undefined} aria-label="Side hidden. Start for $1 to see it">
        side <span aria-hidden="true">🔒</span>
      </button>
    );
  }
  const yn = /^(yes|no)$/i.test(outcome.trim());
  return <span className={yn ? `b-side b-side--${side}` : "b-side"}>{yn ? outcome.toUpperCase() : outcome}</span>;
}

export const SecLabel = ({ children }: { children: ReactNode }) => <span className="b-label b-label--sec">{children}</span>;

export function Btn({ href, children, ghost = false, small = false, block = false, arrow = true, ...rest }: {
  href: string; children: ReactNode; ghost?: boolean; small?: boolean; block?: boolean; arrow?: boolean; "data-testid"?: string; "data-checkout"?: string;
}) {
  const cls = `b-btn${ghost ? " b-btn--ghost" : ""}${small ? " b-btn--sm" : ""}${block ? " b-btn--block" : ""}`;
  return <a className={cls} href={href} {...rest}>{children}{arrow ? <span aria-hidden="true">→</span> : null}</a>;
}
