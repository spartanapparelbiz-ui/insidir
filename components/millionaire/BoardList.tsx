/* The Millionaires' board as rows (/board, the landing preview, the funnel): the market's art, the market, the side,
 * the size, the price they paid → the price now with its change, the wallet's tier badge and all-time profit, and when.
 * Members also see the short address ("0x4f…c2"). Each row opens its Read. */
import { ReadPick } from "@/components/read/ReadPick";
import { Art } from "@/components/sky/Art";
import { ago } from "@/lib/sky/sky-pure";
import { pnlText, type BoardRow } from "@/lib/millionaire/board";
import { TierBadge } from "./TierBadge";

const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(v).toLocaleString("en-US")}`);
const cents = (p: number) => `${Math.round(p * 100)}¢`;

export function BoardItem({ r, now, member = false, late = false }: { r: BoardRow; now: number; member?: boolean; late?: boolean }) {
  const move = r.priceNow === null ? null : Math.round((r.priceNow - r.priceThen) * 100);
  return (
    <ReadPick venue="polymarket" id={r.marketId} className="mb-row">
      <Art art={r.art} size={36} />
      <span className="mb-row__main">
        <span className="mb-row__t">{r.pinned ? <span className="mb-pin">Election night</span> : null}{r.title}</span>
        <span className="mb-row__sub"><TierBadge tier={r.tier} /> <b className="mb-row__usd">{usd(r.amount)}</b> on <b>{r.side}</b> · {pnlText(r.pnl)} all-time{member ? ` · ${r.short}` : ""} · {late ? `${ago(r.at, now)} (1 hour delay)` : ago(r.at, now)}</span>
      </span>
      <span className="mb-row__px" aria-label={`Paid ${cents(r.priceThen)}${r.priceNow !== null ? `, now ${cents(r.priceNow)}` : ""}`}>
        <span className="mb-row__then">{cents(r.priceThen)}{r.priceNow !== null ? <> → {cents(r.priceNow)}</> : null}</span>
        {move ? <span className="mb-row__now"><i className={move > 0 ? "up" : "down"}>{move > 0 ? "+" : "−"}{Math.abs(move)}¢</i></span> : null}
      </span>
    </ReadPick>
  );
}

export function BoardList({ rows, now, testid = "board", member = false }: { rows: readonly BoardRow[]; now: number; testid?: string; member?: boolean }) {
  return <ul className="mb-list" data-testid={testid}>{rows.map(r => <li key={r.id}><BoardItem r={r} now={now} member={member} /></li>)}</ul>;
}
