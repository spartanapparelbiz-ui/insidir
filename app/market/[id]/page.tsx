/* A market: the question, the price now (or its result once settled) and Follow market; then the venue's price
 * history with every big move plotted on it (a dot per move, sized by amount, green won, red lost), money by side
 * (all big moves and the last 24 hours), the top traders on each side, and the big money of the last 24 hours. The
 * market link follows the location rules (lib/moves/links.ts). */
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
import { dollars } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { marketLink } from "@/lib/moves/links";
import { currentPrice } from "@/lib/moves/pages";
import { followList, kalshiMatches, listMoves, storedMarket } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";
import Link from "next/link";
import { LineChart, type ChartDot } from "@/components/charts/LineChart";
import { Section, Table, Tiles } from "@/components/stats/Stats";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { infoFor, priceHistory } from "@/lib/markets/info";
import { memo } from "@/lib/memo";
import { walletLabel } from "@/lib/moves/records";
import type { Move } from "@/lib/moves/types";
import { SplitBars } from "@/components/smart/SplitBars";
import { marketSmart, splitsFor } from "@/lib/smart/store";
import { positioningOn } from "@/lib/smart/gate";
import { SMART_MIN_MONEY, SMART_MIN_WALLETS } from "@/lib/smart/splits";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Market", robots: { index: false } };

/** A dot per big move on the YES price line: a NO bet at 30¢ is plotted at YES 70¢. Sized by amount (3–12px). */
function dotsOf(moves: readonly Move[]): ChartDot[] {
  const max = Math.max(1, ...moves.map(m => m.amount));
  return moves.filter(m => m.avgPrice > 0 && m.avgPrice < 1).map(m => ({
    t: m.at, v: m.outcomeSide === "yes" ? m.avgPrice : 1 - m.avgPrice, r: 3 + 9 * Math.sqrt(m.amount / max),
    label: `${dollars(m.amount)} on ${m.outcome} at ${Math.round(m.avgPrice * 100)}%`, tone: m.result === "won" ? "won" as const : m.result === "lost" ? "lost" as const : "open" as const,
  }));
}

