/* One millionaire bet as a row: the category photo as a thumbnail, tier badge, market, side, size, price then → now.
 * Shows a shortened wallet only. Safe in server and client components (no hooks). */
import Image from "next/image";
import { categoryPhoto, category as categoryInfo } from "@/lib/brand/categories";
import type { BoardBet } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { ago } from "@/lib/format";
import { PriceMove, Side, TierBadge } from "./Bits";

export function BetRow({ bet, now, href }: { bet: BoardBet; now: number; href?: string }) {
  const photo = categoryPhoto(bet.category);
  const body = (
    <>
      <span className="b-row__thumb b-photo" style={{ backgroundColor: photo.tone }}>
        <Image src={photo.src} alt="" fill sizes="56px" quality={60} style={{ objectFit: "cover" }} />
      </span>
      <span className="b-row__main">
        <span className="b-row__title">{bet.title}</span>
        <span className="b-row__meta">
          <TierBadge tier={bet.tier} />
          <Side outcome={bet.outcome} side={bet.side} />
          <span className="b-mono">{bet.short}</span>
          <span>· {categoryInfo(bet.category).name} · {ago(bet.at, now)}</span>
        </span>
      </span>
      <span className="b-row__money">
        <span className="b-row__size">{dollars(bet.amount)}</span>
        <PriceMove then={bet.priceThen} now={bet.priceNow} />
      </span>
    </>
  );
  return href
    ? <a className="b-row b-glass" href={href} data-testid="bet-row" data-bet={bet.id}>{body}</a>
    : <div className="b-row b-glass" data-testid="bet-row" data-bet={bet.id}>{body}</div>;
}
