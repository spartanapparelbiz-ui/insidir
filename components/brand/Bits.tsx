/* Shared pieces in the hero spec's language: the arrow, the pills (white primary, glass ghost, #181818 panel), masked
 * headline lines, tier badges, a side in colour (or locked), price then → now. Safe in server and client components.
 * Motion hooks: data-m="lift" (B), "settle" (C), "quiet" (D); headline lines are A (components/brand/StageMotion.tsx). */
import type { CSSProperties, ReactNode } from "react";
import { TIER_NAME, type Tier } from "@/lib/millionaires/watchlist";
import { dollars } from "@/lib/money";

export const Arrow = () => (
  <svg className="b-arw" viewBox="0 0 12 10" fill="none" aria-hidden="true">
    <path d="M0.8 5h10M7.1 1.4 10.9 5l-3.8 3.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type M = "lift" | "settle" | "quiet";
/** Motion attributes: which behaviour, and its delay in seconds. */
export const m = (kind: M, delay?: number): { "data-m": M; style?: CSSProperties } =>
  ({ "data-m": kind, ...(delay !== undefined ? { style: { "--d": `${delay}s` } as CSSProperties } : {}) });

export function Pill({ href, children, kind = "primary", arrow = true, delay, className = "", ...rest }: {
  href: string; children: ReactNode; kind?: "primary" | "ghost" | "panel"; arrow?: boolean; delay?: number; className?: string;
  "data-testid"?: string; "data-checkout"?: string; onClick?: () => void;
}) {
  const cls = kind === "panel" ? "b-btn b-panel-pill" : `b-btn b-btn-lg b-${kind}`;
  // A Start button (data-checkout) also reports unlock_click (components/landing/Beacons.tsx), like every older one.
  const unlock = rest["data-checkout"] ? { "data-unlock": rest["data-checkout"] } : {};
  return <a className={`${cls} ${className}`} href={href} {...(delay !== undefined ? m("settle", delay) : {})} {...unlock} {...rest}>{children}{arrow ? <Arrow /> : null}</a>;
}

/** A headline as masked lines (behaviour A). `k` sizes it on phones from its longest line, so no line ever wraps. */
export function Lines({ lines, as: Tag = "h2", size, id, className = "", testid }: { lines: readonly string[]; as?: "h1" | "h2" | "p"; size?: number; id?: string; className?: string; testid?: string }) {
  const longest = Math.max(...lines.map(l => l.length));
  const style = { "--k": (longest * 0.56).toFixed(2), ...(size ? { "--hs": size } : {}) } as CSSProperties;
  return (
    <Tag id={id} className={`${Tag === "h1" ? "b-h1" : "b-h2"} ${className}`} style={style} data-testid={testid}>
      {lines.map((l, i) => <span key={i} className="ln"><span className="ln-i" style={{ "--i": i } as CSSProperties}>{l}</span></span>)}
    </Tag>
  );
}

export const TierBadge = ({ tier }: { tier: Tier }) => <span className={`b-tier b-tier--${tier}`} data-tier={tier}>{TIER_NAME[tier]}</span>;

export const cents = (p: number): string => `${Math.round(p * 100)}¢`;
export const signedDollars = (v: number): string => `${v >= 0 ? "+" : "−"}${dollars(Math.abs(v))}`;

/** "41¢ → 47¢ +6¢": the side's price then and now, the change always signed (data colours). */
export function PriceMove({ then, now }: { then: number | null; now: number | null }) {
  if (then === null) return null;
  if (now === null) return <span className="b-small">{cents(then)} then</span>;
  const d = Math.round(now * 100) - Math.round(then * 100);
  return <span className="b-small">{cents(then)} → {cents(now)} {d === 0 ? "±0¢" : <span className={d > 0 ? "b-up" : "b-down"}>{d > 0 ? "+" : "−"}{Math.abs(d)}¢</span>}</span>;
}

/** The outcome they bought (YES / NO coloured; team names plain). Null for a visitor: a lock that opens the paywall. */
export function Side({ outcome, side, pnl }: { outcome: string | null; side: "yes" | "no" | null; pnl?: number | null }) {
  if (side === null || outcome === null) {
    return (
      <button type="button" className="b-lock" data-locked="side" data-pnl={pnl ?? undefined} aria-label="Side hidden: start for $1 to see it">
        <span className="b-blur" aria-hidden="true">YES</span> side <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true"><rect x="0.5" y="4.5" width="8" height="6" rx="1.5" fill="currentColor" /><path d="M2 4.5V3a2.5 2.5 0 0 1 5 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
      </button>
    );
  }
  const yn = /^(yes|no)$/i.test(outcome.trim());
  return <span className={yn ? `b-side b-side--${side}` : "b-side"}>{yn ? outcome.toUpperCase() : outcome}</span>;
}

/** The brackets mark: 64×64, two L-brackets. */
export const Mark = () => (
  <svg viewBox="0 0 64 64" aria-hidden="true" fill="currentColor"><rect x="0" y="0" width="40" height="18" /><rect x="0" y="0" width="18" height="46" /><rect x="46" y="18" width="18" height="46" /><rect x="24" y="46" width="40" height="18" /></svg>
);

export const Logo = ({ href = "/" }: { href?: string }) => <a className="b-logo" href={href} aria-label="Insidir home"><Mark /><span>insidir</span></a>;
