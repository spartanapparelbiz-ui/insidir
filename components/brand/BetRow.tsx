/* One millionaire bet as a terminal row (app/terminal.css .t-trow): TIME · tier + short address (and its profit) ·
 * MARKET · SIDE (locked for visitors) · ENTRY → NOW · SIZE (the row's one bold number) · what it means · VERIFY, and
 * Copy for members. One line on wide screens; a list of them scrolls sideways inside its panel on phones. Safe in
 * server and client components. */
import { decidedText, decision } from "@/lib/millionaires/decided";
import type { BoardBet } from "@/lib/millionaires/queries";
import type { GroupedBet } from "@/lib/millionaires/group";
import { dollars } from "@/lib/money";
import { PriceMove, Side, signedDollars } from "./Bits";
import { Verify } from "./Verify";
import { betExplain } from "@/lib/brief/explain";
import "@/app/home-terminal.css";

export function agoShort(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** A Millionaire's bet this size or more is marked (Custodious Blue in the terminal; it was gold). */
export const GOLD_MIN = 50_000;

const TIER_TAG: Record<string, string> = { millionaire: "$1M+", pro: "PRO" };

export function BetRow({ bet, now, href, className = "", settle, copyHref, polymarket = false }: { bet: BoardBet | GroupedBet; now: number; href?: string; className?: string; settle?: number;
  /** Members: the copy ticket for this bet. */
  copyHref?: string;
  /** The viewer is outside the US: Verify may show the Polymarket market page. */
  polymarket?: boolean }) {
  const n = "n" in bet ? bet.n : 1;
  const title = href ? <a className="b-row__link" href={href} title={bet.title}>{bet.title}</a> : <span title={bet.title}>{bet.title}</span>;
  // A Millionaire's $50K+ bet is marked.
  const big = bet.tier === "millionaire" && bet.amount >= GOLD_MIN;
  const style = (settle !== undefined ? { "--d": `${settle}s` } : {}) as React.CSSProperties;
  const ex = betExplain(bet);
  return (
    <div className={`b-row b-row--plain t-trow ${className}`} data-testid="bet-row" data-bet={bet.id} data-n={n} data-ids={"ids" in bet ? bet.ids.join(" ") : bet.id} data-tier={bet.tier} style={style} {...(settle !== undefined ? { "data-m": "settle" } : {})}>
      <span className="t-trow__time t-muted">{agoShort(bet.at, now)}</span>
      <span className="t-trow__who"><span className={`b-tier b-tier--${bet.tier} t-tagtier t-tagtier--${bet.tier}`} data-tier={bet.tier}>{TIER_TAG[bet.tier] ?? bet.tier}</span> {bet.short}{bet.pnl !== null ? <span className="t-muted"> {signedDollars(bet.pnl)}</span> : null}</span>
      <span className="b-row__main t-trow__mkt">
        <span className="b-row__title">{title}</span>
        {n > 1 ? <span className="t-muted" data-testid="bet-count"> · {n} bets</span> : null}
      </span>
      <span className="t-trow__side"><Side outcome={bet.outcome} side={bet.side} pnl={bet.pnl} /></span>
      <span className="t-trow__px"><PriceMove then={bet.priceThen} now={bet.priceNow} /></span>
      <span className="b-row__money t-trow__size">
        <b className={`b-row__size b-num t-strong${big ? " t-big" : ""}`}>{dollars(bet.amount)}{n > 1 ? " total" : ""}</b>
      </span>
      {/* What this means for me (lib/brief/explain.ts): computed from the row; a visitor's says nothing about the side. */}
      <span className="t-trow__ex t-muted" title={ex ?? undefined}>{ex ? <span data-testid="bet-explain">{ex}</span> : null}</span>
      <span className="t-trow__act">
        {bet.outcome && decision(bet) ? <span className="t-muted" data-testid="bet-decided">{decidedText(decision(bet)!, bet.outcome)}</span> : null}
        {copyHref ? <a className="t-btn2 b-copy" href={copyHref} data-testid="bet-copy" aria-label={`Copy this bet: ${bet.title}`}>Copy</a> : null}
        {bet.verify ? <Verify v={bet.verify} marketId={bet.marketId} polymarket={polymarket} compact /> : null}
      </span>
    </div>
  );
}
