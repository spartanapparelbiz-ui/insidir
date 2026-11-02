/* The Millionaires' board as rows (/board, and the landing page's preview): the market's art, the market, the side,
 * the size, the price they paid and the price now, the wallet's tier badge, and when. Each row opens its Read. */
import { ReadPick } from "@/components/read/ReadPick";
import { Art } from "@/components/sky/Art";
import { ago } from "@/lib/sky/sky-pure";
import type { BoardRow } from "@/lib/millionaire/board";
import { TierBadge } from "./TierBadge";

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(v).toLocaleString("en-US")}`);
const cents = (p: number) => `${Math.round(p * 100)}¢`;

export function BoardItem({ r, now }: { r: BoardRow; now: number }) {
  const move = r.priceNow === null ? null : Math.round((r.priceNow - r.priceThen) * 100);
  return (
    <ReadPick venue="polymarket" id={r.marketId} className="mb-row">
      <Art art={r.art} size={36} />
      <span className="mb-row__main">
        <span className="mb-row__t">{r.title}</span>
        <span className="mb-row__sub"><TierBadge tier={r.tier} /> <b className="mb-row__usd">{usd(r.amount)}</b> on <b>{r.side}</b> · {ago(r.at, now)}</span>
      </span>
      <span className="mb-row__px" aria-label={`Paid ${cents(r.priceThen)}${r.priceNow !== null ? `, now ${cents(r.priceNow)}` : ""}`}>
        <span className="mb-row__then">{cents(r.priceThen)}</span>
        {r.priceNow !== null ? <span className="mb-row__now">now {cents(r.priceNow)}{move ? <i className={move > 0 ? "up" : "down"}> {move > 0 ? "+" : "−"}{Math.abs(move)}</i> : null}</span> : null}
      </span>
    </ReadPick>
  );
}

export function BoardList({ rows, now, testid = "board" }: { rows: readonly BoardRow[]; now: number; testid?: string }) {
  return <ul className="mb-list" data-testid={testid}>{rows.map(r => <li key={r.id}><BoardItem r={r} now={now} /></li>)}</ul>;
}
