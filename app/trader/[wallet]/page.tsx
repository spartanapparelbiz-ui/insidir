/* A trader (docs/V2.md §6): the public name or short address, the record (won, lost, win rate, all-time profit,
 * biggest win) once the wallet has 20+ resolved markets, a Follow button, open positions, and recent moves. Records are
 * for members; free viewers see a locked card. Nothing about who is behind a wallet, ever. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FollowButton } from "@/components/v2/FollowButton";
import { MoveCard } from "@/components/v2/MoveCard";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { dollars, signedShort } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { openPositions } from "@/lib/moves/pages";
import { hasRecord, walletLabel } from "@/lib/moves/records";
import { followList, listMoves, recordsFor } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ wallet: string }> }): Promise<Metadata> {
  const { wallet } = await params;
  return { title: `Trader ${walletLabel(wallet, null)}`, robots: { index: false } };
}

export default async function TraderPage({ params }: { params: Promise<{ wallet: string }> }) {
  const { wallet: raw } = await params;
  const wallet = raw.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) notFound();
  const now = Date.now();
  const viewer = await getViewer();
  const paid = isPaid(viewer.plan);
  const plan = movePlan(viewer.plan);
  const db = hasDatabase() ? getDb() : null;
  const [moves, recs, follows, positions] = await Promise.all([
    db ? listMoves(db, { wallet, until: now - plan.delayMs, limit: 20 }) : Promise.resolve([]),
    db ? recordsFor(db, [wallet]) : Promise.resolve(new Map()),
    db && viewer.user ? followList(db, viewer.user.id) : Promise.resolve([]),
    openPositions(wallet),
  ]);
  const rec = recs.get(wallet) ?? null;
  const name = walletLabel(wallet, rec?.name ?? moves[0]?.walletName ?? null);
  const items = db ? await feedItems(db, moves, viewer.plan, viewer.region, now) : [];
  const trial = unlockHref("insidir");
  const following = follows.some(f => f.kind === "trader" && f.target === wallet);
  const followState = !isReady("follows") ? "soon" : !paid ? "locked" : following ? "on" : "off";
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={trial} />
      <main className="wrap app2 trader">
        <header className="trader__head">
          <div>
            <p className="trader__kicker">Polymarket trader</p>
            <h1 className="trader__name">{name}</h1>
          </div>
          <FollowButton kind="trader" target={wallet} state={followState} trialHref={trial} />
        </header>
        {!paid ? (
          <aside className="upsell">
            <p className="upsell__text">Trader records are for members: markets won and lost, win rate and all-time profit.</p>
            <a className="btn btn--primary" href={trial} data-unlock="trader">See records for $1</a>
          </aside>
        ) : hasRecord(rec) ? (
          <dl className="record">
            <div><dt>Won</dt><dd>{rec.won}</dd></div>
            <div><dt>Lost</dt><dd>{rec.lost}</dd></div>
            <div><dt>Win rate</dt><dd>{Math.round((100 * rec.won) / rec.resolved)}%</dd></div>
            <div><dt>All-time</dt><dd className={rec.profit >= 0 ? "money" : "loss"}>{signedShort(rec.profit)}</dd></div>
            <div><dt>Biggest win</dt><dd className="money">{dollars(rec.biggestWin)}</dd></div>
          </dl>
        ) : <p className="note">Not enough history yet. We show a record once a wallet has 20 settled markets.</p>}
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
          {items.length ? <ol className="feed2__list">{items.map(m => <li key={m.id}><MoveCard m={m} follow={followState} trialHref={trial} /></li>)}</ol>
            : <p className="note">No big moves from this wallet{paid ? "" : " more than 30 minutes ago"} yet.</p>}
        </section>
      </main>
    </>
  );
}
