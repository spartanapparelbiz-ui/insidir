/* A market (/market/bulls-vs-76ers-3f9a2c), Kalshi first: its Kalshi twin and price (or that it has none), Polymarket's
 * price, then the watchlist's money per side, the price chart with every millionaire entry on it, every bet, and the
 * related markets. Visitors: the board's rules (no side) and its 60-minute delay; members see everything live. An old
 * id link, a Kalshi ticker or a slug whose words changed opens it too, with the canonical link on the human slug. Not
 * advice. */
import { nearestKalshi } from "@/lib/twins/nearest";
import type { Metadata } from "next";
import { humanLine } from "@/lib/markets/title";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { BetRow } from "@/components/brand/BetRow";
import { Lines, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { Crumbs, KalshiFirst, RelatedLinks } from "@/components/system/Entity";
import { Matchup } from "@/components/system/Team";
import { matchupFor } from "@/lib/teams";
import { Bars, SeriesChart } from "@/components/system/Figures";
import { getViewer } from "@/lib/auth/viewer";
import { category as categoryInfo, categoryPhoto } from "@/lib/brand/categories";
import { getDb, hasDatabase } from "@/lib/db";
import { marketHead, marketView } from "@/lib/entities/market";
import { betPath, marketPath } from "@/lib/entities/slug";
import { resolveMarketSlug } from "@/lib/entities/resolve";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import { ExplainMarket } from "@/components/system/ExplainMarket";
import { explainOn } from "@/lib/analyst/market";
import { EntityLd } from "@/lib/seo/jsonld";
import { BetBriefing } from "@/components/brand/BetBriefing";
import { gateBriefing } from "@/lib/briefing/gate";
import { getBriefing, logTold } from "@/lib/briefing/store";

export const dynamic = "force-dynamic";
const walletsText = (n: number) => n.toLocaleString("en-US") + (n === 1 ? " wallet" : " wallets");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  if (!hasDatabase()) return { title: "Market" };
  const ref = await resolveMarketSlug(getDb(), (await params).slug).catch(() => null);
  const h = ref ? await marketHead(getDb(), ref.id).catch(() => null) : null;
  if (!ref) return { title: "Market", robots: { index: false } };
  const title = h?.title ?? ref.title;
  const description = h && h.total > 0
    ? "Proven $1M+ wallets on “" + title + "”, with the Kalshi price when Kalshi lists it. Every bet, live for members."
    : "“" + title + "”: the Kalshi price when Kalshi lists it, and every bet from wallets up $1M+.";
  return { title: { absolute: `${title}: who's betting · Insidir` }, description, alternates: { canonical: marketPath(ref.id, ref.title) }, openGraph: { title, description } };
}

