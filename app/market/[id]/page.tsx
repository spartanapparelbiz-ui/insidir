/* A market (docs/INSIDIR-V2.md §6): the event in plain words, the current price as a payout line, "Big money in the last 24h:
 * $1.2M on Yes, $300k on No" from our moves, a simple line of the prices big traders paid, and the big moves here.
 * The market link follows the location rules (lib/moves/links.ts). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { unlockHref } from "@/components/app/links";
import { FollowButton } from "@/components/v2/FollowButton";
import { MarketLinkButton } from "@/components/v2/LocationPill";
import { MoveCard } from "@/components/v2/MoveCard";
import { requireMember } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { dollars, payoutLine } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { marketLink } from "@/lib/moves/links";
import { currentPrice } from "@/lib/moves/pages";
import { followList, kalshiMatches, listMoves, moneyBySide, storedMarket } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";
import { PageBand } from "@/components/PageBand";
import { BAND } from "@/lib/photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Market", robots: { index: false } };

function PriceLine({ points }: { points: Array<{ at: number; price: number }> }) {
  if (points.length < 2) return null;
  const xs = points.map(p => p.at), t0 = Math.min(...xs), t1 = Math.max(...xs);
  const path = points.map((p, i) => `${i ? "L" : "M"}${(((p.at - t0) / Math.max(1, t1 - t0)) * 300).toFixed(1)},${(100 - p.price * 100).toFixed(1)}`).join(" ");
  return (
    <figure className="pline">
      <svg viewBox="0 0 300 100" preserveAspectRatio="none" role="img" aria-label={`Prices big traders paid, from ${Math.round(points[0]!.price * 100)}¢ to ${Math.round(points[points.length - 1]!.price * 100)}¢`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="pline__cap">Prices big traders paid for Yes, oldest to newest.</figcaption>
    </figure>
  );
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  if (!/^[\w.\-:]{3,120}$/.test(id)) notFound();
  const source = id.startsWith("0x") ? "polymarket" : "kalshi";
  const now = Date.now();
  const viewer = await requireMember(`/market/${id}`);
  const paid = isPaid(viewer.plan);
  if (!hasDatabase()) notFound();
  const db = getDb();
  const until = now - movePlan(viewer.plan).delayMs;
  const [moves, market, bySide, follows, matches] = await Promise.all([
    listMoves(db, { marketId: id, until, limit: 30 }), storedMarket(db, source, id), moneyBySide(db, id, new Date(now - 86_400_000)),
    viewer.user ? followList(db, viewer.user.id) : Promise.resolve([]),
    source === "polymarket" && viewer.region !== "non_us" ? kalshiMatches(db, [id]) : Promise.resolve(new Map<string, string>()),
  ]);
  if (!moves.length && !market) notFound();
  const title = market?.title ?? moves[0]!.marketTitle;
  const event = market?.eventTitle ?? moves[0]?.eventTitle ?? null;
  const yesLabel = market?.yesLabel ?? moves.find(m => m.outcomeSide === "yes")?.outcome ?? "Yes";
  const noLabel = market?.noLabel ?? moves.find(m => m.outcomeSide === "no")?.outcome ?? "No";
  const tab = moves[0]?.tab ?? (market?.category === "sports" ? "sports" : "markets");
  const price = await currentPrice(source, market, id);
  const link = marketLink({ source, url: market?.url ?? moves[0]?.url ?? null }, viewer.region, matches.get(id) ?? null);
  const items = await feedItems(db, moves, viewer.plan, viewer.region, now);
  const trial = unlockHref();
  const following = follows.some(f => f.kind === "market" && f.target === id);
  const big = bySide.filter(s => s.total > 0).sort((a, b) => b.total - a.total);
  const points = [...moves].filter(m => m.outcomeSide === "yes").sort((a, b) => a.at - b.at).map(m => ({ at: m.at, price: m.avgPrice }));
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={trial} current="/market" />
      <main className="wrap app2 market dark">
        <PageBand n={BAND.market[tab === "markets" || tab === "stocks" ? tab : "sports"]} title={title} kicker={event && event !== title ? event : undefined} />
        <header className="market__head">
          {price !== null ? (
            <div className="market__pays">
              <p>{payoutLine({ outcome: yesLabel, avgPrice: price, tab })}</p>
              <p>{payoutLine({ outcome: noLabel, avgPrice: 1 - price, tab })}</p>
            </div>
          ) : null}
          {big.length ? <p className="market__big">Big money in the last 24h: {big.map(b => `${dollars(b.total)} on ${b.outcome}`).join(", ")}</p> : null}
          <div className="market__actions">
            {link || viewer.region === null ? <MarketLinkButton href={link?.href ?? null} label={link?.label ?? "See market"} regionKnown={viewer.region !== null} /> : null}
            <FollowButton kind="market" target={id} label="Follow market" state={!isReady("follows") ? "soon" : !paid ? "locked" : following ? "on" : "off"} trialHref={trial} />
          </div>
        </header>
        <PriceLine points={points} />
        <section className="block" aria-labelledby="mm-h">
          <h2 id="mm-h" className="block__h">Big moves in this market</h2>
          {items.length ? <ol className="feed2__list">{items.map(m => <li key={m.id}><MoveCard m={m} follow={!isReady("follows") ? "soon" : !paid ? "locked" : "off"} trialHref={trial} /></li>)}</ol>
            : <p className="note">No big moves here{paid ? "" : " more than 30 minutes ago"} yet.</p>}
        </section>
      </main>
    </>
  );
}
