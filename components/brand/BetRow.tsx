/* One millionaire bet as a row: both teams' logos for a game (lib/teams, 28px), the market's name, the wallet's profit tier and profit, the
 * market, the side (locked for visitors), size and time, price then → now when known. Safe in server and client
 * components. */
import { decidedText, decision } from "@/lib/millionaires/decided";
import type { BoardBet } from "@/lib/millionaires/queries";
import type { GroupedBet } from "@/lib/millionaires/group";
import { dollars } from "@/lib/money";
import { PriceMove, Side, signedDollars, TierBadge } from "./Bits";
import { TeamPair } from "@/components/system/Team";
import { Verify } from "./Verify";
import { betExplain } from "@/lib/brief/explain";

export function agoShort(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** A Millionaire's bet this size or more is shown in gold. */
export const GOLD_MIN = 50_000;

export function BetRow({ bet, now, href, className = "", settle, copyHref, polymarket = false }: { bet: BoardBet | GroupedBet; now: number; href?: string; className?: string; settle?: number;
  /** Members: the copy ticket for this bet. */
  copyHref?: string;
  /** The viewer is outside the US: Verify may show the Polymarket market page. */
  polymarket?: boolean }) {
  const name = <>{bet.title}</>;
  const teams = bet.teams ?? null;
  const n = "n" in bet ? bet.n : 1;
  const title = href ? <a className="b-row__link" href={href}>{name}</a> : name;
  // A Millionaire's $50K+ bet is gold.
  const gold = bet.tier === "millionaire" && bet.amount >= GOLD_MIN;
  const style = (settle !== undefined ? { "--d": `${settle}s` } : {}) as React.CSSProperties;
  return (
    <div className={`b-row b-row--plain ${className}`} data-testid="bet-row" data-bet={bet.id} data-n={n} data-ids={"ids" in bet ? bet.ids.join(" ") : bet.id} data-tier={bet.tier} style={style} {...(settle !== undefined ? { "data-m": "settle" } : {})}>
      <span className="b-row__main">
        <span className="b-row__title">{teams ? <TeamPair teams={teams} /> : null}{title}</span>
        <span className="b-row__meta">
          <TierBadge tier={bet.tier} />
          {bet.pnl !== null ? <span>{signedDollars(bet.pnl)} wallet</span> : null}
          {n > 1 ? <span data-testid="bet-count">{n} bets</span> : null}
          <Side outcome={bet.outcome} side={bet.side} pnl={bet.pnl} />
          <PriceMove then={bet.priceThen} now={bet.priceNow} />
        </span>
        {/* What this means for me (lib/brief/explain.ts): computed from the row; a visitor's says nothing about the side. */}
        {betExplain(bet) ? <span className="b-small" data-testid="bet-explain">{betExplain(bet)}</span> : null}
      </span>
      <span className="b-row__money">
        <span className={`b-row__size b-num${gold ? " b-gold" : ""}`}>{dollars(bet.amount)}{n > 1 ? " total" : ""}</span>
        <span className="b-small">{agoShort(bet.at, now)}</span>
        {bet.outcome && decision(bet) ? <span className="b-small" data-testid="bet-decided">{decidedText(decision(bet)!, bet.outcome)}</span> : null}
        {copyHref ? <a className="b-btn b-panel-pill b-copy" href={copyHref} data-testid="bet-copy" aria-label={`Copy this bet: ${bet.title}`}>Copy</a> : null}
      </span>
      {bet.verify ? <Verify v={bet.verify} marketId={bet.marketId} polymarket={polymarket} /> : null}
    </div>
  );
}
