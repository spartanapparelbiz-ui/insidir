/* One millionaire bet as a glass row: the category photo as a thumbnail, the wallet's profit tier and profit, the
 * market, the side (locked for visitors), size and time, price then → now when known. Safe in server and client
 * components. */
import Image from "next/image";
import { categoryPhoto } from "@/lib/brand/categories";
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

export function BetRow({ bet, now, href, className = "", settle }: { bet: BoardBet; now: number; href?: string; className?: string; settle?: number }) {
  const photo = categoryPhoto(bet.category);
  const title = href ? <a href={href}>{bet.title}</a> : bet.title;
  return (
    <div className={`b-row ${className}`} data-testid="bet-row" data-bet={bet.id} data-tier={bet.tier} {...(settle !== undefined ? { "data-m": "settle", style: { "--d": `${settle}s` } as React.CSSProperties } : {})}>
      <span className="b-row__thumb" aria-hidden="true"><Image src={photo.src} alt="" fill sizes="48px" quality={55} /></span>
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
        <span className="b-row__size b-num">{dollars(bet.amount)}</span>
        <span className="b-small">{agoShort(bet.at, now)}</span>
      </span>
    </div>
  );
}
