/* A market (/market/bulls-vs-76ers-3f9a2c), in the terminal, Kalshi first: a page head (breadcrumb, the matchup, the
 * title, the $1M+ money line), then numbered panels: the price (Kalshi beside Polymarket as bid boxes with probability
 * bars, or that Kalshi has no twin), the watchlist's money per side, the price chart with every millionaire entry on it,
 * the Bet Briefing, every bet, and the related markets. Visitors: the board's rules (no side) and its 60-minute delay;
 * members see everything live. An old id link, a Kalshi ticker or a slug whose words changed opens it too, with the
 * canonical link on the human slug. Not advice. */
import { nearestKalshi } from "@/lib/twins/nearest";
import type { Metadata } from "next";
import { humanLine } from "@/lib/markets/title";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { BetRow } from "@/components/brand/BetRow";
import { Pill, ScrollFx } from "@/components/system";
import { Crumbs, KalshiFirst, RelatedLinks, TermHead } from "@/components/system/Entity";
import { Matchup } from "@/components/system/Team";
import { matchupFor } from "@/lib/teams";
import { Bars, SeriesChart } from "@/components/system/Figures";
import { Panel as TPanel, PanelGrid } from "@/components/terminal/Panel";
import { getViewer } from "@/lib/auth/viewer";
import { category as categoryInfo } from "@/lib/brand/categories";
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
import "../../pages-terminal.css";

export const dynamic = "force-dynamic";
const walletsText = (n: number) => n.toLocaleString("en-US") + (n === 1 ? " wallet" : " wallets");
const SOURCE = "Polymarket public data · Kalshi market data where twinned";

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
  let k = 0;
  const next = () => ++k;
  const shown = m.bets.slice(0, 100);
  return (
    <Frame member={member} current="markets" testid="market-page">
      <div className="t-wrap t-page">
        <TermHead testid="market-hero" id="m-h" title={m.title}
          crumbs={<Crumbs trail={trail} />}
          label={<>{cat.name}{m.event && humanLine({ title: m.event }) !== m.title ? ` · ${humanLine({ title: m.event })}` : ""}</>}
          sub={<span data-testid="market-sub">{subLine}</span>}>
          {teams ? <Matchup teams={teams} /> : null}
        </TermHead>
        <PanelGrid>
          <TPanel n={next()} title="Price · Kalshi first" meta={m.priceNow !== null ? `POLYMARKET ${m.yesLabel.toUpperCase()} ${Math.round(m.priceNow * 100)}¢` : "NO PRICE YET"} span={2} source={SOURCE} fetchedAt={now}>
            <KalshiFirst twin={m.twin} near={near} yesLabel={m.yesLabel} noLabel={m.noLabel} polyYes={m.priceNow} polyUrl={m.url} region={viewer.region} result={won ? won + " won." : m.result === "void" ? "Voided: every bet refunded." : null} />
          </TPanel>

          <TPanel n={next()} title="Money per side" meta={member ? "PROVEN $1M+ WALLETS" : "SIDE FOR MEMBERS"} source="Polymarket public data (positions of watched wallets)" testid="market-money">
            {member ? (
              <>
                {milTotal > 0 ? <><p className="t-label">Proven wallets, up $1M+</p><Bars label="Proven wallets up $1M+" rows={[{ key: "y", name: m.yesLabel, share: share(mil), text: sideText(mil, "yes") }, { key: "n", name: m.noLabel, share: 1 - share(mil), text: sideText(mil, "no") }]} /></> : <p className="t-empty">No proven $1M+ wallet has bet on it.</p>}
                {proTotal > 0 ? <><p className="t-label">Smaller wallets, up $100K+ (not followed)</p><Bars label="Wallets up $100K+" rows={[{ key: "y", name: m.yesLabel, share: share(pro), text: sideText(pro, "yes") }, { key: "n", name: m.noLabel, share: 1 - share(pro), text: sideText(pro, "no") }]} /></> : null}
                {explainOn() && (milTotal > 0 || proTotal > 0) ? <ExplainMarket marketId={ref.id} /> : null}
              </>
            ) : (
              <>
                {milTotal > 0 ? <p className="t-strongline" data-locked="split">{dollars(milTotal)} from proven $1M+ wallets. Members see which side it is on.</p> : <p className="t-empty">No proven $1M+ wallet has bet on it yet.</p>}
                <div className="b-ctas"><Pill href="/go" data-checkout="market">Start for $1</Pill></div>
              </>
            )}
          </TPanel>

          <TPanel n={next()} title={`${m.yesLabel} on Polymarket`} meta={member ? "DOTS: $1M+ ENTRIES, SIZED BY MONEY" : undefined} span={3} source="Polymarket price history (CLOB)" testid="market-chart"
            empty={m.chart.length >= 2 ? null : "No price history for this market yet."}>
            <SeriesChart points={m.chart} dots={m.dots} fmt="cents" label={`${m.yesLabel}'s price`} testid="market-price-chart" />
          </TPanel>

          {gated ? (
            <TPanel n={next()} title="Bet Briefing" meta={member ? "BEFORE YOU BET" : "FIRST LINE FREE"} span={3} source="Insidir's data · Polymarket rules · Kalshi where twinned" testid="market-briefing">
              <BetBriefing b={gated} />
            </TPanel>
          ) : null}

          <TPanel n={next()} title="Every bet" meta={`${shown.length} ${shown.length === 1 ? "ROW" : "ROWS"}${member ? " · LIVE" : " · 60 MIN LATE · SIDE FOR MEMBERS"}`} span={3} source="Polymarket public data (trades of $5K+ by wallets Insidir watches)" fetchedAt={now} testid="market-bets">
            {shown.length ? (
              <ul className="b-rows s-board" data-testid="market-bet-rows">{shown.map(b => <li key={b.id} data-entity="bet"><BetRow polymarket={viewer.region === "non_us"} bet={b} now={now} href={betPath(b.id)} /></li>)}</ul>
            ) : <p className="t-empty">{member ? "No bets yet." : "No bets older than an hour yet."}</p>}
          </TPanel>

          {m.related.length ? (
            <TPanel n={next()} title="Related markets" meta={`${m.related.length}`} span={3} compact testid="market-related">
              <RelatedLinks kind="market" items={m.related.map(r => ({ href: r.href, title: r.title, sub: `${dollars(r.total)} from the watchlist` }))} />
            </TPanel>
          ) : null}
        </PanelGrid>
        <p className="t-disclaim">Information, not advice. Millionaires lose bets too. Insidir never places a bet or holds money.</p>
      </div>
      <EntityLd trail={trail.map(([a, b]) => [a, b] as [string, string])} name={m.title} path={canonical} description={"Every bet from proven $1M+ wallets on “" + m.title + "”, and the Kalshi price."} sources={["https://kalshi.com"]} />
      <ScrollFx />
    </Frame>
  );
}
