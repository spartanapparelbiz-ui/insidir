/* One millionaire bet: the category photo as a thumbnail, then "+$3.1M wallet · just now", "$120K on <market>",
 * the side (locked for visitors), and price then → now when known. Wallets only as tier, profit and a short address.
 * Safe in server and client components (no hooks). */
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

export function BetRow({ bet, now, href }: { bet: BoardBet; now: number; href?: string }) {
  const photo = categoryPhoto(bet.category);
  const title = href ? <a href={href} className="b-fitem__what">{bet.title}</a> : <span className="b-fitem__what">{bet.title}</span>;
  return (
    <div className="b-fitem" data-testid="bet-row" data-bet={bet.id} data-tier={bet.tier}>
      <span className="b-fitem__thumb b-photo b-photo--flat" style={{ backgroundColor: photo.tone }} aria-hidden="true">
        <span className="b-photo__img"><Image src={photo.src} alt="" fill sizes="48px" quality={55} style={{ objectFit: "cover" }} /></span>
      </span>
      <span className="b-fitem__body">
        <span className="b-fitem__top">
          <TierBadge tier={bet.tier} />
          {bet.pnl !== null ? <span className="b-fitem__pnl">{signedDollars(bet.pnl)} wallet</span> : null}
          <span>· {agoShort(bet.at, now)}</span>
        </span>
        <span><span className="b-fitem__amt">{dollars(bet.amount)}</span> on {title}</span>
        <span className="b-fitem__top"><Side outcome={bet.outcome} side={bet.side} pnl={bet.pnl} /><span>{bet.short}</span><PriceMove then={bet.priceThen} now={bet.priceNow} /></span>
      </span>
    </div>
  );
}
