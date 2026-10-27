/* A Polymarket trader's profile (/p/0x…). Stats from the wallet's resolved positions (lib/profiles/trader.ts), only with
 * 20+ resolved markets. The public Polymarket profile is linked for viewers outside the US only (US viewers never get
 * international Polymarket links). */
import type { Viewer } from "@/lib/auth/viewer";
import type { Db } from "@/lib/db";
import { polymarketProfileUrl } from "@/lib/exchanges/polymarket";
import { SourceA } from "../MoveCard";
import { profileSource } from "@/lib/moves/source";
import { isPaid } from "@/lib/plans";
import { dollars, signedShort } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { openPositions } from "@/lib/moves/pages";
import { walletLabel } from "@/lib/moves/records";
import { followList, listMoves } from "@/lib/moves/store";
import { profitPath } from "@/lib/profiles/chart";
import { marketsFor, recordOf } from "@/lib/profiles/store";
import { showStats, traderStats } from "@/lib/profiles/trader";
import { FollowButton } from "../FollowButton";
import { MoveCard } from "../MoveCard";
import { calDate, exactDollars, followState, Locked, pct, signedPct } from "./shared";
import { Photo } from "@/components/Photo";
import { BAND } from "@/lib/photos";
import Link from "next/link";

export async function TraderProfile({ db, wallet, viewer, trial, now }: { db: Db | null; wallet: string; viewer: Viewer; trial: string; now: number }) {
  const paid = isPaid(viewer.plan);
  const plan = movePlan(viewer.plan);
  const [moves, rec, follows, positions, markets] = await Promise.all([
    db ? listMoves(db, { wallet, until: now - plan.delayMs, limit: 20 }).catch(() => []) : Promise.resolve([]),
    db ? recordOf(db, wallet).catch(() => null) : Promise.resolve(null),
    db && viewer.user ? followList(db, viewer.user.id) : Promise.resolve([]),
    openPositions(wallet),
    // Members only: a free viewer's page never holds the numbers.
    db && paid ? marketsFor(db, wallet).catch(() => []) : Promise.resolve([]),
  ]);
  const name = walletLabel(wallet, rec?.name ?? moves.find(m => m.walletName)?.walletName ?? null);
  const items = db ? await feedItems(db, moves, viewer.plan, viewer.region, now) : [];
  const following = follows.some(f => f.kind === "trader" && f.target === wallet);
  const s = paid ? traderStats(markets, now) : null;
  const chart = s ? profitPath(s.series) : null;
  const source = viewer.region === "non_us" ? polymarketProfileUrl(wallet) : null;
  // The band's photo: the trader's best category for members; for free viewers (who never get the record), the
  // category of their latest move, which is public.
  const best = s?.best ? (s.best.category === "Markets" || s.best.category === "Crypto" ? "markets" : "sports") : moves[0]?.tab === "sports" ? "sports" : "markets";
  return (
    <>
      <header className="trader__head">
        <Photo n={BAND.profile[best]} className="trader__photo" band eager />
        <div>
          <p className="trader__kicker">Polymarket wallet</p>
          <h1 className="trader__name">{name}</h1>
          <SourceA link={profileSource({ kind: "trader", wallet })} className="source source--dark" />
        </div>
        <FollowButton kind="trader" target={wallet} state={followState(viewer, following)} trialHref={trial} />
      </header>
      <p className="note pnote">One trader can use several wallets; this record covers this wallet only. <Link href="/data">About our data</Link></p>
      {!paid ? <Locked trial={trial} what="Their record is for members: won and lost, profit, return, best category, streak and every move." />
        : s && showStats(s) ? (
          <>
            <dl className="record record--wide">
              <div><dt>Win rate</dt><dd>{pct(s.won / s.resolved)}</dd><span className="record__sub">Won {s.won} of {s.resolved} resolved</span></div>
              <div><dt>All-time profit</dt><dd className={s.profit >= 0 ? "money" : "loss"}>{signedShort(s.profit)}</dd></div>
              <div><dt>Return on money in</dt><dd className={(s.roi ?? 0) >= 0 ? "money" : "loss"}>{s.roi === null ? "—" : signedPct(s.roi)}</dd><span className="record__sub">{exactDollars(s.moneyIn)} put in</span></div>
              <div><dt>Biggest win</dt><dd className="money">{dollars(s.biggestWin)}</dd></div>
              <div><dt>Best category</dt><dd className="record__text">{s.best ? s.best.category : "—"}</dd>{s.best ? <span className="record__sub">{signedShort(s.best.profit)} over {s.best.won + s.best.lost} markets</span> : null}</div>
              <div><dt>Last 30 days</dt><dd>{s.last30.resolved ? `${s.last30.won} of ${s.last30.resolved}` : "—"}</dd>{s.last30.resolved ? <span className="record__sub">{signedShort(s.last30.profit)}</span> : null}</div>
              <div><dt>Current streak</dt><dd>{s.streak ? `${s.streak.n} ${s.streak.kind === "won" ? (s.streak.n === 1 ? "win" : "wins") : (s.streak.n === 1 ? "loss" : "losses")}` : "—"}</dd></div>
              <div><dt>Average bet</dt><dd>{dollars(s.avgBet)}</dd></div>
            </dl>
            {chart ? (
              <section className="block" aria-labelledby="chart-h">
                <h2 id="chart-h" className="block__h">Profit over time</h2>
                <svg className="pchart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`Profit over time, from ${signedShort(chart.first)} to ${signedShort(chart.last)}`} preserveAspectRatio="none">
                  <line x1="0" x2={chart.width} y1={chart.zeroY} y2={chart.zeroY} className="pchart__zero" />
                  <path d={chart.path} className={chart.last >= 0 ? "pchart__line" : "pchart__line pchart__line--loss"} />
                </svg>
                <p className="note">{calDate(new Date(s.series[0]!.at).toISOString().slice(0, 10))} to {calDate(new Date(s.series.at(-1)!.at).toISOString().slice(0, 10))}, by the day each market resolved.</p>
              </section>
            ) : null}
            <section className="block" aria-labelledby="cat-h">
              <h2 id="cat-h" className="block__h">Wins and losses by category</h2>
              <table className="ptable">
                <thead><tr><th scope="col">Category</th><th scope="col">Won</th><th scope="col">Lost</th><th scope="col">Profit</th></tr></thead>
                <tbody>{s.categories.map(c => (
                  <tr key={c.category}><th scope="row">{c.category}</th><td>{c.won}</td><td>{c.lost}</td><td className={c.profit >= 0 ? "money" : "loss"}>{signedShort(c.profit)}</td></tr>
                ))}</tbody>
              </table>
            </section>
            <p className="note psource">From {s.resolved} resolved markets in Polymarket&apos;s public data{rec ? `, updated ${calDate(new Date(rec.updatedAt).toISOString().slice(0, 10))}` : ""}.
              {source ? <> <a href={source} target="_blank" rel="noopener noreferrer">See their Polymarket profile</a></> : null}</p>
          </>
        ) : <p className="note">Not enough history yet. We show stats once a wallet has 20 resolved markets{s && s.resolved ? ` (this one has ${s.resolved})` : ""}.</p>}
      {positions && positions.length ? (
        <section className="block" aria-labelledby="pos-h">
          <h2 id="pos-h" className="block__h">Open positions</h2>
          <ul className="positions">
            {positions.map((p, i) => (
              <li key={i} className="positions__row"><span className="positions__title">{p.title}</span><span className="positions__out">{p.outcome}</span><span className="positions__val">{dollars(p.value)}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="block" aria-labelledby="moves-h">
        <h2 id="moves-h" className="block__h">Recent big moves</h2>
        {items.length ? <ol className="feed2__list">{items.map(m => <li key={m.id}><MoveCard m={m} follow={followState(viewer, following)} trialHref={trial} /></li>)}</ol>
          : <p className="note">No big moves from this wallet{paid ? "" : " more than 30 minutes ago"} yet.</p>}
      </section>
    </>
  );
}
