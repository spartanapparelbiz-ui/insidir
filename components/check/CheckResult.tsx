/* A checked bet: the parlay's summary, then each leg with its verdict and the numbers behind it (big money on each
 * side, proven traders' side, the crowd's chance now against the slip's), or a stock's insiders and funds. Server
 * component. The stake shows only to the person who checked it. */
import Link from "next/link";
import type { CheckResult as Check, LegResult } from "@/lib/check/run";
import { asChance } from "@/lib/check/odds";
import { VERDICT_TEXT } from "@/lib/check/verdict";
import { dollars } from "@/lib/moves/copy";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function legTitle(l: LegResult): string {
  const s = l.leg;
  if (s.marketType === "stock") return l.stock?.ticker ?? s.selection;
  const line = s.line !== null && (s.marketType === "spread" || s.marketType === "total" || s.marketType === "player_prop") ? ` ${s.overUnder ? "" : s.line > 0 ? "+" : ""}${s.line}` : "";
  return `${s.selection}${line}`;
}

export function verdictLabel(l: LegResult): string {
  if (l.side === null && l.market) {
    const share = l.proven?.share ?? (l.big && l.big.yes + l.big.no > 0 ? l.big.yes / (l.big.yes + l.big.no) : null);
    if (share === null || l.verdict === "none") return VERDICT_TEXT.none;
    return `Smart money on ${share >= 0.5 ? l.market.yesLabel : l.market.noLabel}`;
  }
  return VERDICT_TEXT[l.verdict];
}

function Leg({ l, i, mine, result }: { l: LegResult; i: number; mine: boolean; result: string | null }) {
  const sideName = l.sideLabel ?? "your side";
  const other = l.market ? (l.side === "yes" ? l.market.noLabel : l.side === "no" ? l.market.yesLabel : null) : null;
  const bigTotal = l.big ? l.big.yes + l.big.no : 0;
  const onMine = l.big && l.side ? (l.side === "yes" ? l.big.yes : l.big.no) : null;
  return (
    <li className={`cleg cleg--${l.side === null && l.market ? "info" : l.verdict}`} data-testid={`leg-${i}`}>
      <div className="cleg__top">
        <div>
          <p className="cleg__h">{legTitle(l)}</p>
          <p className="cleg__sub">{l.market ? (l.market.eventTitle && l.market.eventTitle !== l.market.title ? `${l.market.eventTitle} · ${l.market.title}` : l.market.title) : l.leg.event}</p>
        </div>
        <span className="cleg__v" data-testid={`verdict-${i}`}>{verdictLabel(l)}</span>
      </div>
      {l.stock ? (
        <dl className="cleg__facts">
          <div><dt>Insiders buying, 90 days</dt><dd>{l.stock.insiderBuys ? `${l.stock.insiderBuys} · ${dollars(l.stock.insiderBuyValue)}` : "None"}</dd></div>
          <div><dt>Insiders selling, 90 days</dt><dd>{l.stock.insiderSells ? `${l.stock.insiderSells} · ${dollars(l.stock.insiderSellValue)}` : "None"}</dd></div>
          <div><dt>Big funds, latest 13F</dt><dd>{l.stock.fundsAdding || l.stock.fundsCutting ? `${l.stock.fundsAdding} adding · ${l.stock.fundsCutting} cutting` : "No changes on file"}</dd></div>
          <div><dt>More</dt><dd><Link href={`/insider-trading/${encodeURIComponent(l.stock.ticker)}`}>{l.stock.ticker} insider trades</Link></dd></div>
        </dl>
      ) : !l.market ? (
        <p className="cleg__none">We couldn&apos;t find this game or market on Polymarket or Kalshi, so there are no large positions to compare yet.{l.slip !== null ? ` Your slip's entry: ${asChance(l.slip)}.` : ""}</p>
      ) : (
        <dl className="cleg__facts">
          <div>
            <dt>Large positions</dt>
            <dd>{bigTotal ? (onMine !== null ? `${dollars(onMine)} on ${sideName} (${pct(onMine / bigTotal)}) · ${dollars(bigTotal - onMine)} on ${other}` : `${dollars(l.big!.yes)} on ${l.market.yesLabel} · ${dollars(l.big!.no)} on ${l.market.noLabel}`) : "None yet"}</dd>
          </div>
          <div>
            <dt>Proven traders</dt>
            <dd>{l.proven && l.proven.share !== null ? `${pct(l.proven.share)} on ${l.side ? sideName : l.market.yesLabel} · ${l.proven.wallets} traders, ${dollars(l.proven.money)} in` : "Not enough here yet"}</dd>
          </div>
          <div>
            <dt>Crowd vs. your slip</dt>
            <dd>{l.crowd !== null ? `Market ${pct(l.crowd)} now` : "Price not available"}{l.slip !== null ? ` · your slip ${asChance(l.slip)}` : ""}</dd>
          </div>
          {mine && l.leg.stake ? <div><dt>Your stake</dt><dd>{dollars(l.leg.stake)}</dd></div> : null}
          <div><dt>Market</dt><dd><Link href={`/market/${encodeURIComponent(l.market.marketId)}`}>See the market</Link></dd></div>
        </dl>
      )}
      {l.basis === "big" ? <p className="cleg__basis">Based on all large positions: no proven traders hold this market yet.</p> : null}
      {result && result !== "open" && result !== "unmatched" ? <p className={`cleg__res cleg__res--${result}`}>{result === "won" ? "Won" : result === "lost" ? "Lost" : "Voided"}</p> : null}
    </li>
  );
}

export function CheckView({ c, mine }: { c: Check; mine: boolean }) {
  return (
    <section className="cres" aria-labelledby="cres-h">
      <p className="cres__k">{c.legs.length > 1 ? `${c.legs.length}-leg parlay` : c.input === "ticker" ? "Stock" : "Single position"}{mine && c.book ? ` · ${c.book}` : ""}</p>
      <h1 id="cres-h" className="cres__h">{c.summary}</h1>
      <ol className="cres__legs">{c.legs.map((l, i) => <Leg key={i} l={l} i={i} mine={mine} result={c.results?.[i] ?? null} />)}</ol>
      <p className="cres__note">Data, not a recommendation. Proven traders: 20+ settled markets on Polymarket and a win rate above their average entry. Large positions: every position we track on Polymarket and Kalshi.</p>
    </section>
  );
}
