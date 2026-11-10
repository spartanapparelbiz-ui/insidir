/* Two panels on a market's public page:
 *   MarketDepth   the Polymarket order book now (lib/markets/depth.ts): best bid, best ask, the spread, and the top five
 *                 levels each way as bars with the dollars resting there; Kalshi's asks beside it when there's a twin
 *   MoveLog       the big-wallet moves on this market in 7 days (lib/tape.ts marketMoves): members see each one (time,
 *                 bet/trim/exit, wallet, side, size); visitors see how many there were, the rows locked, and the $1 checkout
 * Server markup. Real numbers only; a panel without data isn't shown. Information, not advice. */
import type { Depth } from "@/lib/markets/depth";
import type { MarketMove } from "@/lib/tape";
import type { MarketTwin } from "@/lib/entities/market";
import { dollars } from "@/lib/money";
import { TRIAL } from "@/lib/plans";

const cents = (p: number) => `${(p * 100).toFixed(p * 100 < 10 ? 1 : 0)}¢`;
const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Side({ title, rows, kind, max }: { title: string; rows: Depth["bids"]; kind: "bid" | "ask"; max: number }) {
  return (
    <div className="md__side">
      <p className="b-label">{title}</p>
      <ol className="md__levels">
        {rows.map(l => (
          <li key={l.price} className={`md__lvl md__lvl--${kind}`}>
            <span className="md__bar" style={{ width: `${Math.max(3, (l.total / max) * 100)}%` }} aria-hidden="true" />
            <span className="b-num">{cents(l.price)}</span><span className="b-num">{dollars(l.dollars)}</span><span className="b-num md__tot">{dollars(l.total)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MarketDepth({ d, yesLabel, twin }: { d: Depth; yesLabel: string; twin: MarketTwin | null }) {
  const max = Math.max(1, d.bids.at(-1)?.total ?? 0, d.asks.at(-1)?.total ?? 0);
  return (
    <div className="md" data-testid="market-depth">
      <div className="md__stats">
        <span><small>Best bid</small><b className="b-num">{d.bid !== null ? cents(d.bid) : "None"}</b></span>
        <span><small>Best ask</small><b className="b-num">{d.ask !== null ? cents(d.ask) : "None"}</b></span>
        <span><small>Spread</small><b className="b-num" data-testid="market-spread">{d.spread !== null ? cents(d.spread) : "None"}</b></span>
        {twin && (twin.yesAsk ?? twin.yes) !== null ? <span><small>Kalshi {yesLabel}</small><b className="b-num">{cents((twin.yesAsk ?? twin.yes)!)}</b></span> : null}
      </div>
      <div className="md__book">
        <Side title={`Bids for ${yesLabel} (price · at that price · total)`} rows={d.bids} kind="bid" max={max} />
        <Side title={`Asks for ${yesLabel} (price · at that price · total)`} rows={d.asks} kind="ask" max={max} />
      </div>
      <p className="b-small">Polymarket&apos;s public order book, read {ET.format(new Date(d.at))} ET, top five levels each way. Dollars are price × shares.</p>
    </div>
  );
}

export function MoveLog({ count, rows, member }: { count: number; rows: MarketMove[]; member: boolean }) {
  if (!count) return null;
  if (!member) {
    return (
      <div className="ml ml--locked" data-testid="market-moves-locked">
        <p className="s-strong"><span className="b-num">{count}</span> big-wallet {count === 1 ? "move" : "moves"} on this market in the last 7 days.</p>
        <ul className="ml__ghost" aria-hidden="true">{Array.from({ length: Math.min(4, count) }, (_, i) => <li key={i}><span /><span /><span /></li>)}</ul>
        <p className="b-small">Members get each one the second it lands: the wallet, buy or sell, the side and the size, with a push alert.</p>
        <a className="b-btn b-panel-pill b-delaynote__go" href="/go?step=checkout" data-checkout="market-moves" data-unlock="market-moves">Unlock real-time alerts for ${TRIAL.fee}</a>
      </div>
    );
  }
  return (
    <ol className="ml" data-testid="market-moves">
      {rows.map(r => (
        <li key={r.id} className="ml__row">
          <span className="b-small b-num">{ET.format(new Date(r.at))}</span>
          <span className={`tp__k tp__k--${r.kind}`}>{r.kind.toUpperCase()}</span>
          <span className="ml__who">{r.tier === "millionaire" ? "$1M+" : "$100K+"} · {r.short}{r.outcome ? ` · ${r.kind === "bet" ? "" : "sold "}${r.outcome}${r.price !== null ? ` @ ${cents(r.price)}` : ""}` : ""}</span>
          <b className="b-num">{dollars(r.amount)}</b>
        </li>
      ))}
    </ol>
  );
}