/** Money and wallets on one side: total, and the biggest traders by money in. */
function side(moves: readonly Move[], s: "yes" | "no") {
  const l = moves.filter(m => m.outcomeSide === s);
  const by = new Map<string, { wallet: string; name: string | null; amount: number; n: number }>();
  for (const m of l) if (m.wallet) { const x = by.get(m.wallet) ?? { wallet: m.wallet, name: m.walletName, amount: 0, n: 0 }; x.amount += m.amount; x.n++; by.set(m.wallet, x); }
  return { total: l.reduce((a, m) => a + m.amount, 0), n: l.length, top: [...by.values()].sort((a, b) => b.amount - a.amount).slice(0, 5) };
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
  const [moves, market, follows, matches, infos] = await Promise.all([
    listMoves(db, { marketId: id, until, limit: 200 }), storedMarket(db, source, id),
    viewer.user ? followList(db, viewer.user.id) : Promise.resolve([]),
    source === "polymarket" && viewer.region !== "non_us" ? kalshiMatches(db, [id]) : Promise.resolve(new Map<string, string>()),
    infoFor(db, source, [id]).catch(() => new Map()),
  ]);
  const [split, smart] = source === "polymarket" ? await Promise.all([splitsFor(db, [id]).then(m => m.get(id) ?? null), marketSmart(db, id, now)]) : [null, null];
  const anySplit = split?.crowd ?? split?.bigmoney ?? null;
  if (!moves.length && !market && !anySplit) notFound();
  const info = infos.get(id) ?? null;
  const title = market?.title ?? moves[0]?.marketTitle ?? anySplit!.title;
  const event = market?.eventTitle ?? moves[0]?.eventTitle ?? anySplit?.subtitle ?? null;
  const yesLabel = market?.yesLabel ?? moves.find(m => m.outcomeSide === "yes")?.outcome ?? (anySplit?.detail.yesLabel as string | undefined) ?? smart?.outcomes[0] ?? "Yes";
  const noLabel = market?.noLabel ?? moves.find(m => m.outcomeSide === "no")?.outcome ?? (anySplit?.detail.noLabel as string | undefined) ?? smart?.outcomes[1] ?? "No";
  const tab = moves[0]?.tab ?? anySplit?.tab ?? (market?.category === "sports" ? "sports" : "markets");
  const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };
  const first = moves.length ? Math.min(...moves.map(m => m.at)) : now - 30 * 86_400_000;
  const [price, history] = await Promise.all([
    currentPrice(source, market, id),
    memo(`history:${source}:${id}`, 5 * 60_000, () => priceHistory(clients, source, id, info ?? (market?.yesTokenId ? { source, marketId: id, yesPrice: null, startAt: null, closed: false, historyKey: market.yesTokenId, updatedAt: now } : null), first - 86_400_000, now)).catch(() => []),
  ]);
  const link = marketLink({ source, url: market?.url ?? moves[0]?.url ?? null }, viewer.region, matches.get(id) ?? null);
  const day = moves.filter(m => m.at >= now - 86_400_000);
  const items = await feedItems(db, (day.length ? day : moves).slice(0, 12), viewer.plan, viewer.region, now);
  const trial = unlockHref();
  const following = follows.some(f => f.kind === "market" && f.target === id);
  const settled = moves.find(m => m.result)?.result ?? null;
  const resultSide = settled ? moves.find(m => m.result === "won")?.outcomeSide ?? (moves.find(m => m.result === "lost")?.outcomeSide === "yes" ? "no" : "yes") : null;
  const yes = side(moves, "yes"), no = side(moves, "no");
  const yes24 = side(day, "yes"), no24 = side(day, "no");
  // The venue's history; without it, the prices the big moves paid (on the YES scale), oldest first.
  const fromVenue = history.length >= 2;
  const points = fromVenue ? history.map(p => ({ t: p.t, v: p.p }))
    : [...moves].filter(m => m.avgPrice > 0 && m.avgPrice < 1).sort((a, b) => a.at - b.at).map(m => ({ t: m.at, v: m.outcomeSide === "yes" ? m.avgPrice : 1 - m.avgPrice }));
  const dots = dotsOf(moves);
  // Smart money vs. the crowd: the price now against proven traders' money, both for YES; games also all big bets.
  const crowdNow = price ?? smart?.cur ?? null;
  const proven = smart?.smart ?? null;
  const provenMoney = proven ? proven.yes + proven.no : 0;
  const bigAll = smart?.big ?? null;
  const bigShare = bigAll && bigAll.yes + bigAll.no > 0 ? bigAll.yes / (bigAll.yes + bigAll.no) : null;
  const opposite = tab === "sports" && bigShare !== null && proven?.share != null && (bigShare - 0.5) * (proven.share - 0.5) < 0;
  const traderRows = (l: ReturnType<typeof side>["top"]) => l.map(x => [
    paid ? <Link key="n" className="dtable__link" href={`/p/${x.wallet}`}>{walletLabel(x.wallet, x.name)}</Link> : walletLabel(x.wallet, x.name),
    x.n.toLocaleString("en-US"), dollars(x.amount)]);
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer.user)} plan={viewer.plan} trialHref={trial} current="/market" />
      <main className="wrap app2 market">
        <header className="mhead">
          {event && event !== title ? <p className="mhead__kicker">{event}</p> : null}
          <h1 className="mhead__h">{title}</h1>
          {settled && resultSide ? <p className="mhead__result"><span className="rpill rpill--won">Settled</span> {resultSide === "yes" ? yesLabel : noLabel} won.</p>
            : price !== null ? <p className="mhead__now">{yesLabel} {Math.round(price * 100)}% · {noLabel} {Math.round((1 - price) * 100)}% <span>now</span></p> : null}
          <div className="mhead__act">
            <FollowButton kind="market" target={id} label="Follow market" state={!isReady("follows") ? "soon" : !paid ? "locked" : following ? "on" : "off"} trialHref={trial} />
            {link || viewer.region === null ? <MarketLinkButton href={link?.href ?? null} label={link?.label ?? "See market"} regionKnown={viewer.region !== null} /> : null}
          </div>
        </header>

        {source === "polymarket" && !settled ? (
          <Section id="smart-h" title="Proven traders vs. the market" note={proven && proven.wallets
            ? `${proven.wallets.toLocaleString("en-US")} proven ${proven.wallets === 1 ? "trader holds" : "traders hold"} ${dollars(provenMoney)} here. Proven: 20+ settled markets and a win rate above the prices they paid. Data, not a recommendation.`
            : `No proven trader holds this market right now (proven: 20+ settled markets and a win rate above the prices they paid). It needs ${SMART_MIN_WALLETS}+ of them and ${dollars(SMART_MIN_MONEY)}+ in.`}>
            <SplitBars side={yesLabel} rows={[
              { label: "Crowd", note: "the price now", value: crowdNow },
              { label: "Smart money", note: "proven traders' money", value: proven?.share ?? null, strong: true },
              ...(tab === "sports" && bigShare !== null ? [{ label: "All large positions", note: "every large position we track", value: bigShare }] : []),
            ]} />
            {opposite ? <p className="sflag" data-testid="split-opposite">Large positions and proven traders are on opposite sides of this game.</p> : null}
            {split?.crowd && (positioningOn() || isPaid(viewer.plan)) ? <p className="dnote dnote--tight">{Math.round(split.crowd.gap)} points apart. <Link href="/splits">See every split</Link> · <Link href="/splits/scorecard">How past splits went</Link></p> : null}
          </Section>
        ) : null}

        <Section id="chart-h" title="Price" note={`${fromVenue ? `The price of ${yesLabel}` : `The entries of large positions on ${yesLabel} (the venue's full history isn't available right now)`}, with every large position on it: a dot per position, bigger for more money (a ${noLabel} position sits at 100% minus its entry). Green won, red lost, grey open.`}>
          <LineChart points={points} dots={dots} format="cents" baseline="first" time label={`${yesLabel}, price`}
            windows={[{ key: "1d", label: "1D", since: now - 86_400_000 }, { key: "1w", label: "1W", since: now - 7 * 86_400_000 }, { key: "1m", label: "1M", since: now - 30 * 86_400_000 }, { key: "all", label: "All", since: null }]}
            empty="Not enough prices for a chart yet." />
        </Section>

        <Section id="side-h" title="Money by side" note="Every large position we've seen in this market.">
          <Tiles cols={4} label="Money by side" tiles={[
            { label: `On ${yesLabel}, all large positions`, value: dollars(yes.total) },
            { label: `On ${noLabel}, all large positions`, value: dollars(no.total) },
            { label: `On ${yesLabel}, last 24 hours`, value: dollars(yes24.total) },
            { label: `On ${noLabel}, last 24 hours`, value: dollars(no24.total) },
          ]} />
        </Section>

        {yes.top.length || no.top.length ? (
          <Section id="top-h" title="Top traders on each side" note="By money in, from their large positions here.">
            <div className="dgrid2">
              <div><h3 className="dsub__h">{yesLabel}</h3>{yes.top.length ? <Table label={`Top traders on ${yesLabel}`} head={["Trader", "Positions", "Money in"]} numeric={[1, 2]} rows={traderRows(yes.top)} /> : <p className="dnote">No big money on {yesLabel} yet.</p>}</div>
              <div><h3 className="dsub__h">{noLabel}</h3>{no.top.length ? <Table label={`Top traders on ${noLabel}`} head={["Trader", "Positions", "Money in"]} numeric={[1, 2]} rows={traderRows(no.top)} /> : <p className="dnote">No big money on {noLabel} yet.</p>}</div>
            </div>
          </Section>
        ) : null}

        <Section id="mm-h" title={day.length ? "Large positions in the last 24 hours" : "Large positions in this market"} note={!paid ? "You're seeing positions 30 minutes late." : undefined}>
          {items.length ? <ol className="feed2__list tmoves">{items.map(m => <li key={m.id}><MoveCard m={m} follow={!isReady("follows") ? "soon" : !paid ? "locked" : "off"} trialHref={trial} /></li>)}</ol>
            : <p className="dnote">No large positions here{paid ? "" : " more than 30 minutes ago"} yet.</p>}
        </Section>
      </main>
    </>
  );
}
