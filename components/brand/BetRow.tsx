/* One millionaire bet as a glass row: the category photo as a thumbnail, the wallet's profit tier and profit, the
 * market, the side (locked for visitors), size and time, price then → now when known. Safe in server and client
 * components. */
import { ambientOf, CategoryArt } from "./CategoryArt";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { PriceMove, Side, signedDollars, TierBadge } from "./Bits";

export function agoShort(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** A Millionaire's bet this size or more is shown in gold. */
export const GOLD_MIN = 50_000;

export function BetRow({ bet, now, href, className = "", settle, copyHref }: { bet: BoardBet; now: number; href?: string; className?: string; settle?: number;
  /** Members: the copy ticket for this bet. */
  copyHref?: string }) {
  const title = href ? <a className="b-row__link" href={href}>{bet.title}</a> : bet.title;
  // Each row picks up its photo's colour; a Millionaire's $50K+ bet is gold.
  const gold = bet.tier === "millionaire" && bet.amount >= GOLD_MIN;
  const style = { "--amb": ambientOf(bet.category), ...(settle !== undefined ? { "--d": `${settle}s` } : {}) } as React.CSSProperties;
  return (
    <div className={`b-row b-row--art ${className}`} data-testid="bet-row" data-bet={bet.id} data-tier={bet.tier} style={style} {...(settle !== undefined ? { "data-m": "settle" } : {})}>
      <span className="b-row__thumb" aria-hidden="true"><CategoryArt slug={bet.category} sizes="(max-width: 552px) 56px, 72px" label={false} /></span>
      <span className="b-row__main">
        <span className="b-row__title">{title}</span>
        <span className="b-row__meta">
          <TierBadge tier={bet.tier} />
          {bet.pnl !== null ? <span>{signedDollars(bet.pnl)} wallet</span> : null}
          <Side outcome={bet.outcome} side={bet.side} pnl={bet.pnl} />
          <PriceMove then={bet.priceThen} now={bet.priceNow} />
        </span>
      </span>
      <span className="b-row__money">
        <span className={`b-row__size b-num${gold ? " b-gold" : ""}`}>{dollars(bet.amount)}</span>
        <span className="b-small">{agoShort(bet.at, now)}</span>
        {copyHref ? <a className="b-btn b-panel-pill b-copy" href={copyHref} data-testid="bet-copy" aria-label={`Copy this bet: ${bet.title}`}>Copy</a> : null}
      </span>
    </div>
  );
}
