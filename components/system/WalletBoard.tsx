"use client";
/* The wallets leaderboard (/wallets), as a terminal table: every wallet up $1M+ Insidir watches, filterable and
 * sortable, one row each: rank, short address and whether it passed the proven screen, all-time profit (the row's bold
 * number), its settled record against the price it pays, what it bet this week and where, its last bet, and Follow. A
 * row's address opens the wallet's page. Data: lib/millionaires/leaderboard.ts. */
import { useMemo, useState } from "react";
import { FollowLink } from "@/components/desk/Act";
import { agoShort } from "@/components/brand/BetRow";
import { category as categoryInfo, isCategory } from "@/lib/brand/categories";
import { dollars } from "@/lib/money";
import type { LeaderRow } from "@/lib/millionaires/leaderboard";
import "@/app/pages-terminal.css";

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
    <div className="t-wb" data-testid="wallet-board">
      <div className="t-toolbar">
        <div className="t-toolbar__group" role="group" aria-label="Show">
          {([["all", "All"], ["proven", "Proven"], ["active", "Bet this week"]] as const).map(([k, l]) => (
            <button key={k} type="button" className="t-chip" aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(40); }} data-testid="wb-filter">{l} <span className="b-num">{counts[k]}</span></button>
          ))}
        </div>
        <label className="t-toolbar__sort t-label">Sort
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} data-testid="wb-sort">
            <option value="pnl">All-time profit</option>
            <option value="rate">Share of bets won</option>
            <option value="week">Money this week</option>
            <option value="last">Latest bet</option>
          </select>
        </label>
      </div>
      {list.length ? (
        <div className="t-scroll">
          <table className="t-table">
            <thead>
              <tr><th className="r">#</th><th>Wallet</th><th className="r">All-time</th><th className="r">Record</th><th className="r">Won</th><th className="r">Avg price</th><th className="r">This week</th><th className="r">Bets</th><th>Latest bet</th><th className="r">Ago</th><th className="r"><span className="b-sr">Follow</span></th></tr>
            </thead>
            <tbody>
              {list.slice(0, shown).map((r, i) => {
                const rate = rateOf(r), edge = rate !== null && r.avgPrice !== null ? rate - r.avgPrice : null;
                const settled = r.won !== null && r.lost !== null && r.won + r.lost > 0;
                return (
                  <tr key={r.wallet} data-testid="wb-row">
                    <td className="r b-num t-muted">{i + 1}</td>
                    <td>
                      <a className="s-link b-num" href={`/wallet/${r.wallet}`}>{short(r.wallet)}</a>
                      {r.proven ? <span className="t-tag2 t-tag2--ok" title="30+ settled bets; not a market maker, high-frequency or arbitrage wallet">PROVEN</span>
                        : r.exclusion ? <span className="t-tag2" title="Why Insidir doesn't ping on it">{r.exclusion.toUpperCase()}</span> : null}
                    </td>
                    <td className="r b-num t-strong t-up">+{dollars(r.pnl)}</td>
                    <td className="r b-num">{settled ? `${r.won}–${r.lost}` : "—"}</td>
                    <td className="r b-num" title={edge !== null ? (edge >= 0 ? "Wins more than its price says" : "Wins less than its price says") : rate === null && settled ? "Under 10 settled" : undefined}>
                      {rate !== null ? `${Math.round(rate * 100)}%` : "—"}
                    </td>
                    <td className="r b-num">{r.avgPrice !== null ? `${Math.round(r.avgPrice * 100)}¢` : "—"}</td>
                    <td className="r b-num">{r.weekBets ? dollars(r.week) : "—"}</td>
                    <td className="r b-num" title={catName(r.topCategory) ? `Mostly ${catName(r.topCategory)}` : undefined}>{r.weekBets || "—"}</td>
                    <td className="t-ell t-muted">{r.last ? `${dollars(r.last.amount)} · ${r.last.title}` : "None seen yet"}</td>
                    <td className="r b-num t-muted">{r.last ? agoShort(r.last.at, now) : "—"}</td>
                    <td className="r t-follow"><FollowLink wallet={r.wallet} initial={r.followed} short /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="t-empty">No wallet matches yet.</p>}
      {list.length > shown ? <div className="t-more"><button type="button" className="t-btn2" onClick={() => setShown(s => s + 40)} data-testid="wb-more">Show {Math.min(40, list.length - shown)} more</button></div> : null}
    </div>
  );
}
