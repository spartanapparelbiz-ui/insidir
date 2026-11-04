/* One race (/race/florida-governor-election-winner): each candidate with a verified headshot (or initials; control of a
 * chamber shows a party disc), the price, where the millionaire money sits, the result once it settles; Kalshi first for
 * each candidate's market (its twin and price, or that there is none); every bet; links to every other race. Visitors:
 * the board's rules (60 minutes late, no side) and, outside the three free races, the money per candidate locked.
 * Indexable. Not advice. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Frame } from "@/components/brand/app/Frame";
import { BetRow } from "@/components/brand/BetRow";
import { Lines, Panel, Pill, ScrollFx, Stage } from "@/components/system";
import { Crumbs, KalshiFirst, RelatedLinks } from "@/components/system/Entity";
import { RaceCards } from "@/components/system/Races";
import { getViewer } from "@/lib/auth/viewer";
import { PHOTOS } from "@/lib/brand/images";
import { getDb, hasDatabase } from "@/lib/db";
import { twinOf } from "@/lib/entities/market";
import { raceBySlug, raceHref } from "@/lib/entities/race";
import { betPath, marketPath } from "@/lib/entities/slug";
import { raceName } from "@/lib/market/races";
import { recentBets, VISITOR_DELAY_MS } from "@/lib/millionaires/queries";
import { dollars } from "@/lib/money";
import { isPaid } from "@/lib/plans";
import { EntityLd } from "@/lib/seo/jsonld";

export const dynamic = "force-dynamic";
/** "the House" → "The House" where it starts a heading or a link. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = hasDatabase() ? await raceBySlug(getDb(), (await params).slug, Date.now()).catch(() => null) : null;
  if (!r) return { title: "Race", robots: { index: false } };
  const name = cap(raceName(r.race));
  const lead = r.race.candidates.filter(c => c.price !== null).sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
  const description = `${name}: ${lead ? `${lead.name} at ${Math.round((lead.price ?? 0) * 100)}¢, ` : ""}${dollars(r.race.total)} from wallets up $100K+, the Kalshi price, and every bet.`;
  return { title: { absolute: `${name}: who the millionaires back · Insidir` }, description, alternates: { canonical: raceHref(r.race) }, openGraph: { title: name, description } };
}

export default async function RacePage({ params }: { params: Promise<{ slug: string }> }) {
  if (!hasDatabase()) notFound();
  const db = getDb(), now = Date.now();
  const [{ slug }, viewer] = await Promise.all([params, getViewer()]);
  const found = await raceBySlug(db, slug, now).catch(() => null);
  if (!found) notFound();
  const { race, others, free } = found;
  const member = isPaid(viewer.plan) && Boolean(viewer.user);
  const name = cap(raceName(race));
  const ids = race.candidates.length ? race.candidates.map(c => c.marketId) : race.fallback ? [race.fallback.marketId] : [];
  const [twins, betLists] = await Promise.all([
    twinOf(db, ids).catch(() => new Map()),
    Promise.all(ids.map(id => recentBets(db, { now, marketId: id, all: true, limit: 100, member, delayMs: member ? 0 : VISITOR_DELAY_MS }).catch(() => []))),
  ]);
  const bets = betLists.flat().sort((a, b) => b.at - a.at).slice(0, 60);
  const open = member || free;
  // A locked race: the candidates and their prices (public), never the money on each.
  const shown = open ? race : { ...race, candidates: race.candidates.map(c => ({ ...c, mil: { yes: 0, no: 0 } })) };
  const trail = [["Election", "/election"], [name, raceHref(race)]] as const;
  const cands = race.candidates.length ? race.candidates : [];
  return (
    <Frame member={member} current="election" testid="race-page">
      <Stage bg={{ kind: "photo", photo: PHOTOS.hero, dark: 0.55, priority: true }} first testid="race-hero" labelledBy="race-h">
        <div className="b-head">
          <Crumbs trail={trail} />
          <Lines as="h1" id="race-h" lines={[name]} size={name.length > 30 ? 48 : 64} />
          <p className="b-sub" data-m="lift">{dollars(race.total)} from wallets up $100K+ this week.</p>
        </div>
        {open ? <RaceCards races={[shown]} testid="race-cards" /> : (
          <>
            <ul className="s-lockrows s-wrows s-col" data-testid="race-candidates">{cands.map(c => <li key={c.marketId}><span className="s-strong">{c.name}{c.result ? ` · ${c.result === "won" ? "Won" : "Lost"}` : ""}</span><span className="b-num">{c.price !== null ? `${Math.round(c.price * 100)}¢` : ""}</span></li>)}</ul>
            <div className="s-col">
              <button type="button" className="b-lockrow" data-locked="race"><span className="b-label">The money on each candidate<span className="b-sr">: for members. Start for $1.</span></span><span className="b-blur" aria-hidden="true">$000K on Xxxxx</span><span className="b-lock" aria-hidden="true">Locked</span></button>
              <div className="b-ctas"><Pill href="/go" data-checkout="race">Start for $1</Pill></div>
            </div>
          </>
        )}
      </Stage>

      <Stage bg={{ kind: "globe", dark: 0.6 }} testid="race-kalshi" labelledBy="race-k-h">
        <div className="b-head"><Lines as="h2" id="race-k-h" lines={["On Kalshi."]} size={48} /></div>
        <div className="s-col" style={{ display: "grid", gap: 16 }}>
          {(cands.length ? cands : race.fallback ? [{ marketId: race.fallback.marketId, name: race.fallback.yesLabel, price: race.fallback.priceNow }] : []).map(c => (
            <div key={c.marketId} data-testid="race-candidate-kalshi">
              <p className="b-label">{c.name}</p>
              <KalshiFirst twin={twins.get(c.marketId) ?? null} yesLabel={c.name} noLabel={`Not ${c.name}`} polyYes={c.price} polyUrl={null} region={viewer.region} />
              <p className="b-small"><a className="s-link" href={marketPath(c.marketId, c.name)} data-entity="market">Every bet on {c.name}</a></p>
            </div>
          ))}
        </div>
      </Stage>

      <Stage bg={{ kind: "globe", dark: 0.7 }} testid="race-bets" labelledBy="race-b-h">
        <div className="b-head"><Lines as="h2" id="race-b-h" lines={["Every bet."]} size={48} />{member ? null : <p className="b-sub">60 minutes late, without the side. Members see each one live.</p>}</div>
        {bets.length ? <ul className="b-rows s-board" data-testid="race-bet-rows">{bets.map(b => <li key={b.id} data-entity="bet"><BetRow bet={b} now={now} href={betPath(b.id)} /></li>)}</ul>
          : <p className="b-empty b-center">{member ? "No bets yet." : "No bets older than an hour yet."}</p>}
      </Stage>

      {others.length ? (
        <Stage bg={{ kind: "globe", dark: 0.7 }} testid="race-others" labelledBy="race-o-h">
          <div className="b-head"><Lines as="h2" id="race-o-h" lines={["Other races."]} size={48} /></div>
          <Panel className="s-col"><RelatedLinks kind="race" items={others.map(o => ({ href: raceHref(o), title: cap(raceName(o)), sub: `${dollars(o.total)} from the watchlist` }))} /></Panel>
        </Stage>
      ) : null}
      <p className="b-small b-center">Information, not advice. Millionaires lose bets too. Insidir never places a bet or holds money.</p>
      <EntityLd trail={trail.map(([a, b]) => [a, b] as [string, string])} name={name} path={raceHref(race)} description={`Who the wallets up $1M+ back in ${name}, the Kalshi price, and every bet.`} sources={["https://polymarket.com", "https://kalshi.com"]} />
      <ScrollFx />
    </Frame>
  );
}