export default async function MarketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!hasDatabase()) notFound();
  const db = getDb(), now = Date.now();
  const [ref, viewer] = await Promise.all([resolveMarketSlug(db, slug).catch(() => null), getViewer()]);
  if (!ref) notFound();
  const canonical = marketPath(ref.id, ref.title);
  // An old full-id link or a Kalshi ticker opens the same page; its canonical link names the human slug, so search
  // engines keep one address (no 308: retired addresses are 301s, and these aren't retired).
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const m = await marketView(db, ref.id, now, member, ref.title);
  if (!m) notFound();
  const cat = categoryInfo(m.category);
  const won = m.result === "yes" ? m.yesLabel : m.result === "no" ? m.noLabel : null;
  const mil = m.money.millionaire, pro = m.money.pro;
  const milTotal = mil.yes.dollars + mil.no.dollars, proTotal = pro.yes.dollars + pro.no.dollars;
  const share = (t: typeof mil) => (t.yes.dollars + t.no.dollars > 0 ? t.yes.dollars / (t.yes.dollars + t.no.dollars) : 0);
  const sideText = (t: typeof mil, s: "yes" | "no") => dollars(t[s].dollars) + " · " + walletsText(t[s].wallets);
  const n = m.betCount;
  // The product follows proven $1M+ wallets: the page leads with their money; smaller wallets are a footnote for members.
  const provenBets = m.bets.filter(b => b.tier === "millionaire").length;
  const subLine = milTotal > 0 ? `${dollars(milTotal)} from proven $1M+ wallets${provenBets ? `, ${provenBets.toLocaleString("en-US")} ${provenBets === 1 ? "bet" : "bets"}` : ""}.` : n ? "No proven $1M+ wallet has bet on it yet." : "No watchlist wallet has bet on it yet.";
  // A game: both teams' logos (the registry, by the game in the market's URL; a monogram when a team has none).
  const teams = matchupFor(m.url, m.event || m.title);
  // No exact Kalshi twin for a spread or total: the nearest Kalshi lines for the game, labelled as alternatives.
  const near = m.twin ? null : await nearestKalshi(m.url, m.title).catch(() => null);
  const trail = [["Markets", "/markets"], [cat.name, `/markets/${m.category}`], [m.title, canonical]] as const;
  // The Bet Briefing (lib/briefing): gated on the server; left out if it can't be built in a few seconds.
  const briefing = await Promise.race([getBriefing(db, ref.id, now).catch(() => null), new Promise<null>(r => setTimeout(() => r(null), 6000))]);
  if (briefing && member && viewer.user) await logTold(db, viewer.user.id, briefing, now).catch(() => undefined);
  const gated = briefing ? gateBriefing(briefing, member) : null;
  return (
    <Frame member={member} current="markets" testid="market-page">
      {/* Logos never sit on a photo: a game's hero is the plain stage, its two logos the only images. */}
      <Stage bg={teams ? { kind: "globe", dark: 0.6 } : { kind: "photo", photo: categoryPhoto(m.category), dark: 0.55, priority: true }} first testid="market-hero" labelledBy="m-h">
        <div className="b-head">
          <Crumbs trail={trail} />
          {teams ? <Matchup teams={teams} /> : null}
          {m.event && humanLine({ title: m.event }) !== m.title ? <p className="b-label" data-m="lift">{humanLine({ title: m.event })}</p> : null}
          <Lines as="h1" id="m-h" lines={[m.title]} size={m.title.length > 44 ? 40 : 56} />
          <p className="b-sub" data-m="lift" data-testid="market-sub">{subLine}</p>
        </div>
        <div className="s-col">
          <KalshiFirst twin={m.twin} near={near} yesLabel={m.yesLabel} noLabel={m.noLabel} polyYes={m.priceNow} polyUrl={m.url} region={viewer.region} result={won ? won + " won." : m.result === "void" ? "Voided: every bet refunded." : null} />
        </div>
      </Stage>

      <Stage bg={{ kind: "photo", photo: categoryPhoto(m.category), dark: 0.7 }} testid="market-money" labelledBy="money-h">
        <div className="b-head"><Lines as="h2" id="money-h" lines={["Money per side."]} size={48} /></div>
        <Panel className="s-col">
          {member ? (
            <>
              {milTotal > 0 ? <><p className="b-label">Proven wallets, up $1M+</p><Bars label="Proven wallets up $1M+" rows={[{ key: "y", name: m.yesLabel, share: share(mil), text: sideText(mil, "yes") }, { key: "n", name: m.noLabel, share: 1 - share(mil), text: sideText(mil, "no") }]} /></> : <p className="b-small">No proven $1M+ wallet has bet on it.</p>}
              {proTotal > 0 ? <><p className="b-label">Smaller wallets, up $100K+ (not followed)</p><Bars label="Wallets up $100K+" rows={[{ key: "y", name: m.yesLabel, share: share(pro), text: sideText(pro, "yes") }, { key: "n", name: m.noLabel, share: 1 - share(pro), text: sideText(pro, "no") }]} /></> : null}
              {explainOn() && (milTotal > 0 || proTotal > 0) ? <ExplainMarket marketId={ref.id} /> : null}
            </>
          ) : (
            <>
              {milTotal > 0 ? <p className="b-small" data-locked="split">{dollars(milTotal)} from proven $1M+ wallets. Members see which side it is on.</p> : <p className="b-small">No proven $1M+ wallet has bet on it yet.</p>}
              <div className="b-ctas"><Pill href="/go" data-checkout="market">Start for $1</Pill></div>
            </>
          )}
        </Panel>
      </Stage>

      {gated ? (
        <Stage bg={{ kind: "globe", dark: 0.65 }} testid="market-briefing" labelledBy="briefing-h">
          <div className="b-head"><Lines as="h2" id="briefing-h" lines={["Bet Briefing."]} size={48} /><p className="b-sub">Before you bet: what it takes to win, who&apos;s on each side, and what the money says.</p></div>
          <Panel className="s-col"><BetBriefing b={gated} /></Panel>
        </Stage>
      ) : null}

      {m.chart.length >= 2 ? (
        <Stage bg={{ kind: "globe", dark: 0.6 }} testid="market-chart" labelledBy="chart-h">
          <div className="b-head"><Lines as="h2" id="chart-h" lines={[`${m.yesLabel} on Polymarket.`]} size={48} />{member ? <p className="b-sub">Each dot is a millionaire entry, sized by its money.</p> : null}</div>
          <Panel className="s-col"><SeriesChart points={m.chart} dots={m.dots} fmt="cents" label={`${m.yesLabel}'s price`} testid="market-price-chart" /></Panel>
        </Stage>
      ) : null}

      <Stage bg={{ kind: "globe", dark: 0.7 }} testid="market-bets" labelledBy="bets-h">
        <div className="b-head"><Lines as="h2" id="bets-h" lines={["Every bet."]} size={48} />{member ? null : <p className="b-sub">60 minutes late, without the side. Members see each one live.</p>}</div>
        {m.bets.length ? (
          <ul className="b-rows s-board" data-testid="market-bet-rows">{m.bets.slice(0, 100).map(b => <li key={b.id} data-entity="bet"><BetRow polymarket={viewer.region === "non_us"} bet={b} now={now} href={betPath(b.id)} /></li>)}</ul>
        ) : <p className="b-empty b-center">{member ? "No bets yet." : "No bets older than an hour yet."}</p>}
      </Stage>

      {m.related.length ? (
        <Stage bg={{ kind: "globe", dark: 0.7 }} testid="market-related" labelledBy="rel-h">
          <div className="b-head"><Lines as="h2" id="rel-h" lines={["Related markets."]} size={48} /></div>
          <Panel className="s-col"><RelatedLinks kind="market" items={m.related.map(r => ({ href: r.href, title: r.title, sub: `${dollars(r.total)} from the watchlist` }))} /></Panel>
        </Stage>
      ) : null}
      <p className="b-small b-center">Information, not advice. Millionaires lose bets too. Insidir never places a bet or holds money.</p>
      <EntityLd trail={trail.map(([a, b]) => [a, b] as [string, string])} name={m.title} path={canonical} description={"Every bet from proven $1M+ wallets on “" + m.title + "”, and the Kalshi price."} sources={["https://kalshi.com"]} />
      <ScrollFx />
    </Frame>
  );
}
