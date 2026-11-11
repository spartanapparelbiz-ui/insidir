"use client";
/* The wallets leaderboard (/wallets): every wallet up $1M+ Insidir watches, filterable and sortable, one row each:
 * rank, short address and whether it passed the proven screen, all-time profit, its settled record against the price it
 * pays, what it bet this week and where, its last bet, and Follow. A row opens the wallet's page. Data:
 * lib/millionaires/leaderboard.ts. */
import { useMemo, useState } from "react";
import { FollowLink } from "@/components/desk/Act";
import { agoShort } from "@/components/brand/BetRow";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { dollars } from "@/lib/money";
import type { LeaderRow } from "@/lib/millionaires/leaderboard";

type Filter = "all" | "proven" | "active";
type Sort = "pnl" | "rate" | "week" | "last";
const short = (w: string) => (/^0x[0-9a-f]{40}$/i.test(w) ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);
const rateOf = (r: LeaderRow): number | null => { const n = (r.won ?? 0) + (r.lost ?? 0); return n >= 10 ? (r.won ?? 0) / n : null; };
const catName = (c: string | null) => (c && isCategory(c) ? categoryInfo(c).name : null);

export function WalletBoard({ rows, now }: { rows: LeaderRow[]; now: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("pnl");
  const [shown, setShown] = useState(40);
  const list = useMemo(() => {
    const f = rows.filter(r => filter === "all" || (filter === "proven" ? r.proven === true : r.weekBets > 0));
    const key: Record<Sort, (r: LeaderRow) => number> = { pnl: r => r.pnl, rate: r => rateOf(r) ?? -1, week: r => r.week, last: r => r.last?.at ?? 0 };
    return [...f].sort((a, b) => key[sort](b) - key[sort](a));
  }, [rows, filter, sort]);
  const counts = { all: rows.length, proven: rows.filter(r => r.proven === true).length, active: rows.filter(r => r.weekBets > 0).length };
  return (
    <div className="s-wb" data-testid="wallet-board">
      <div className="s-wb__bar">
        <div className="s-wb__chips" role="group" aria-label="Show">
          {([["all", "All"], ["proven", "Proven"], ["active", "Trade this week"]] as const).map(([k, l]) => (
            <button key={k} type="button" className="s-wb__chip" aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(40); }} data-testid="wb-filter">{l} <span>{counts[k]}</span></button>
          ))}
        </div>
        <label className="s-wb__sort">Sort by
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} data-testid="wb-sort">
            <option value="pnl">All-time profit</option>
            <option value="rate">Win rate</option>
            <option value="week">Money this week</option>
            <option value="last">Latest trade</option>
          </select>
        </label>
      </div>
      <div className="s-wb__head" aria-hidden="true"><span>#</span><span>Wallet</span><span>All-time</span><span>Record</span><span>This week</span><span>Latest trade</span><span /></div>
      {list.length ? (
        <ol className="s-wb__rows">
          {list.slice(0, shown).map((r, i) => {
            const rate = rateOf(r), edge = rate !== null && r.avgPrice !== null ? rate - r.avgPrice : null;
            return (
              <li key={r.wallet} className="s-wb__row" data-testid="wb-row">
                <span className="s-wb__rank b-num">{i + 1}</span>
                <a className="s-wb__who" href={`/wallet/${r.wallet}`}>
                  <b className="b-num">{short(r.wallet)}</b>
                  {r.proven ? <span className="s-wb__tag s-wb__tag--ok" title="30+ settled trades; not a market maker, high-frequency or arbitrage wallet">Proven</span>
                    : r.exclusion ? <span className="s-wb__tag" title="Why Insidir doesn't signal on it">{r.exclusion}</span> : null}
                </a>
                <span className="s-wb__pnl b-num" data-label="All-time"><b>+{dollars(r.pnl)}</b></span>
                <span className="s-wb__rec" data-label="Record">
                  {r.won !== null && r.lost !== null && r.won + r.lost > 0 ? (
                    <>
                      <b className="b-num">{r.won}–{r.lost}</b>
                      {rate !== null ? <span className="b-num">{Math.round(rate * 100)}% won{r.avgPrice !== null ? ` at ${Math.round(r.avgPrice * 100)}¢ avg` : ""}</span> : <span>under 10 settled</span>}
                      {edge !== null ? <span className={edge >= 0 ? "s-up" : "s-down"}>{edge >= 0 ? "Wins more than its price says" : "Wins less than its price says"}</span> : null}
                    </>
                  ) : <span>No settled record yet</span>}
                </span>
                <span className="s-wb__week" data-label="This week">
                  {r.weekBets ? <><b className="b-num">{dollars(r.week)}</b><span>{r.weekBets} {r.weekBets === 1 ? "trade" : "trades"}{catName(r.topCategory) ? ` · mostly ${catName(r.topCategory)}` : ""}</span></> : <span>No $1K+ trade</span>}
                </span>
                <span className="s-wb__last" data-label="Latest trade">
                  {r.last ? <><b>{r.last.title}</b><span className="b-num">{dollars(r.last.amount)} · {agoShort(r.last.at, now)}</span></> : <span>None seen yet</span>}
                </span>
                <span className="s-wb__act"><FollowLink wallet={r.wallet} initial={r.followed} short /></span>
              </li>
            );
          })}
        </ol>
      ) : <p className="b-empty">No wallet matches yet.</p>}
      {list.length > shown ? <div className="b-center"><button type="button" className="b-btn b-panel-pill" onClick={() => setShown(s => s + 40)} data-testid="wb-more">Show {Math.min(40, list.length - shown)} more</button></div> : null}
    </div>
  );
}
