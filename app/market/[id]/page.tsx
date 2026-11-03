/* A market, in the homepage's stages: the market as the subject (its own image when there is one, the question, the price
 * now or its result, Follow, the venue link by location), then a stage per finding, each opening with a computed
 * sentence: proven traders vs. the price, the price line with every large position on it, money by side and who holds
 * each, and the latest large positions. Earlier notes:
 * A market: the question, the price now (or its result once settled) and Follow market; then the venue's price
 * history with every big move plotted on it (a dot per move, sized by amount, green won, red lost), money by side
 * (all big moves and the last 24 hours), the top traders on each side, and the big money of the last 24 hours. The
 * market link follows the location rules (lib/moves/links.ts). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { humanLine } from "@/lib/markets/title";
import Image from "next/image";
import { unlockHref } from "@/components/app/links";
import { Frame } from "@/components/brand/app/Frame";
import { Insight, Lines, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { Bars, Rows, SeriesChart, StatTiles } from "@/components/system/Figures";
import { categoryPhoto, isCategory } from "@/lib/brand/categories";
import { PHOTOS } from "@/lib/brand/images";
import { artFor, logosOff } from "@/lib/market/art";
import { TRIAL } from "@/lib/plans";
import { FollowLink } from "@/components/desk/Act";
import { MarketLinkButton } from "@/components/v2/LocationPill";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { dollars } from "@/lib/moves/copy";
import { feedItems } from "@/lib/moves/feed";
import { movePlan } from "@/lib/moves/gate";
import { marketLink } from "@/lib/moves/links";
import { currentPrice } from "@/lib/moves/pages";
import { followList, kalshiMatches, listMoves, storedMarket } from "@/lib/moves/store";
import { isPaid } from "@/lib/plans";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { infoFor, priceHistory } from "@/lib/markets/info";
import { memo } from "@/lib/memo";
import { walletLabel } from "@/lib/moves/records";
import type { Move } from "@/lib/moves/types";
import { marketSmart, splitsFor } from "@/lib/smart/store";
import { positioningOn } from "@/lib/smart/gate";
import { SMART_MIN_MONEY, SMART_MIN_WALLETS } from "@/lib/smart/splits";
import { EntityLd } from "@/lib/seo/jsonld";
import { TRACKERS } from "@/lib/trackers";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const id = decodeURIComponent((await params).id);
  const m = /^[\w.\-:]{3,120}$/.test(id) && hasDatabase() ? await storedMarket(getDb(), id.startsWith("0x") ? "polymarket" : "kalshi", id).catch(() => null) : null;
  return m?.title ? { title: { absolute: `${m.title}: large positions and who holds each side · Insidir` }, description: `Every large position on "${m.title}" on ${id.startsWith("0x") ? "Polymarket" : "Kalshi"}: who holds each side, their verified records, and the price chart.`, alternates: { canonical: `/market/${encodeURIComponent(id)}` } }
    : { title: "Market", robots: { index: false } };
}

/** A dot per big move on the YES price line: a NO bet at 30¢ is plotted at YES 70¢. Sized by amount (3–12px). */
function dotsOf(moves: readonly Move[]): Array<{ t: number; v: number; r: number; label: string }> {
  const max = Math.max(1, ...moves.map(m => m.amount));
  return moves.filter(m => m.avgPrice > 0 && m.avgPrice < 1).map(m => ({
    t: m.at, v: m.outcomeSide === "yes" ? m.avgPrice : 1 - m.avgPrice, r: 3 + 9 * Math.sqrt(m.amount / max),
    label: `${dollars(m.amount)} on ${m.outcome} at ${Math.round(m.avgPrice * 100)}¢`,
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
  const viewer = await getViewer();
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
  const title = humanLine({ title: market?.title ?? moves[0]?.marketTitle ?? anySplit!.title });
  const trackersHere = TRACKERS.filter(t => moves.some(m => (m.trackers ?? []).includes(t.slug))).slice(0, 8);
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
  // The split stored by the worker (lib/smart/store.ts) when the live numbers are not in hand.
  const crowdNow = price ?? smart?.cur ?? split?.crowd?.crowd ?? null;
  const proven = smart?.smart ?? null;
  const provenMoney = proven ? proven.yes + proven.no : 0;
  const bigAll = smart?.big ?? null;
  const bigShare = bigAll && bigAll.yes + bigAll.no > 0 ? bigAll.yes / (bigAll.yes + bigAll.no) : null;
  const opposite = tab === "sports" && bigShare !== null && proven?.share != null && (bigShare - 0.5) * (proven.share - 0.5) < 0;
  const art = source === "polymarket" ? await artFor([id]).then(m => m.get(id) ?? null).catch(() => null) : null;
  const showArt = art?.image && !(logosOff() && tab === "sports") ? art.image : null;
  const c = (v: number | null | undefined) => (v === null || v === undefined ? "" : `${Math.round(v * 100)}¢`);
  // The live quote, else the last price the worker stored for this market.
  const shown = price ?? (typeof info?.yesPrice === "number" ? info.yesPrice : null);
  const lead = settled && resultSide ? `${resultSide === "yes" ? yesLabel : noLabel} won.` : null;
  const provenShare = proven?.share ?? split?.crowd?.smart ?? null;
  const smartLine = provenShare !== null && crowdNow !== null ? `Proven traders are ${Math.round(provenShare * 100)}% on ${yesLabel}. The price says ${c(crowdNow)}.` : null;
  const p0 = points[0]?.v ?? null, p1 = price ?? points.at(-1)?.v ?? null;
  const priceLine = p0 !== null && p1 !== null && points.length >= 2 ? `${yesLabel} went from ${c(p0)} to ${c(p1)}.` : null;
  const sideLine = yes.total + no.total > 0 ? `${dollars(yes.total)} of large money on ${yesLabel}, ${dollars(no.total)} on ${noLabel}.` : null;
  const traderRows = (l: ReturnType<typeof side>["top"]) => l.map(x => ({
    key: x.wallet, title: paid ? <a className="s-link" href={`/p/${x.wallet}`}>{walletLabel(x.wallet, x.name)}</a> : walletLabel(x.wallet, x.name),
    sub: `${x.n.toLocaleString("en-US")} ${x.n === 1 ? "position" : "positions"}`, right: dollars(x.amount) }));
  return (
    <Frame member={paid} current="markets" testid="market-page">
      <Stage bg={{ kind: "photo", photo: categoryPhoto(isCategory(market?.category) ? market!.category : tab === "sports" ? "football" : "markets"), dark: 0.55, priority: true }} first testid="market-hero" labelledBy="m-h">
        <div className="b-head">
          {showArt ? <span className="s-disc s-disc--lg" data-m="lift"><Image src={showArt} alt="" width={88} height={88} sizes="176px" quality={85} /></span> : null}
          {event && event !== title ? <p className="b-label" data-m="lift">{event}</p> : null}
          <Lines as="h1" id="m-h" lines={[title]} size={title.length > 48 ? 40 : 56} />
          {lead ? <p className="b-sub" data-m="lift">Settled: {lead}</p>
            : shown !== null ? <p className="s-ticket__px s-center" data-m="lift"><span className="s-big b-num" data-count={Math.round(shown * 100)} data-fmt="cents">{c(shown)}</span><span className="b-small">{yesLabel} now · {noLabel} {c(1 - shown)}</span></p> : null}
        </div>
        <div className="b-center"><div className="b-ctas">
          {paid ? <FollowLink wallet={id} kind="market" initial={following} labels={["Follow this market", "Following this market"]} /> : <Pill href="/go" data-checkout="market">Start for ${TRIAL.fee} to follow</Pill>}
          {link || viewer.region === null ? <MarketLinkButton href={link?.href ?? null} label={link?.label ?? "See market"} regionKnown={viewer.region !== null} className="b-btn b-btn-lg b-ghost" /> : null}
        </div></div>
        <p className="b-small b-center" data-testid="settlement">Settles by {source === "polymarket" ? "Polymarket" : "Kalshi"}&apos;s resolution of this market; that venue is the source of record. {paid ? "Live." : "Large positions 30 minutes late."} Information, not advice.</p>
      </Stage>

      {source === "polymarket" && !settled && smartLine ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.markets, dark: 0.6 }} testid="market-smart" labelledBy="smart-h">
          <div className="b-head"><Insight id="smart-h" as="h2" text={smartLine} fallback={["Proven traders", "vs. the market."]} size={52} />
            <p className="b-sub">{proven && proven.wallets ? `${proven.wallets.toLocaleString("en-US")} proven ${proven.wallets === 1 ? "trader holds" : "traders hold"} ${dollars(provenMoney)} here. Proven: 20+ settled markets and a win rate above the prices they paid.` : `No proven trader holds this market right now. It needs ${SMART_MIN_WALLETS}+ of them and ${dollars(SMART_MIN_MONEY)}+ in.`}</p></div>
          <Panel className="s-col s-col--wide">
            <Bars label={`Share on ${yesLabel}`} rows={[
              { key: "crowd", name: "The price", share: crowdNow ?? 0, text: crowdNow !== null ? c(crowdNow) : "Not available" },
              { key: "smart", name: "Proven traders", share: provenShare ?? 0, text: provenShare !== null ? `${Math.round(provenShare * 100)}% of their money` : "Not enough yet" },
              ...(tab === "sports" && bigShare !== null ? [{ key: "big", name: "All large positions", share: bigShare, text: `${Math.round(bigShare * 100)}% of the money` }] : []),
            ]} />
            {opposite ? <p className="b-small" data-testid="split-opposite">Large positions and proven traders are on opposite sides of this game.</p> : null}
            {split?.crowd && (positioningOn() || paid) ? <p className="b-small">{Math.round(split.crowd.gap)} points apart. <a className="s-link" href="/splits">Every split</a></p> : null}
          </Panel>
        </Stage>
      ) : null}

      {points.length >= 2 ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.tech, dark: 0.6 }} testid="market-price" labelledBy="chart-h">
          <div className="b-head"><Insight id="chart-h" as="h2" text={priceLine} fallback={["The price."]} size={52} />
            <p className="b-sub">{fromVenue ? `The price of ${yesLabel}` : `The entries of large positions on ${yesLabel}`}, with every large position on it: a gold dot per position, bigger for more money ({noLabel} positions sit at 100¢ minus their entry).</p></div>
          <Panel className="s-col s-col--wide"><SeriesChart fmt="cents" points={points} label={`${yesLabel}, price`} testid="price-chart"
            dots={dots.map(d => ({ t: d.t, v: d.v, r: 4 + d.r, title: d.label }))} /></Panel>
        </Stage>
      ) : null}

      <Stage bg={{ kind: "photo", photo: PHOTOS.golf, dark: 0.6 }} testid="market-sides" labelledBy="side-h">
        <div className="b-head"><Insight id="side-h" as="h2" text={sideLine} fallback={["Money by side."]} size={52} /><p className="b-sub">Every large position we&apos;ve seen in this market.</p></div>
        <StatTiles label="Money by side" tiles={[
          { label: `On ${yesLabel}, all large positions`, value: dollars(yes.total) },
          { label: `On ${noLabel}, all large positions`, value: dollars(no.total) },
          { label: `On ${yesLabel}, last 24 hours`, value: dollars(yes24.total) },
          { label: `On ${noLabel}, last 24 hours`, value: dollars(no24.total) },
        ]} />
        {yes.top.length || no.top.length ? (
          <div className="s-split">
            {yes.top.length ? <Panel><p className="b-label">Biggest on {yesLabel}</p><Rows label={`Top traders on ${yesLabel}`} rows={traderRows(yes.top)} /></Panel> : null}
            {no.top.length ? <Panel><p className="b-label">Biggest on {noLabel}</p><Rows label={`Top traders on ${noLabel}`} rows={traderRows(no.top)} /></Panel> : null}
          </div>
        ) : null}
      </Stage>

      {items.length ? (
        <Stage bg={{ kind: "photo", photo: PHOTOS.oil, dark: 0.65 }} testid="market-moves" labelledBy="mm-h">
          <div className="b-head"><Insight id="mm-h" as="h2" text={null} fallback={day.length ? ["The last 24 hours."] : ["Every large position."]} size={52} />{!paid ? <p className="b-sub">You&apos;re seeing positions 30 minutes late.</p> : null}</div>
          <Panel className="s-col s-col--wide">
            <Rows label="Large positions" rows={items.map(m => ({ key: m.id, attrs: { "data-move": m.id }, title: m.sentence,
              sub: <>{m.who.href && paid ? <a className="s-link" href={m.who.href}>Their record</a> : null}{m.who.href && paid ? " · " : null}{m.ago}{m.analyst ? <><br /><span data-testid="analyst-note">Analyst note: {m.analyst.text}</span></> : null}</>,
              right: m.result === "won" ? "Won" : m.result === "lost" ? "Lost" : m.result === "void" ? "Void" : undefined }))} />
          </Panel>
          {trackersHere.length ? <div className="b-center"><p className="b-small">Trackers holding this market</p><div className="s-filters">{trackersHere.map(t => <Pill key={t.slug} href={`/trackers/${t.slug}`} kind="panel" arrow={false}>{t.name}</Pill>)}</div></div> : null}
        </Stage>
      ) : null}
      <ScrollFx />
      <EntityLd trail={[[source === "polymarket" ? "Prediction markets" : "Markets", "/markets"], [title, `/market/${encodeURIComponent(id)}`]]} name={`${title}: large positions`} path={`/market/${encodeURIComponent(id)}`}
        description={`Large positions on "${title}" on ${source === "polymarket" ? "Polymarket" : "Kalshi"}, with who holds each side.`} updated={moves[0]?.at ?? null} sources={[source === "polymarket" ? "https://polygonscan.com" : "https://kalshi.com"]} />
    </Frame>
  );
}
